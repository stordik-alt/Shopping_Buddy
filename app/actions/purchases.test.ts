import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts (see that
// file's header for why requireHouseholdId()/revalidatePath() need mocking outside a real
// Next.js request).
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: (...args: any[]) => any) => fn }))

import { clearDoneItemsAction, createManualPurchaseAction, recordPurchaseAsExpenseAction, setPurchaseItemExpenseSplitsAction } from '@/app/actions/purchases'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import { restockPantryItem, restockPantryTypeItem } from '@/lib/db/queries'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string
let listId: string
let otherHouseholdId: string
let otherListId: string

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_purchases__' }).returning()
  const [list] = await db.insert(schema.shoppingLists).values({ householdId: household.id, name: 'Test list' }).returning()
  householdId = household.id
  listId = list.id
  createdHouseholdIds.push(householdId)
  currentHouseholdId = householdId

  const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_purchases_other__' }).returning()
  const [otherList] = await db.insert(schema.shoppingLists).values({ householdId: otherHousehold.id, name: 'Other list' }).returning()
  otherHouseholdId = otherHousehold.id
  otherListId = otherList.id
  createdHouseholdIds.push(otherHouseholdId)
})

afterAll(async () => {
  // households cascades to shoppingLists/shoppingListItems/purchases/purchaseItems (all declared
  // onDelete: 'cascade' in the schema), so deleting it alone is enough.
  for (const id of createdHouseholdIds) {
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('clearDoneItemsAction', () => {
  it('removes only the ticked items of the list', async () => {
    const [done] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Mléko', done: true, price: '30', quantity: 2 }).returning()
    const [notDone] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Ještě nekoupeno', done: false, price: '5' }).returning()

    expect(await clearDoneItemsAction(listId)).toEqual({ removed: 1 })

    expect(await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, done.id) })).toBeUndefined()
    expect(await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, notDone.id) })).toBeDefined()
  })

  it('rejects a list belonging to a different household', async () => {
    await expect(clearDoneItemsAction(otherListId)).rejects.toThrow('Shopping list not found')
  })

  it('creates no purchase, expense or pantry stock: a list is only a reminder', async () => {
    await db.insert(schema.pantryItems).values({ householdId, name: 'Rýže', category: 'Potraviny', location: 'Spíž', quantity: 1 })
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Rýže', done: true, price: '40', quantity: 2, category: 'Potraviny' })
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Jogurt', done: true, price: '20', quantity: 3, category: 'Potraviny' })

    await clearDoneItemsAction(listId)

    const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(rows.map((row) => [row.name, row.quantity])).toEqual([['Rýže', 1]])
    expect(await db.query.purchases.findMany({ where: eq(schema.purchases.householdId, householdId) })).toEqual([])
    expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })).toEqual([])
  })
})

describe('restockPantryItem', () => {
  it('creates a new pantry row for a product not seen before, with an inferred location', async () => {
    await restockPantryItem(householdId, { productId: null, name: 'Kuřecí prsa', category: 'Potraviny', quantity: 1, unit: 'ks' })
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(row?.location).toBe('Lednice')
    expect(row?.askedAt).toBeNull()
  })

  it('does not re-infer location on restock, so a manual move (e.g. into the freezer) survives a later purchase', async () => {
    await db.insert(schema.pantryItems).values({ householdId, name: 'Kuřecí prsa', category: 'Potraviny', location: 'Mrazák', quantity: 1 })
    await restockPantryItem(householdId, { productId: null, name: 'Kuřecí prsa', category: 'Potraviny', quantity: 1, unit: 'ks' })

    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(row?.location).toBe('Mrazák') // stayed put — restock never overwrites an existing row's location
    expect(row?.quantity).toBe(2)
  })

  it('replaces stock that is past its shelf life instead of adding to it', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000)
    await db.insert(schema.pantryItems).values({ householdId, name: 'Rohlík', category: 'Potraviny', location: 'Spíž', quantity: 4, addedAt: fiveDaysAgo })
    await restockPantryItem(householdId, { productId: null, name: 'Rohlík', category: 'Potraviny', quantity: 6, unit: 'ks' })

    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(row?.quantity).toBe(6) // the rolls from five days ago are gone (3-day shelf life), not 10
  })

  it('sums quantity into an existing pantry row on restock, case-insensitively by name, and resets askedAt', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
    await db.insert(schema.pantryItems).values({ householdId, name: 'Vejce', category: 'Potraviny', quantity: 6, addedAt: twoDaysAgo, askedAt: twoDaysAgo })
    await restockPantryItem(householdId, { productId: null, name: 'VEJCE', category: 'Potraviny', quantity: 10, unit: 'ks' })

    const pantryRows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRows).toHaveLength(1) // restocked, not duplicated
    expect(pantryRows[0].quantity).toBe(16)
    expect(pantryRows[0].askedAt).toBeNull()
    expect(pantryRows[0].addedAt.getTime()).toBeGreaterThan(twoDaysAgo.getTime())
  })
})

describe('restockPantryTypeItem', () => {
  async function typeId(key: string) {
    const row = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, key) })
    return row!.id
  }

  it('stores stock under the type name and sums pieces into one row', async () => {
    const productTypeId = await typeId('maslo')
    await restockPantryTypeItem(householdId, { productTypeId, typeName: 'Máslo', category: 'Potraviny', quantity: 2, unit: 'ks' })
    await restockPantryTypeItem(householdId, { productTypeId, typeName: 'Máslo', category: 'Potraviny', quantity: 1, unit: 'ks' })

    const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Máslo', productTypeId, quantity: 3, unit: 'ks', productId: null })
  })

  it('converts weights into the existing row unit and keeps pieces and weight apart', async () => {
    const productTypeId = await typeId('kureci-prsa')
    await restockPantryTypeItem(householdId, { productTypeId, typeName: 'Kuřecí prsa a prsní řízky', category: 'Potraviny', quantity: 0.5, unit: 'kg' })
    await restockPantryTypeItem(householdId, { productTypeId, typeName: 'Kuřecí prsa a prsní řízky', category: 'Potraviny', quantity: 300, unit: 'g' })
    await restockPantryTypeItem(householdId, { productTypeId, typeName: 'Kuřecí prsa a prsní řízky', category: 'Potraviny', quantity: 2, unit: 'ks' })

    const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(rows.map((row) => [row.unit, row.quantity]).sort()).toEqual([['kg', 0.8], ['ks', 2]])
  })
})

describe('multipack inventory integration', () => {
  it('expands a manual multipack purchase and does not create an extra expense', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const productName = `__test_eggs_30_${crypto.randomUUID()}`
    const [product] = await db.insert(schema.products).values({
      name: productName,
      categoryId: category!.id,
      defaultUnit: 'ks',
      defaultLocation: 'Spíž',
    }).returning()
    try {
      await db.insert(schema.productPackages).values({
        productId: product.id,
        quantity: 30,
        unit: 'ks',
        packageCount: 30,
        packageUnitQuantity: 1,
        packageUnit: 'ks',
        firstSeenAt: '2026-10-07',
        lastSeenAt: '2026-10-07',
      })

      const before = await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })
      const { purchase } = await createManualPurchaseAction({
        date: '2026-10-07',
        items: [{ name: productName, quantity: 1, unit: 'ks', price: 89.9, category: 'Potraviny' }],
      })

      const pantry = await db.query.pantryItems.findFirst({
        where: eq(schema.pantryItems.householdId, householdId),
      })
      expect(pantry).toMatchObject({ productId: product.id, quantity: 30, unit: 'ks' })
      expect(await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })).toMatchObject({
        quantity: 1,
        unit: 'ks',
        price: '89.90',
      })
      expect((await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })).length).toBe(before.length + 1)
    } finally {
      await db.delete(schema.products).where(eq(schema.products.id, product.id))
    }
  })
})

describe('setPurchaseItemExpenseSplitsAction', () => {
  it('returns the household expenses after the change, so the page needs no refresh', async () => {
    const [purchase] = await db.insert(schema.purchases).values({ householdId, date: '2026-09-27', total: '500' }).returning()
    const [, gift] = await db
      .insert(schema.purchaseItems)
      .values([
        { purchaseId: purchase.id, name: 'Mléko', quantity: 1, price: '400', category: 'Potraviny' },
        { purchaseId: purchase.id, name: 'Dárkový koš', quantity: 1, price: '100', category: 'Potraviny' },
      ])
      .returning()
    await recomputePurchaseExpenses(db, purchase.id)

    const { expenses } = await setPurchaseItemExpenseSplitsAction(gift.id, [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])
    expect(expenses.map((expense) => [expense.category, expense.subcategory, expense.amount]).sort()).toEqual([
      ['Ostatní', 'Dárky', 100],
      ['Potraviny', null, 400],
    ])
  })

  it('does not return another household’s expenses', async () => {
    await db.insert(schema.expenses).values({ householdId: otherHouseholdId, amount: '77', note: 'cizí', category: 'Potraviny', date: '2026-09-27' })
    const [purchase] = await db.insert(schema.purchases).values({ householdId, date: '2026-09-27', total: '100' }).returning()
    const [item] = await db.insert(schema.purchaseItems).values({ purchaseId: purchase.id, name: 'Mléko', quantity: 1, price: '100', category: 'Potraviny' }).returning()
    await recomputePurchaseExpenses(db, purchase.id)

    const { expenses } = await setPurchaseItemExpenseSplitsAction(item.id, [{ category: 'Potraviny', subcategory: null, amount: 100 }])
    expect(expenses.every((expense) => expense.note !== 'cizí')).toBe(true)
  })
})

describe('createManualPurchaseAction — classification', () => {
  it('stores the chosen category and subcategory on the purchase and resulting expense', async () => {
    const name = `__test_manual_classification_${crypto.randomUUID()}`
    try {
      const { purchase } = await createManualPurchaseAction({
        date: '2026-09-27',
        items: [{ name, quantity: 1, unit: 'ks', price: 150, category: 'Drogerie', subcategory: 'Kosmetika' }],
      })

      const item = await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })
      const subcategory = await db.query.productSubcategories.findFirst({ where: eq(schema.productSubcategories.name, 'Kosmetika') })
      expect(item?.category).toBe('Drogerie')
      expect(item?.subcategoryId).toBe(subcategory?.id)

      const expense = await db.query.expenses.findFirst({
        where: eq(schema.expenses.purchaseId, purchase.id),
      })
      expect(expense).toMatchObject({ category: 'Drogerie', subcategory: 'Kosmetika', amount: '150.00' })
    } finally {
      await db.delete(schema.products).where(eq(schema.products.name, name))
    }
  })
})

describe('createManualPurchaseAction — stock by product type', () => {
  it('stocks an abbreviated line under its product type, pieces and weights apart', async () => {
    await createManualPurchaseAction({
      date: '2026-09-27',
      items: [
        { name: 'MASLO PRAG. 250G', quantity: 2, unit: 'ks', price: 60, category: 'Potraviny' },
        { name: 'KUR.PRSA 500G', quantity: 0.6, unit: 'kg', price: 120, category: 'Potraviny' },
      ],
    })

    const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(rows.map((row) => [row.name, row.quantity, row.unit]).sort()).toEqual([
      ['Kuřecí prsa a prsní řízky', 0.6, 'kg'],
      ['Máslo', 2, 'ks'],
    ])
    expect(rows.every((row) => row.productTypeId != null)).toBe(true)
  })

  it('remembers the pack size and keeps different pack sizes of one type apart', async () => {
    await createManualPurchaseAction({
      date: '2026-09-27',
      items: [
        { name: 'MASLO PRAG. 250G', quantity: 2, unit: 'ks', price: 60, category: 'Potraviny' },
        { name: 'MASLO PRAG. 250G', quantity: 1, unit: 'ks', price: 30, category: 'Potraviny' },
        { name: 'MASLO ROLNICKE 1KG', quantity: 1, unit: 'ks', price: 160, category: 'Potraviny' },
      ],
    })

    const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(rows.map((row) => [row.quantity, row.unit, row.pieceQuantity, row.pieceUnit]).sort()).toEqual([
      [1, 'ks', 1, 'kg'],
      [3, 'ks', 0.25, 'kg'],
    ])
  })
})

describe('recordPurchaseAsExpenseAction', () => {
  it('returns the new expenses and notifications of the household', async () => {
    const [purchase] = await db.insert(schema.purchases).values({ householdId, date: '2026-09-27', total: '120' }).returning()
    await db.insert(schema.purchaseItems).values({ purchaseId: purchase.id, name: 'Mléko', quantity: 1, price: '120', category: 'Potraviny' })
    await db.insert(schema.receiptImports).values({ householdId, purchaseId: purchase.id, status: 'completed', source: 'manual' })

    const { expenses, notifications } = await recordPurchaseAsExpenseAction(purchase.id)
    expect(expenses.filter((expense) => expense.purchaseId === purchase.id).map((expense) => expense.amount)).toEqual([120])
    expect(Array.isArray(notifications)).toBe(true)
  })
})
