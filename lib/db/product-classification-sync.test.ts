import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getHouseholdProductExpenseDefaults, recomputePurchaseExpenses, setPurchaseItemExpenseSplits, syncProductClassificationToPurchases } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'

const db = getDb()

describe('syncProductClassificationToPurchases', () => {
  it('preserves explicit gift exceptions and their household default', async () => {
    const foodCategory = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const drugCategory = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Drogerie') })
    const cosmetic = await db.query.productSubcategories.findFirst({
      where: and(eq(schema.productSubcategories.category, 'Drogerie'), eq(schema.productSubcategories.name, 'Kosmetika')),
    })
    const [household] = await db.insert(schema.households).values({ name: '__test_product_classification_sync__' }).returning()
    const [product] = await db
      .insert(schema.products)
      .values({ name: `__test_product_classification_sync_${crypto.randomUUID()}`, categoryId: foodCategory!.id })
      .returning()
    const [purchase] = await db
      .insert(schema.purchases)
      .values({ householdId: household.id, date: '2026-09-27', total: '100' })
      .returning()
    const [item] = await db
      .insert(schema.purchaseItems)
      .values({ purchaseId: purchase.id, name: product.name, price: '100', category: 'Potraviny', productId: product.id })
      .returning()

    try {
      await recomputePurchaseExpenses(db, purchase.id)
      await setPurchaseItemExpenseSplits(household.id, item.id, [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])

      await db.update(schema.products).set({ categoryId: drugCategory!.id, subcategoryId: cosmetic!.id }).where(eq(schema.products.id, product.id))
      await syncProductClassificationToPurchases(product.id)

      const updatedItem = await db.query.purchaseItems.findFirst({
        where: eq(schema.purchaseItems.id, item.id),
        with: { subcategory: { columns: { name: true } } },
      })
      expect(updatedItem).toMatchObject({ category: 'Drogerie' })
      expect(updatedItem?.subcategory?.name).toBe('Kosmetika')

      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchase.id) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)])).toEqual([['Ostatní', 'Dárky', 100]])

      expect(await getHouseholdProductExpenseDefaults(household.id, [product.id])).toEqual(
        new Map([[product.id, { category: 'Ostatní', subcategory: 'Dárky' }]]),
      )
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(eq(schema.products.id, product.id))
    }

  it('does not let a budget reassignment bypass a locked product classification', async () => {
    const foodCategory = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const otherCategory = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Ostatní') })
    const clothing = await db.query.productSubcategories.findFirst({
      where: and(eq(schema.productSubcategories.category, 'Ostatní'), eq(schema.productSubcategories.name, 'Oblečení a obuv')),
    })
    const [household] = await db.insert(schema.households).values({ name: '__test_product_classification_sync__' }).returning()
    const [product] = await db
      .insert(schema.products)
      .values({ name: `__test_product_classification_locked_${crypto.randomUUID()}`, categoryId: foodCategory!.id, categoryLocked: true })
      .returning()
    const [purchase] = await db
      .insert(schema.purchases)
      .values({ householdId: household.id, date: '2026-09-27', total: '100' })
      .returning()
    const [item] = await db
      .insert(schema.purchaseItems)
      .values({ purchaseId: purchase.id, name: product.name, price: '100', category: 'Potraviny', productId: product.id })
      .returning()

    try {
      await recomputePurchaseExpenses(db, purchase.id)
      await setPurchaseItemExpenseSplits(household.id, item.id, [{ category: 'Ostatní', subcategory: 'Oblečení a obuv', amount: 100 }])

      const unchangedProduct = await db.query.products.findFirst({ where: eq(schema.products.id, product.id), with: { category: true, subcategory: true } })
      expect(unchangedProduct?.category.name).toBe('Potraviny')
      expect(unchangedProduct?.subcategory).toBeNull()

      const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.purchaseId, purchase.id) })
      expect(expenses.map((row) => [row.category, row.subcategory, Number(row.amount)])).toEqual([['Ostatní', 'Oblečení a obuv', 100]])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(eq(schema.products.id, product.id))
    }
  })
  })
})
