import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { applyRetention } from '@/lib/db/retention'
import * as schema from '@/lib/db/schema'

const db = getDb()
const householdIds: string[] = []
afterAll(async () => {
  for (const id of householdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
})

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

describe('applyRetention', () => {
  it('clears raw receipt text only for finished, old receipts, and drops long-expired invitations', async () => {
    const [household] = await db.insert(schema.households).values({ name: '__test_retention__' }).returning()
    householdIds.push(household.id)
    const base = { householdId: household.id, rawOcrText: 'TEXT', parserResult: '{}', items: '[]' }
    const rows = await db
      .insert(schema.receiptImports)
      .values([
        { ...base, status: 'imported', updatedAt: daysAgo(91) }, // old and finished: cleared
        { ...base, status: 'imported', updatedAt: daysAgo(10) }, // recent: kept
        { ...base, status: 'pending_review', updatedAt: daysAgo(200) }, // still awaiting a person: kept
      ])
      .returning()
    const [oldFinished, recent, waiting] = rows
    await db.insert(schema.invitations).values([
      { householdId: household.id, email: 'old@example.cz', token: 'ret-old', expiresAt: daysAgo(31) },
      { householdId: household.id, email: 'fresh@example.cz', token: 'ret-fresh', expiresAt: daysAgo(5) },
      { householdId: household.id, email: 'open@example.cz', token: 'ret-open', expiresAt: new Date(Date.now() + 86_400_000) },
    ])

    await db.insert(schema.auditLog).values([
      { householdId: household.id, action: 'expense.added', createdAt: daysAgo(366) },
      { householdId: household.id, action: 'expense.added', createdAt: daysAgo(10) },
    ])

    const first = await applyRetention()
    expect(first.auditEntriesDeleted).toBeGreaterThanOrEqual(1)
    expect(first.receiptsCleared).toBeGreaterThanOrEqual(1)
    expect(first.invitationsDeleted).toBeGreaterThanOrEqual(1)

    const byId = async (id: string) => (await db.select().from(schema.receiptImports).where(eq(schema.receiptImports.id, id)))[0]
    expect(await byId(oldFinished.id)).toMatchObject({ rawOcrText: null, parserResult: null, items: '[]' })
    expect(await byId(recent.id)).toMatchObject({ rawOcrText: 'TEXT', parserResult: '{}' })
    expect(await byId(waiting.id)).toMatchObject({ rawOcrText: 'TEXT', parserResult: '{}' })

    const invites = await db.select({ email: schema.invitations.email }).from(schema.invitations).where(eq(schema.invitations.householdId, household.id))
    expect(invites.map((i) => i.email).sort()).toEqual(['fresh@example.cz', 'open@example.cz'])

    const audit = await db.select({ createdAt: schema.auditLog.createdAt }).from(schema.auditLog).where(eq(schema.auditLog.householdId, household.id))
    expect(audit).toHaveLength(1)

    // A second run finds nothing more of ours to do.
    await applyRetention()
    expect((await byId(oldFinished.id)).items).toBe('[]')
  })
})
