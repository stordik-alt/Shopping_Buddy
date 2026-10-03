import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { applyNewSubcategoryMoves, planNewSubcategoryMoves } from '@/lib/db/new-subcategories'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'

// The one-off move into the Potraviny subcategories of 2026-10-03, against the test database (local
// PostgreSQL). Scoped to throwaway products so the rest of the test catalog is not touched; the
// household cascades away its purchase, lines, pantry rows and expenses.
const db = getDb()

async function subcategoryId(name: string): Promise<string> {
  const row = await db.query.productSubcategories.findFirst({ where: eq(schema.productSubcategories.name, name) })
  if (!row) throw new Error(`missing subcategory ${name}`)
  return row.id
}

describe('moving rows into the new food subcategories', () => {
  it('moves the product, its purchase line and pantry row — even a hand-set one — and keeps the budget total', async () => {
    const potraviny = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const napoje = await subcategoryId('Nápoje')
    const suffix = crypto.randomUUID()
    const [coffee, milk] = await db
      .insert(schema.products)
      .values([
        { name: `__test Jihlavanka mletá káva ${suffix}`, categoryId: potraviny!.id, subcategoryId: napoje }, // as if set by hand
        { name: `__test Mléko polotučné ${suffix}`, categoryId: potraviny!.id },
      ])
      .returning()
    const [household] = await db.insert(schema.households).values({ name: '__test_household_new_subcategories__' }).returning()
    try {
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-10-01', total: '150' }).returning()
      await db.insert(schema.purchaseItems).values([
        { purchaseId: purchase.id, name: coffee.name, quantity: 1, price: '120', category: 'Potraviny', productId: coffee.id, subcategoryId: napoje },
        { purchaseId: purchase.id, name: milk.name, quantity: 1, price: '30', category: 'Potraviny', productId: milk.id },
      ])
      await db.insert(schema.pantryItems).values({ householdId: household.id, name: coffee.name, category: 'Potraviny', productId: coffee.id, subcategoryId: napoje })
      await recomputePurchaseExpenses(db, purchase.id)

      const plan = await planNewSubcategoryMoves({ productIds: [coffee.id, milk.id] })
      expect(plan.products).toEqual([expect.objectContaining({ id: coffee.id, from: 'Nápoje', to: 'Káva a čaj' })])
      expect(plan.purchaseItems).toEqual([expect.objectContaining({ from: 'Nápoje', to: 'Káva a čaj', purchaseId: purchase.id })])
      expect(plan.pantryItems).toEqual([expect.objectContaining({ from: 'Nápoje', to: 'Káva a čaj' })])

      const done = await applyNewSubcategoryMoves(plan)
      expect(done).toEqual({ products: 1, purchaseItems: 1, pantryItems: 1, purchasesRecomputed: 1 })

      const kavaACaj = await subcategoryId('Káva a čaj')
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, coffee.id) }))?.subcategoryId).toBe(kavaACaj)
      expect((await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.productId, coffee.id) }))?.subcategoryId).toBe(kavaACaj)
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchase.id) })
      // The budget keeps the purchase total; the coffee is now its own subcategory.
      expect(expenses.reduce((sum, expense) => sum + Number(expense.amount), 0)).toBeCloseTo(150)
      expect(expenses).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'Potraviny', subcategory: 'Káva a čaj' })]))

      // A second run finds nothing left to move.
      const again = await planNewSubcategoryMoves({ productIds: [coffee.id, milk.id] })
      expect([again.products.length, again.purchaseItems.length, again.pantryItems.length]).toEqual([0, 0, 0])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(inArray(schema.products.id, [coffee.id, milk.id]))
    }
  })

  it('takes back what a looser rule put into a new subcategory, but keeps what a household put there', async () => {
    const potraviny = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const alcohol = await subcategoryId('Alkoholické nápoje')
    const suffix = crypto.randomUUID()
    const [chocolate, iceLolly, byHand] = await db
      .insert(schema.products)
      .values([
        // Placed among the drinks by the first run's rules ("likér" anywhere in the name).
        { name: `__test Lindt Mléčná čokoláda plněná likérem ${suffix}`, categoryId: potraviny!.id, subcategoryId: alcohol },
        { name: `__test Miamo Nanuk rum a kokos ${suffix}`, categoryId: potraviny!.id, subcategoryId: alcohol },
        // No keyword of the subcategory in its name: a household chose it.
        { name: `__test Jägermeister ${suffix}`, categoryId: potraviny!.id, subcategoryId: alcohol },
      ])
      .returning()
    const [household] = await db.insert(schema.households).values({ name: '__test_household_new_subcategories__' }).returning()
    try {
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-10-01', total: '60' }).returning()
      await db.insert(schema.purchaseItems).values({ purchaseId: purchase.id, name: chocolate.name, quantity: 1, price: '60', category: 'Potraviny', productId: chocolate.id, subcategoryId: alcohol })
      await recomputePurchaseExpenses(db, purchase.id)

      const plan = await planNewSubcategoryMoves({ productIds: [chocolate.id, iceLolly.id, byHand.id] })
      expect(plan.products).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: chocolate.id, from: 'Alkoholické nápoje', to: 'Sladkosti' }),
          expect.objectContaining({ id: iceLolly.id, from: 'Alkoholické nápoje', to: null }),
        ]),
      )
      expect(plan.products.map((move) => move.id)).not.toContain(byHand.id)
      expect(plan.purchaseItems).toEqual([expect.objectContaining({ from: 'Alkoholické nápoje', to: 'Sladkosti', purchaseId: purchase.id })])

      await applyNewSubcategoryMoves(plan)
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, chocolate.id) }))?.subcategoryId).toBe(await subcategoryId('Sladkosti'))
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, iceLolly.id) }))?.subcategoryId).toBeNull()
      expect((await db.query.products.findFirst({ where: eq(schema.products.id, byHand.id) }))?.subcategoryId).toBe(alcohol)
      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchase.id) })
      expect(expenses).toEqual([expect.objectContaining({ category: 'Potraviny', subcategory: 'Sladkosti' })])
      expect(Number(expenses[0].amount)).toBeCloseTo(60)

      const again = await planNewSubcategoryMoves({ productIds: [chocolate.id, iceLolly.id, byHand.id] })
      expect([again.products.length, again.purchaseItems.length]).toEqual([0, 0])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(inArray(schema.products.id, [chocolate.id, iceLolly.id, byHand.id]))
    }
  })
})
