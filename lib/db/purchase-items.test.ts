import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { InvalidExpenseCategoryError, PurchaseNotFoundError, recomputePurchaseExpenses, setPurchaseItemExpenseOverride } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'

// Integration coverage of the household's manual expense-category reassignment
// (setPurchaseItemExpenseOverride) against the real test database: a purchase and its household are
// created here directly (not through a receipt import), since this layer only cares about
// purchase_items and expenses, not OCR. Each test deletes its own household(s) in a `finally` block
// (cascades to its purchase/purchase_items/expenses), so nothing needs a shared afterAll.
const db = getDb()

async function createPurchase(items: { name: string; category: 'Potraviny' | 'Drogerie'; price: number; quantity?: number }[]) {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_purchase_items__' }).returning()
  const total = items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0)
  const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-09-27', total: total.toString() }).returning()
  const rows = await db
    .insert(schema.purchaseItems)
    .values(items.map((item) => ({ purchaseId: purchase.id, name: item.name, quantity: item.quantity ?? 1, price: item.price.toString(), category: item.category })))
    .returning()
  await recomputePurchaseExpenses(db, purchase.id) // the same call app/actions/receipts.ts makes at creation
  return { householdId: household.id, purchaseId: purchase.id, items: rows }
}

describe('setPurchaseItemExpenseOverride', () => {
  it('moves one item to its own category/subcategory, leaving the rest under the automatic mapping', async () => {
    const { householdId, purchaseId, items } = await createPurchase([
      { name: 'Mléko', category: 'Potraviny', price: 400 },
      { name: 'Dárkový koš', category: 'Potraviny', price: 100 },
    ])
    try {
      await setPurchaseItemExpenseOverride(householdId, items[1].id, { category: 'Ostatní', subcategory: 'Dárky' })
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)]).sort()).toEqual([
        ['Ostatní', 'Dárky', 100],
        ['Potraviny', null, 400],
      ])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('clearing the override (category: null) reverts to the automatic mapping', async () => {
    const { householdId, purchaseId, items } = await createPurchase([{ name: 'Dárek', category: 'Potraviny', price: 100 }])
    try {
      await setPurchaseItemExpenseOverride(householdId, items[0].id, { category: 'Ostatní', subcategory: 'Dárky' })
      await setPurchaseItemExpenseOverride(householdId, items[0].id, null)
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)])).toEqual([['Potraviny', null, 100]])
      const row = await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.id, items[0].id) })
      expect(row).toMatchObject({ expenseCategory: null, expenseSubcategory: null })
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('keeps two overrides to the same category apart by subcategory', async () => {
    const { householdId, purchaseId, items } = await createPurchase([
      { name: 'Kytice', category: 'Potraviny', price: 50 },
      { name: 'Poplatek', category: 'Potraviny', price: 30 },
    ])
    try {
      await setPurchaseItemExpenseOverride(householdId, items[0].id, { category: 'Ostatní', subcategory: 'Dárky' })
      await setPurchaseItemExpenseOverride(householdId, items[1].id, { category: 'Ostatní', subcategory: 'Poplatky a daně' })
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)]).sort()).toEqual([
        ['Ostatní', 'Dárky', 50],
        ['Ostatní', 'Poplatky a daně', 30],
      ])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('rejects an item that does not belong to the caller\'s household', async () => {
    const a = await createPurchase([{ name: 'X', category: 'Potraviny', price: 10 }])
    const b = await createPurchase([{ name: 'Y', category: 'Potraviny', price: 10 }])
    try {
      await expect(setPurchaseItemExpenseOverride(b.householdId, a.items[0].id, { category: 'Ostatní', subcategory: null })).rejects.toThrow(PurchaseNotFoundError)
      await expect(setPurchaseItemExpenseOverride(a.householdId, a.items[0].id, { category: 'Ostatní', subcategory: null })).resolves.toBeUndefined()
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, a.householdId))
      await db.delete(schema.households).where(eq(schema.households.id, b.householdId))
    }
  })

  it('rejects an invalid category or a subcategory that does not belong to it', async () => {
    const { householdId, items } = await createPurchase([{ name: 'X', category: 'Potraviny', price: 10 }])
    try {
      await expect(setPurchaseItemExpenseOverride(householdId, items[0].id, { category: 'Bogus' as never, subcategory: null })).rejects.toThrow(InvalidExpenseCategoryError)
      await expect(setPurchaseItemExpenseOverride(householdId, items[0].id, { category: 'Ostatní', subcategory: 'Nájem nebo hypotéka' })).rejects.toThrow(InvalidExpenseCategoryError)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })

  it('an item with no known category (an old purchase) is left out of the recomputed split', async () => {
    const { householdId, purchaseId } = await createPurchase([{ name: 'Known', category: 'Potraviny', price: 40 }])
    try {
      const [unknown] = await db.insert(schema.purchaseItems).values({ purchaseId, name: 'Unknown', price: '10' }).returning() // no category
      await recomputePurchaseExpenses(db, purchaseId)
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchaseId) })
      // Only the known item's 40 Kč is split; the unknown item's 10 Kč is not invented into a category.
      expect(expenses.map((row) => Number(row.amount))).toEqual([40])
      await db.delete(schema.purchaseItems).where(eq(schema.purchaseItems.id, unknown.id))
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, householdId))
    }
  })
})
