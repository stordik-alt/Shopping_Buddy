import { eq, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countOtherAccounts, deleteHouseholdData, removeMemberAccountData } from '@/lib/db/account-deletion'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const deleted: string[] = []
vi.mock('@/lib/storage', () => ({
  deleteReceiptFile: vi.fn(async (ref: string) => {
    if (ref.includes('fail')) throw new Error('R2 down')
    deleted.push(ref)
  }),
}))

// Deleting an account (docs/37_SECURITY_REMEDIATION_PLAN.md, S2) relies on the foreign keys to take
// the whole household with it. This runs the real thing against the database.
const db = getDb()
const created: string[] = []

async function household(name: string) {
  const [row] = await db.insert(schema.households).values({ name }).returning()
  created.push(row.id)
  return row
}

afterEach(async () => {
  deleted.length = 0
  for (const id of created.splice(0)) await db.delete(schema.households).where(eq(schema.households.id, id))
})

describe('account deletion', () => {
  it('has no foreign key that would stop a household from being deleted', async () => {
    // Anything hanging off a household (directly or through its members, purchases, receipts, lists …) must
    // cascade or detach, never block. NO ACTION ('a') and RESTRICT ('r') would make the delete fail.
    const result = await db.execute<{ table_name: string; def: string }>(sql`
      select conrelid::regclass::text as table_name, pg_get_constraintdef(oid) as def from pg_constraint
      where contype = 'f' and confdeltype in ('a', 'r') and connamespace = 'public'::regnamespace
        and confrelid in ('public.households'::regclass, 'public.household_members'::regclass, 'public.purchases'::regclass,
                          'public.receipt_imports'::regclass)`)
    expect(result.rows).toEqual([])
  })

  it('deletes the household with its data and removes the receipt photos', async () => {
    const h = await household('__test_account_deletion__')
    const [owner] = await db.insert(schema.householdMembers).values({ householdId: h.id, name: 'Majitel', role: 'owner' }).returning()
    await db.insert(schema.householdMembers).values({ householdId: h.id, name: 'Dítě', role: 'member' })
    await db.insert(schema.purchases).values({ householdId: h.id, date: '2026-10-13', total: '10' })
    await db.insert(schema.invitations).values({ householdId: h.id, email: 'x@example.cz', token: 'tok-1', expiresAt: new Date('2099-01-01'), invitedByMemberId: owner.id })
    await db.insert(schema.receiptImports).values({ householdId: h.id, imageUrl: 'r2:receipts/photo-a' })
    await db.insert(schema.receiptImports).values({ householdId: h.id, imageUrl: 'r2:receipts/photo-fail' })

    const result = await deleteHouseholdData(h.id)

    expect(result.photosFailed).toBe(1)
    expect(deleted).toEqual(['r2:receipts/photo-a'])
    for (const table of [schema.households, schema.householdMembers, schema.purchases, schema.invitations, schema.receiptImports]) {
      const rows = await db.select().from(table).where(sql`${table === schema.households ? sql`id` : sql`household_id`} = ${h.id}`)
      expect(rows).toEqual([])
    }
  })

  it('lets a member leave without touching the household, and counts only accounts', async () => {
    const h = await household('__test_account_leave__')
    const [owner] = await db.insert(schema.householdMembers).values({ householdId: h.id, name: 'Majitel', role: 'owner' }).returning()
    const [member] = await db.insert(schema.householdMembers).values({ householdId: h.id, name: 'Člen', role: 'member' }).returning()
    await db.insert(schema.invitations).values({ householdId: h.id, email: 'clen@example.cz', token: 'tok-2', expiresAt: new Date('2099-01-01') })
    await db.insert(schema.invitations).values({ householdId: h.id, email: 'jiny@example.cz', token: 'tok-3', expiresAt: new Date('2099-01-01') })
    await db.insert(schema.purchases).values({ householdId: h.id, date: '2026-10-13', total: '10' })

    // Profiles without an account do not count; neither does the member asking.
    expect(await countOtherAccounts(h.id, owner.id)).toBe(0)

    // Invitations are stored in lower case (migration 0109); the account's own address may not be.
    await removeMemberAccountData(h.id, member.id, 'Clen@Example.cz')

    const members = await db.select().from(schema.householdMembers).where(eq(schema.householdMembers.householdId, h.id))
    expect(members.map((m) => m.id)).toEqual([owner.id])
    const invites = await db.select().from(schema.invitations).where(eq(schema.invitations.householdId, h.id))
    expect(invites.map((i) => i.email)).toEqual(['jiny@example.cz'])
    expect(await db.select().from(schema.purchases).where(eq(schema.purchases.householdId, h.id))).toHaveLength(1)
  })
})
