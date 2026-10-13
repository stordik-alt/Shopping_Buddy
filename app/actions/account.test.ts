import { afterAll, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// deleteAccountDataAction: who may delete what (docs/37_SECURITY_REMEDIATION_PLAN.md, S2). The caller
// comes from the session (mocked like in household.test.ts), never from the request.
let current = { userId: '', userEmail: '', householdId: '', memberId: '', role: 'owner' as 'owner' | 'member' }
vi.mock('@/lib/auth/authorize', () => ({ requireHousehold: () => Promise.resolve(current) }))
vi.mock('@/lib/storage', () => ({ deleteReceiptFile: async () => {} }))

import { deleteAccountDataAction } from '@/app/actions/account'

const db = getDb()
const userIds: string[] = []
const householdIds: string[] = []

async function realUser(email: string): Promise<string> {
  const result = await db.execute<{ id: string }>(sql`insert into neon_auth."user" (name, email, "emailVerified") values ('Account test', ${email}, false) returning id`)
  userIds.push(result.rows[0].id)
  return result.rows[0].id
}

async function setup(withMember: boolean) {
  const tag = crypto.randomUUID()
  const [household] = await db.insert(schema.households).values({ name: '__test_account_action__' }).returning()
  householdIds.push(household.id)
  const ownerEmail = `owner-${tag}@example.com`
  const [owner] = await db.insert(schema.householdMembers).values({ householdId: household.id, userId: await realUser(ownerEmail), name: 'Majitel', role: 'owner' }).returning()
  const memberEmail = `member-${tag}@example.com`
  const member = withMember
    ? (await db.insert(schema.householdMembers).values({ householdId: household.id, userId: await realUser(memberEmail), name: 'Člen', role: 'member' }).returning())[0]
    : null
  return { household, owner, ownerEmail, member, memberEmail }
}

afterAll(async () => {
  for (const id of householdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
  for (const id of userIds) await db.execute(sql`delete from neon_auth."user" where id = ${id}`)
})

describe('deleteAccountDataAction', () => {
  it('refuses a mistyped e-mail and changes nothing', async () => {
    const s = await setup(false)
    current = { userId: s.owner.userId!, userEmail: s.ownerEmail, householdId: s.household.id, memberId: s.owner.id, role: 'owner' }
    await expect(deleteAccountDataAction('nekdo@example.com')).rejects.toThrow(/neodpovídá/)
    expect(await db.select().from(schema.households).where(eq(schema.households.id, s.household.id))).toHaveLength(1)
  })

  it('does not let the owner delete the household while another account is in it', async () => {
    const s = await setup(true)
    current = { userId: s.owner.userId!, userEmail: s.ownerEmail, householdId: s.household.id, memberId: s.owner.id, role: 'owner' }
    await expect(deleteAccountDataAction(s.ownerEmail)).rejects.toThrow(/další členy/)
    expect(await db.select().from(schema.householdMembers).where(eq(schema.householdMembers.householdId, s.household.id))).toHaveLength(2)
  })

  it('lets a member leave and keeps the household', async () => {
    const s = await setup(true)
    current = { userId: s.member!.userId!, userEmail: s.memberEmail, householdId: s.household.id, memberId: s.member!.id, role: 'member' }
    expect(await deleteAccountDataAction(s.memberEmail.toUpperCase())).toEqual({ householdDeleted: false })
    expect(await db.select().from(schema.householdMembers).where(eq(schema.householdMembers.householdId, s.household.id))).toHaveLength(1)
  })

  it('deletes the household of a lone owner', async () => {
    const s = await setup(false)
    current = { userId: s.owner.userId!, userEmail: s.ownerEmail, householdId: s.household.id, memberId: s.owner.id, role: 'owner' }
    expect(await deleteAccountDataAction(s.ownerEmail)).toEqual({ householdDeleted: true })
    expect(await db.select().from(schema.households).where(eq(schema.households.id, s.household.id))).toHaveLength(0)
  })
})
