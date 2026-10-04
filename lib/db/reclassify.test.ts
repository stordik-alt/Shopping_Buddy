import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import { applyReclassification, planReclassification } from '@/lib/db/reclassify'
import * as schema from '@/lib/db/schema'

// Re-placing rows that already have a subcategory, against the test database (local PostgreSQL).
// Scoped to throwaway rows; the household cascades away its purchase, lines and expenses.
const db = getDb()

async function subcategoryId(category: 'Potraviny' | 'Drogerie', name: string): Promise<string> {
  const rows = await db.query.productSubcategories.findMany({ where: eq(schema.productSubcategories.name, name) })
  const row = rows.find((entry) => entry.category === category)
  if (!row) throw new Error(`missing subcategory ${name}`)
  return row.id
}

describe('re-classification by the current rules', () => {
  it('moves what an older rule misplaced, keeps a hand-set row, follows with lines, and fills old line categories from evidence', async () => {
    const potraviny = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const fruit = await subcategoryId('Potraviny', 'Ovoce a zelenina')
    const meat = await subcategoryId('Potraviny', 'Maso a uzeniny')
    const suffix = crypto.randomUUID()
    const [juice, soup, byHand] = await db
      .insert(schema.products)
      .values([
        // An older rule put the juice among fruit ("pomeranč") and the instant soup among meat ("kuřecí").
        { name: `__test BILLA Ready 100% pomerančová šťáva 250ml ${suffix}`, categoryId: potraviny!.id, subcategoryId: fruit },
        { name: `__test Knorr Instantní polévka Kuřecí 12g ${suffix}`, categoryId: potraviny!.id, subcategoryId: meat },
        // No rule places it; a household chose "Maso a uzeniny" — it stays.
        { name: `__test Xyzzy ${suffix}`, categoryId: potraviny!.id, subcategoryId: meat },
      ])
      .returning()
    const productIds = [juice.id, soup.id, byHand.id]
    const [household] = await db.insert(schema.households).values({ name: '__test_household_reclassify__' }).returning()
    try {
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-10-01', total: '100' }).returning()
      await db.insert(schema.purchaseItems).values([
        { purchaseId: purchase.id, name: juice.name, quantity: 1, price: '40', category: 'Potraviny', productId: juice.id, subcategoryId: fruit },
        // An old line with no category and no product, but a name only one category's rules place.
        { purchaseId: purchase.id, name: 'Gillette Mach3 gel na holení', quantity: 1, price: '60' },
      ])
      await recomputePurchaseExpenses(db, purchase.id)
      const scope = { productIds, purchaseIds: [purchase.id] }

      const plan = await planReclassification(scope)
      expect(plan.products).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: juice.id, from: 'Ovoce a zelenina', to: 'Nápoje' }),
          expect.objectContaining({ id: soup.id, from: 'Maso a uzeniny', to: 'Lahůdky a hotová jídla' }),
        ]),
      )
      expect(plan.products.map((move) => move.id)).not.toContain(byHand.id)
      expect(plan.purchaseItems).toEqual([expect.objectContaining({ from: 'Ovoce a zelenina', to: 'Nápoje' })])
      expect(plan.lineCategories).toEqual([expect.objectContaining({ category: 'Drogerie', subcategory: 'Hygiena', evidence: 'rules' })])

      const done = await applyReclassification(plan)
      expect(done).toMatchObject({ products: 2, purchaseItems: 1, lineCategories: 1, purchasesRecomputed: 1 })
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, byHand.id) }))?.subcategoryId).toBe(meat)

      // The budget keeps the purchase total, now with the old line counted under Drogerie.
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchase.id) })
      expect(expenses.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(100)
      expect(expenses.map((row) => `${row.category} ▸ ${row.subcategory}`).sort()).toEqual(['Drogerie ▸ Hygiena', 'Potraviny ▸ Nápoje'])

      const again = await planReclassification(scope)
      expect([again.products.length, again.purchaseItems.length, again.lineCategories.length]).toEqual([0, 0, 0])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(inArray(schema.products.id, productIds))
    }
  })
})
