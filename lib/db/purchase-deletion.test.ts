import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { deletePurchase, PurchaseToDeleteNotFoundError } from '@/lib/db/purchase-deletion'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'

// Deleting a purchase against the test database (local PostgreSQL). Throwaway households; deleting
// them cascades to everything else they own.
const db = getDb()

describe('deletePurchase', () => {
  it('removes the purchase, its expenses and receipt, unticks the list without duplicates and takes it out of the pantry', async () => {
    const [household] = await db.insert(schema.households).values({ name: '__test_household_delete_purchase__' }).returning()
    const [other] = await db.insert(schema.households).values({ name: '__test_household_delete_purchase_other__' }).returning()
    try {
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-09-15', total: '120' }).returning()
      await db.insert(schema.purchaseItems).values([
        { purchaseId: purchase.id, name: 'Rýže __test', quantity: 2, unit: 'ks', price: '30', category: 'Potraviny' },
        { purchaseId: purchase.id, name: 'Mléko __test', quantity: 1, unit: 'l', price: '25', category: 'Potraviny' },
        { purchaseId: purchase.id, name: 'Máslo __test', quantity: 1, unit: 'ks', price: '35', category: 'Potraviny' },
      ])
      await recomputePurchaseExpenses(db, purchase.id)
      await db.insert(schema.receiptImports).values({ householdId: household.id, status: 'completed', purchaseId: purchase.id })
      const [list] = await db.insert(schema.shoppingLists).values({ householdId: household.id, name: 'Test' }).returning()
      await db.insert(schema.shoppingListItems).values([
        { listId: list.id, name: 'Rýže __test', done: true, checkedByPurchaseId: purchase.id },
        { listId: list.id, name: 'Chleba __test', done: true },
      ])
      await db.insert(schema.pantryItems).values([
        // 3 left after buying 2: one stays.
        { householdId: household.id, name: 'Rýže __test', quantity: 3, unit: 'ks' },
        // Exactly what was bought: the row goes.
        { householdId: household.id, name: 'Máslo __test', quantity: 1, unit: 'ks' },
        // Another unit than the purchase line: left alone.
        { householdId: household.id, name: 'Mléko __test', quantity: 2, unit: 'ks' },
      ])

      await expect(deletePurchase(other.id, purchase.id)).rejects.toBeInstanceOf(PurchaseToDeleteNotFoundError)

      expect(await deletePurchase(household.id, purchase.id)).toEqual({ date: '2026-09-15', untickedListItems: 1, pantryRowsChanged: 2 })
      expect(await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchase.id) })).toBeUndefined()
      expect(await db.query.purchaseItems.findMany({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })).toEqual([])
      expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, household.id) })).toEqual([])
      expect(await db.query.receiptImports.findMany({ where: eq(schema.receiptImports.householdId, household.id) })).toEqual([])

      const listItems = await db.query.shoppingListItems.findMany({ where: eq(schema.shoppingListItems.listId, list.id) })
      expect(listItems).toHaveLength(2)
      expect(listItems.find((item) => item.name === 'Rýže __test')).toMatchObject({ done: false, checkedByPurchaseId: null })
      expect(listItems.find((item) => item.name === 'Chleba __test')).toMatchObject({ done: true })

      const pantry = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, household.id) })
      expect(pantry.map((row) => [row.name, row.quantity]).sort()).toEqual([['Mléko __test', 2], ['Rýže __test', 1]])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.households).where(eq(schema.households.id, other.id))
    }
  })

  it('deletes a purchase whose products are no longer in the pantry at all', async () => {
    const [household] = await db.insert(schema.households).values({ name: '__test_household_delete_purchase_empty_pantry__' }).returning()
    try {
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-09-20', total: '50' }).returning()
      await db.insert(schema.purchaseItems).values([
        { purchaseId: purchase.id, name: 'Snědený jogurt __test', quantity: 2, unit: 'ks', price: '15', category: 'Potraviny' },
        { purchaseId: purchase.id, name: 'Igelitová taška', quantity: 1, unit: 'ks', price: '5', category: 'Ostatní' },
      ])
      await recomputePurchaseExpenses(db, purchase.id)

      expect(await deletePurchase(household.id, purchase.id)).toEqual({ date: '2026-09-20', untickedListItems: 0, pantryRowsChanged: 0 })
      expect(await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchase.id) })).toBeUndefined()
      expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, household.id) })).toEqual([])
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
    }
  })
  
  it('reverses the expanded physical quantity when deleting a multipack purchase', async () => {
    const [household] = await db.insert(schema.households).values({ name: '__test_household_delete_multipack__' }).returning()
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const productName = `__test_delete_multipack_${crypto.randomUUID()}`
    const [product] = await db.insert(schema.products).values({
      name: productName,
      categoryId: category!.id,
      defaultUnit: 'ks',
      defaultLocation: 'Spíž',
    }).returning()
    try {
      await db.insert(schema.productPackages).values({
        productId: product.id,
        quantity: 9,
        unit: 'l',
        packageCount: 6,
        packageUnitQuantity: 1.5,
        packageUnit: 'l',
        firstSeenAt: '2026-10-07',
        lastSeenAt: '2026-10-07',
      })
      const [purchase] = await db.insert(schema.purchases).values({ householdId: household.id, date: '2026-10-07', total: '89.90' }).returning()
      await db.insert(schema.purchaseItems).values({
        purchaseId: purchase.id,
        productId: product.id,
        name: productName,
        quantity: 8,
        unit: 'ks',
        price: '89.90',
        category: 'Potraviny',
      })
      await db.insert(schema.pantryItems).values({
        householdId: household.id,
        productId: product.id,
        name: productName,
        quantity: 48,
        unit: 'ks',
        category: 'Potraviny',
      })

      await expect(deletePurchase(household.id, purchase.id)).resolves.toMatchObject({ pantryRowsChanged: 1 })

      expect(await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, household.id) })).toBeUndefined()
      expect(await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchase.id) })).toBeUndefined()
    } finally {
      await db.delete(schema.households).where(eq(schema.households.id, household.id))
      await db.delete(schema.products).where(eq(schema.products.id, product.id))
    }
  })

})
