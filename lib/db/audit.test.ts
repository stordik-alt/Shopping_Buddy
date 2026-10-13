import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { listAuditLog, recordAudit } from '@/lib/db/audit'
import * as schema from '@/lib/db/schema'

const db = getDb()
const householdIds: string[] = []
afterAll(async () => {
  for (const id of householdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
})

describe('audit trail', () => {
  it('records who did what, newest first, and forgets the actor when the member is deleted', async () => {
    const [household] = await db.insert(schema.households).values({ name: '__test_audit__' }).returning()
    householdIds.push(household.id)
    const [member] = await db.insert(schema.householdMembers).values({ householdId: household.id, name: 'Jana', role: 'owner' }).returning()

    await recordAudit({ householdId: household.id, memberId: member.id }, 'expense.added', { amount: 250, category: 'Potraviny' })
    await recordAudit({ householdId: household.id, memberId: member.id }, 'budget.savings_goal_set', { amount: 1000 })

    const entries = await listAuditLog(household.id)
    expect(entries.map((e) => e.action)).toEqual(['budget.savings_goal_set', 'expense.added'])
    expect(entries[1]).toMatchObject({ actor: 'Jana', detail: { amount: 250, category: 'Potraviny' } })

    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, member.id))
    const after = await listAuditLog(household.id)
    expect(after).toHaveLength(2)
    expect(after.every((e) => e.actor === null)).toBe(true)
  })

  it('does not throw when the entry cannot be written', async () => {
    // A household that does not exist breaks the foreign key; the person's own change must not fail because of it.
    await expect(recordAudit({ householdId: crypto.randomUUID() }, 'expense.added')).resolves.toBeUndefined()
  })

  it('keeps one household from reading another one’s history', async () => {
    const [a] = await db.insert(schema.households).values({ name: '__test_audit_a__' }).returning()
    const [b] = await db.insert(schema.households).values({ name: '__test_audit_b__' }).returning()
    householdIds.push(a.id, b.id)
    await recordAudit({ householdId: a.id }, 'expense.added', { amount: 1 })
    expect(await listAuditLog(b.id)).toEqual([])
  })
})
