import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import {
  applyLineCategoryFill,
  applyLineItemRecategorization,
  applyProductRecategorization,
  previewLineCategoryFill,
  previewProductRecategorization,
} from '@/lib/db/recategorize'
import * as schema from '@/lib/db/schema'

// Filling empty subcategories (and old purchase lines' categories) by the keyword rules, against the
// test database (local PostgreSQL). Scoped to throwaway rows; the household cascades away its
// purchase, lines and expenses.
const db = getDb()

async function subcategoryId(category: 'Potraviny', name: string): Promise<string> {
  const rows = await db.query.productSubcategories.findMany({ where: eq(schema.productSubcategories.name, name) })
  const row = rows.find((entry) => entry.category === category)
  if (!row) throw new Error(`missing subcategory ${name}`)
  return row.id
}

describe('re-categorization', () => {
  it('fills an empty subcategory, never overwrites a set one, and keeps the budget total', async () => {
    const potraviny = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const sweets = await subcategoryId('Potraviny', 'Sladkosti')
    const suffix = crypto.randomUUID()
    const [cheese, setByHand, unknown] = await db
      .insert(schema.products)
      .values([
        { name: `__test clever Eidam plátky 45% ${suffix}`, categoryId: potraviny!.id },
        { name: `__test Gouda plátky ${suffix}`, categoryId: potraviny!.id, subcategoryId: sweets }, // a household's choice
        { name: `__test Xyzzy ${suffix}`, categoryId: potraviny!.id },
      ])
      .returning()
    const productIds = [cheese.id, setByHand.id, unknown.id]
    const [household] = await db.insert(schema.households).values({ name: '__test_household_recategorize__' }).returning()
    try {
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-10-01', total: '100' }).returning()
      await db.insert(schema.purchaseItems).values([
        // An old line without a category, linked to the cheese.
        { purchaseId: purchase.id, name: 'EIDAM PL. 45%', quantity: 1, price: '40', productId: cheese.id },
        // An old line without a category and without a product: left alone (it would be a guess).
        { purchaseId: purchase.id, name: 'BANANY', quantity: 1, price: '30' },
        { purchaseId: purchase.id, name: 'Rohlík', quantity: 1, price: '30', category: 'Potraviny' },
      ])
      await recomputePurchaseExpenses(db, purchase.id)
      const scope = { productIds, purchaseIds: [purchase.id] }

      expect((await previewLineCategoryFill(scope)).resolvable).toBe(1)
      expect((await previewProductRecategorization(scope)).samples).toEqual([expect.objectContaining({ id: cheese.id, subcategory: 'Mléčné výrobky' })])

      expect(await applyLineCategoryFill(scope)).toBe(1)
      expect(await applyProductRecategorization(scope)).toBe(1)
      expect(await applyLineItemRecategorization('purchase_items', scope)).toBe(2)

      const dairy = await subcategoryId('Potraviny', 'Mléčné výrobky')
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, cheese.id) }))?.subcategoryId).toBe(dairy)
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, setByHand.id) }))?.subcategoryId).toBe(sweets)
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, unknown.id) }))?.subcategoryId).toBeNull()

      const lines = await db.query.purchaseItems.findMany({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })
      const line = (name: string) => lines.find((row) => row.name === name)!
      expect(line('EIDAM PL. 45%')).toMatchObject({ category: 'Potraviny', subcategoryId: dairy })
      expect(line('BANANY')).toMatchObject({ category: null, subcategoryId: null })
      expect(line('Rohlík').subcategoryId).toBe(await subcategoryId('Potraviny', 'Pečivo'))

      // The budget keeps the purchase total, now split by the filled subcategories.
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchase.id) })
      expect(expenses.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(100)
      expect(expenses.map((row) => row.subcategory).sort()).toEqual(['Mléčné výrobky', 'Pečivo'])

      // A second run finds nothing left.
      expect((await previewLineCategoryFill(scope)).resolvable).toBe(0)
      expect((await previewProductRecategorization(scope)).resolvable).toBe(0)
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(inArray(schema.products.id, productIds))
    }
  })
})
