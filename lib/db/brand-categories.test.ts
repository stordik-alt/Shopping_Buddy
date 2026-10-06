import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { applyBrandCategoryMoves, planBrandCategoryMoves } from '@/lib/db/brand-categories'
import { getDb } from '@/lib/db/client'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'

// Moving catalog products to their brand's category, against the test database (local PostgreSQL).
// Scoped to throwaway rows; the household cascades away its purchase, lines, pantry and changes.
const db = getDb()

describe('brand categories', () => {
  it("moves a children's drink to Děti with its lines and pantry row, never a product a human placed", async () => {
    const categories = await db.query.productCategories.findMany()
    const categoryId = (name: string) => categories.find((row) => row.name === name)!.id
    const drinks = (await db.query.productSubcategories.findMany({ where: eq(schema.productSubcategories.name, 'Nápoje') })).find((row) => row.category === 'Potraviny')!
    const childrensDrinks = (await db.query.productSubcategories.findMany({ where: eq(schema.productSubcategories.name, 'Dětské nápoje') })).find((row) => row.category === 'Děti')!
    const suffix = crypto.randomUUID()
    const [kubik, locked, byHousehold] = await db
      .insert(schema.products)
      .values([
        { name: `Kubík jahoda 0,4l __test ${suffix}`, categoryId: categoryId('Potraviny'), subcategoryId: drinks.id },
        { name: `Jupík jablko __test ${suffix}`, categoryId: categoryId('Potraviny'), subcategoryId: drinks.id, categoryLocked: true },
        { name: `Kubík malina __test ${suffix}`, categoryId: categoryId('Potraviny'), subcategoryId: drinks.id },
      ])
      .returning()
    const productIds = [kubik.id, locked.id, byHousehold.id]
    const [household] = await db.insert(schema.households).values({ name: '__test_household_brand_categories__' }).returning()
    try {
      // A household moved this one back to Potraviny by hand.
      await db.insert(schema.productCategoryChanges).values({ productId: byHousehold.id, householdId: household.id, fromCategoryId: categoryId('Děti'), toCategoryId: categoryId('Potraviny'), status: 'applied' })
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-10-06', total: '25' }).returning()
      await db.insert(schema.purchaseItems).values({ purchaseId: purchase.id, name: kubik.name, quantity: 1, price: '25', category: 'Potraviny', productId: kubik.id, subcategoryId: drinks.id })
      await recomputePurchaseExpenses(db, purchase.id)
      await db.insert(schema.pantryItems).values({ householdId: household.id, name: kubik.name, productId: kubik.id, category: 'Potraviny', subcategoryId: drinks.id, quantity: 1, unit: 'ks', location: 'Spíž' })

      const plan = await planBrandCategoryMoves({ productIds })
      expect(plan).toEqual([expect.objectContaining({ id: kubik.id, brand: 'Kubík', from: 'Potraviny', to: 'Děti', subcategory: 'Dětské nápoje' })])

      expect(await applyBrandCategoryMoves(plan)).toEqual({ products: 1, pantryItems: 1, productsWithPurchases: 1 })
      const products = await db.query.products.findMany({ where: inArray(schema.products.id, productIds) })
      expect(products.find((row) => row.id === kubik.id)).toMatchObject({ categoryId: categoryId('Děti'), subcategoryId: childrensDrinks.id })
      expect(products.find((row) => row.id === locked.id)?.categoryId).toBe(categoryId('Potraviny'))
      expect(products.find((row) => row.id === byHousehold.id)?.categoryId).toBe(categoryId('Potraviny'))
      expect(await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })).toMatchObject({ category: 'Děti', subcategoryId: childrensDrinks.id })
      expect(await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, household.id) })).toMatchObject({ category: 'Děti', subcategoryId: childrensDrinks.id })

      // Idempotent: nothing left to move.
      expect(await planBrandCategoryMoves({ productIds })).toEqual([])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(inArray(schema.products.id, productIds))
    }
  })
})
