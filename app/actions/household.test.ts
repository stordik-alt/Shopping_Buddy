import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts (see that
// file's header for why requireHousehold/requireHouseholdId and next/cache need mocking outside
// a real Next.js request). This file additionally exercises the owner-only role check
// (inviteMemberAction/revokeInvitationAction) and acceptInvitationAction, which authorizes off a
// real session (auth.getSession()) rather than requireHousehold — so that gets mocked too.
let currentHousehold = { householdId: '', role: 'owner' as 'owner' | 'member', userId: '' }
let currentSession: { user: { id: string; email: string; name: string } } | null = null

vi.mock('@/lib/auth/authorize', () => ({
  requireHousehold: () => Promise.resolve(currentHousehold),
  requireHouseholdId: () => Promise.resolve(currentHousehold.householdId),
}))
vi.mock('@/lib/auth/server', () => ({ auth: { getSession: () => Promise.resolve({ data: currentSession }) } }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  acceptInvitationAction,
  inviteMemberAction,
  removeChildAction,
  removeHouseholdMemberAction,
  revokeInvitationAction,
  setMemberDietAction,
  updateHouseholdAction,
} from '@/app/actions/household'

const db = getDb()

const createdUserIds: string[] = []
async function anyRealUserId(): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into neon_auth."user" (name, email, "emailVerified") values ('Household test', ${`household-test-${crypto.randomUUID()}@example.com`}, false) returning id`,
  )
  const row = result.rows[0]
  createdUserIds.push(row.id)
  return row.id
}

let householdId: string
let otherHouseholdId: string
const createdHouseholdIds: string[] = []

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_household__' }).returning()
  const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_household_other__' }).returning()
  householdId = household.id
  otherHouseholdId = otherHousehold.id
  createdHouseholdIds.push(householdId, otherHouseholdId)
  currentHousehold = { householdId, role: 'owner', userId: crypto.randomUUID() }
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, id))
    await db.delete(schema.children).where(eq(schema.children.householdId, id))
    await db.delete(schema.invitations).where(eq(schema.invitations.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
  for (const id of createdUserIds) await db.execute(sql`delete from neon_auth."user" where id = ${id}::uuid`)
})

describe('removeHouseholdMemberAction / removeChildAction', () => {
  it('rejects a member id belonging to a different household', async () => {
    const [otherMember] = await db.insert(schema.householdMembers).values({ householdId: otherHouseholdId, name: 'Cizí člen', role: 'member' }).returning()
    await expect(removeHouseholdMemberAction(otherMember.id)).rejects.toThrow('Household member not found')
  })

  it('rejects a child id belonging to a different household', async () => {
    const [otherChild] = await db.insert(schema.children).values({ householdId: otherHouseholdId, name: 'Cizí dítě', age: 5 }).returning()
    await expect(removeChildAction(otherChild.id)).rejects.toThrow('Child not found')
  })

  it('removes a member/child that actually belongs to the caller\'s household', async () => {
    const [member] = await db.insert(schema.householdMembers).values({ householdId, name: 'Vlastní člen', role: 'member' }).returning()
    await removeHouseholdMemberAction(member.id)
    expect(await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.id, member.id) })).toBeUndefined()

    const [child] = await db.insert(schema.children).values({ householdId, name: 'Vlastní dítě', age: 4 }).returning()
    await removeChildAction(child.id)
    expect(await db.query.children.findFirst({ where: eq(schema.children.id, child.id) })).toBeUndefined()
  })
})

describe('inviteMemberAction / revokeInvitationAction', () => {
  it('rejects inviting when the caller is not the owner', async () => {
    currentHousehold = { householdId, role: 'member', userId: crypto.randomUUID() }
    await expect(inviteMemberAction('someone@example.com')).rejects.toThrow('Jen správce domácnosti')
  })

  it('lets the owner invite, and rejects revoking an invitation from a different household even as an owner there', async () => {
    currentHousehold = { householdId, role: 'owner', userId: crypto.randomUUID() }
    const invitation = await inviteMemberAction('someone@example.com')
    expect(invitation.email).toBe('someone@example.com')

    currentHousehold = { householdId: otherHouseholdId, role: 'owner', userId: crypto.randomUUID() }
    await expect(revokeInvitationAction(invitation.id)).rejects.toThrow('Pozvánka nenalezena')

    currentHousehold = { householdId, role: 'owner', userId: crypto.randomUUID() }
    await revokeInvitationAction(invitation.id)
    const row = await db.query.invitations.findFirst({ where: eq(schema.invitations.id, invitation.id) })
    expect(row?.status).toBe('revoked')
  })
})

describe('acceptInvitationAction', () => {
  it('rejects when the signed-in email does not match the invitation', async () => {
    const [invitation] = await db
      .insert(schema.invitations)
      .values({ householdId, email: 'invited@example.com', token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) })
      .returning()
    const userId = await anyRealUserId()
    currentSession = { user: { id: userId, email: 'someone-else@example.com', name: 'Někdo Jiný' } }
    await expect(acceptInvitationAction(invitation.token)).rejects.toThrow('Tato pozvánka je určena')
  })

  it('rejects an account that already belongs to a household', async () => {
    const userId = await anyRealUserId()
    const existing = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, userId) })
    if (!existing) return
    const [invitation] = await db
      .insert(schema.invitations)
      .values({ householdId, email: 'already-member@example.com', token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) })
      .returning()
    currentSession = { user: { id: userId, email: 'already-member@example.com', name: 'Existující Uživatel' } }
    await expect(acceptInvitationAction(invitation.token)).rejects.toThrow('Už jste členem')
  })
})

describe('updateHouseholdAction: budget period start day', () => {
  it('saves the chosen start day for the caller\'s own household only', async () => {
    await updateHouseholdAction({ budgetPeriodStartDay: 28 })
    const own = await db.query.households.findFirst({ where: eq(schema.households.id, householdId) })
    const other = await db.query.households.findFirst({ where: eq(schema.households.id, otherHouseholdId) })
    expect(own?.budgetPeriodStartDay).toBe(28)
    expect(other?.budgetPeriodStartDay).toBe(1)
  })

  it('rejects invalid start days during client-side validation', async () => {
    // 0 is below range
    await expect(updateHouseholdAction({ budgetPeriodStartDay: 0 })).rejects.toThrow('budgetPeriodStartDay is outside the allowed range')
    // 1.5 is not an integer
    await expect(updateHouseholdAction({ budgetPeriodStartDay: 1.5 })).rejects.toThrow('budgetPeriodStartDay must be an integer')
    // 29 is above valid range (1-28)
    await expect(updateHouseholdAction({ budgetPeriodStartDay: 29 })).rejects.toThrow('budgetPeriodStartDay is outside the allowed range')
    // 31 is above valid range (1-28)
    await expect(updateHouseholdAction({ budgetPeriodStartDay: 31 })).rejects.toThrow('budgetPeriodStartDay is outside the allowed range')
    const row = await db.query.households.findFirst({ where: eq(schema.households.id, householdId) })
    expect(row?.budgetPeriodStartDay).toBe(1) // should remain unchanged
  })

  it('the database itself refuses a start day outside 1–28', async () => {
    await expect(db.update(schema.households).set({ budgetPeriodStartDay: 31 }).where(eq(schema.households.id, householdId))).rejects.toThrow()
  })
})

describe('setMemberDietAction (docs/17_DIET_PREFERENCES.md)', () => {
  it("stores and replaces a member's answers in the caller's household", async () => {
    const [member] = await db.insert(schema.householdMembers).values({ householdId, name: 'Jana', role: 'member' }).returning()
    expect(await setMemberDietAction(member.id, { diet: 'vegetarian', avoids: ['nuts', 'gluten'] })).toEqual({ diet: 'vegetarian', avoids: ['gluten', 'nuts'] })
    await setMemberDietAction(member.id, { diet: 'vegan', avoids: [] })
    const row = await db.query.memberDiets.findFirst({ where: eq(schema.memberDiets.memberId, member.id) })
    expect(row).toMatchObject({ diet: 'vegan', avoids: [] })
  })

  it('refuses a member of another household and unknown answers', async () => {
    const [otherMember] = await db.insert(schema.householdMembers).values({ householdId: otherHouseholdId, name: 'Cizí člen', role: 'member' }).returning()
    await expect(setMemberDietAction(otherMember.id, { diet: 'vegan', avoids: [] })).rejects.toThrow('Household member not found')
    const [member] = await db.insert(schema.householdMembers).values({ householdId, name: 'Petr', role: 'member' }).returning()
    await expect(setMemberDietAction(member.id, { diet: 'paleo', avoids: [] })).rejects.toThrow('Neplatné odpovědi')
    await expect(setMemberDietAction(member.id, { diet: 'none', avoids: ['sugar'] })).rejects.toThrow('Neplatné odpovědi')
  })

  it('the database refuses a key outside the questionnaire', async () => {
    const [member] = await db.insert(schema.householdMembers).values({ householdId, name: 'Eva', role: 'member' }).returning()
    await expect(db.insert(schema.memberDiets).values({ memberId: member.id, diet: 'paleo' })).rejects.toThrow()
    await expect(db.insert(schema.memberDiets).values({ memberId: member.id, avoids: ['sugar'] })).rejects.toThrow()
  })
})

describe('input hardening', () => {
  it('rejects malformed email invitations', async () => {
    currentHousehold = { householdId, role: 'owner', userId: crypto.randomUUID() }
    await expect(inviteMemberAction('not-an-email')).rejects.toThrow('Invalid email address')
  })

  it('rejects empty or oversized names before writing', async () => {
    currentHousehold = { householdId, role: 'owner', userId: crypto.randomUUID() }
    await expect(updateHouseholdAction({ name: '' })).rejects.toThrow('name is required')
    await expect(updateHouseholdAction({ name: 'x'.repeat(5000) })).rejects.toThrow('name is too long')
  })
})
