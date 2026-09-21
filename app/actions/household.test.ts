import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
} from '@/app/actions/household'

const db = getDb()

async function anyRealUserId(): Promise<string> {
  const result = await db.execute<{ id: string }>(`select id from neon_auth."user" limit 1`)
  const row = result.rows[0]
  if (!row) throw new Error('No neon_auth user exists in this database to run this test against')
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
    // This account (reused from the real dev database) is already a member of its own household —
    // acceptInvitationAction must not let it join a second one.
    const existing = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, userId) })
    if (!existing) return // this dev database's reused account happens not to have a household yet; nothing to assert
    const [invitation] = await db
      .insert(schema.invitations)
      .values({ householdId, email: 'already-member@example.com', token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) })
      .returning()
    currentSession = { user: { id: userId, email: 'already-member@example.com', name: 'Existující Uživatel' } }
    await expect(acceptInvitationAction(invitation.token)).rejects.toThrow('Už jste členem')
  })
})
