import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import { resetHouseholdData } from '@/lib/db/data-reset'
import * as schema from '@/lib/db/schema'

const deleted: string[] = []
vi.mock('@/lib/storage', () => ({
  deleteReceiptFile: vi.fn(async (ref: string) => {
    if (ref.includes('fail')) throw new Error('R2 down')
    deleted.push(ref)
  }),
}))

// "Smazání dat" (docs/39_DATA_RESET.md) against the real database: only the chosen groups go, the profile
// and every other household stay.
const db = getDb()
const created: string[] = []

async function seed(name: string) {
  const [h] = await db.insert(schema.households).values({ name, monthlyBudget: '5000', savingsGoal: '500' }).returning()
  created.push(h.id)
  const [member] = await db.insert(schema.householdMembers).values({ householdId: h.id, name: 'Majitel', role: 'owner' }).returning()
  await db.insert(schema.children).values({ householdId: h.id, name: 'Dítě', age: 5 })
  const [list] = await db.insert(schema.shoppingLists).values({ householdId: h.id, name: 'Hlavní seznam' }).returning()
  await db.insert(schema.shoppingLists).values({ householdId: h.id, name: 'Chata' })
  await db.insert(schema.shoppingListItems).values({ listId: list.id, name: 'Mléko' })
  const [purchase] = await db.insert(schema.purchases).values({ householdId: h.id, date: '2026-10-13', total: '100' }).returning()
  await db.insert(schema.expenses).values({ householdId: h.id, amount: '100', category: 'Potraviny', date: '2026-10-13', purchaseId: purchase.id })
  await db.insert(schema.expenses).values({ householdId: h.id, amount: '50', category: 'Auto', date: '2026-10-12' })
  await db.insert(schema.incomes).values({ householdId: h.id, amount: '30000', date: '2026-10-01', description: 'Výplata' })
  await db.insert(schema.receiptImports).values({ householdId: h.id, imageUrl: 'r2:receipts/photo-a' })
  await db.insert(schema.receiptImports).values({ householdId: h.id, imageUrl: 'r2:receipts/photo-fail' })
  await db.insert(schema.pantryItems).values({ householdId: h.id, name: 'Mouka' })
  return { h, member }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables differ; every one has a household_id column
async function count(table: any, householdId: string) {
  return (await db.select().from(table).where(eq(table.householdId, householdId))).length
}

afterEach(async () => {
  deleted.length = 0
  for (const id of created.splice(0)) await db.delete(schema.households).where(eq(schema.households.id, id))
})

describe('resetHouseholdData', () => {
  it('deletes only the chosen groups and leaves the profile and other households alone', async () => {
    const { h } = await seed('__test_reset_a__')
    const other = await seed('__test_reset_b__')

    await resetHouseholdData(h.id, ['expenses', 'incomes'])

    expect(await count(schema.expenses, h.id)).toBe(0)
    expect(await count(schema.incomes, h.id)).toBe(0)
    // Not chosen: untouched.
    expect(await count(schema.purchases, h.id)).toBe(1)
    expect(await count(schema.pantryItems, h.id)).toBe(1)
    expect(await count(schema.receiptImports, h.id)).toBe(2)
    // Profile stays.
    expect(await count(schema.householdMembers, h.id)).toBe(1)
    expect(await count(schema.children, h.id)).toBe(1)
    // Another household is not affected.
    expect(await count(schema.expenses, other.h.id)).toBe(2)
  })

  it('removes purchases with their expenses and receipts, and the receipt photos', async () => {
    const { h } = await seed('__test_reset_purchases__')

    const result = await resetHouseholdData(h.id, ['purchases'])

    expect(await count(schema.purchases, h.id)).toBe(0)
    expect(await count(schema.receiptImports, h.id)).toBe(0)
    // The expense that came from the purchase goes with it; the hand-written one stays.
    expect(await count(schema.expenses, h.id)).toBe(1)
    expect(deleted).toEqual(['r2:receipts/photo-a'])
    expect(result.photosFailed).toBe(1)
  })

  it('empties the shopping lists but keeps one list, and resets the budget limit', async () => {
    const { h } = await seed('__test_reset_lists__')

    await resetHouseholdData(h.id, ['shopping', 'budget'])

    const lists = await db.select().from(schema.shoppingLists).where(eq(schema.shoppingLists.householdId, h.id))
    expect(lists).toHaveLength(1)
    const items = await db.select().from(schema.shoppingListItems).where(eq(schema.shoppingListItems.listId, lists[0].id))
    expect(items).toEqual([])
    const [household] = await db.select().from(schema.households).where(eq(schema.households.id, h.id))
    expect(Number(household.monthlyBudget)).toBe(0)
    expect(Number(household.savingsGoal)).toBe(0)
    expect(household.name).toBe('__test_reset_lists__')
  })

  it('does nothing without a chosen group', async () => {
    const { h } = await seed('__test_reset_none__')
    await resetHouseholdData(h.id, [])
    expect(await count(schema.expenses, h.id)).toBe(2)
  })
})
