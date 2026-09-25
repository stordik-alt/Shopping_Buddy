import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts (see that
// file's header for why requireHouseholdId()/revalidatePath() need mocking outside a real
// Next.js request).
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { completePurchaseAction } from '@/app/actions/purchases'

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

describe('completePurchaseAction', () => {
  it('does nothing when there are no done items', async () => {
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Nehotovo', done: false, price: '10' })
    const { purchases } = await completePurchaseAction(listId)
    expect(purchases).toEqual([])
  })

  it('rejects a list belonging to a different household', async () => {
    await expect(completePurchaseAction(otherListId)).rejects.toThrow('Shopping list not found')
  })

  it('turns done items with no preferred store into one purchase with no store, and removes them from the list', async () => {
    const [item1] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Mléko', done: true, price: '30', quantity: 2 }).returning()
    const [item2] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Chleba', done: true, price: '25', quantity: 1 }).returning()
    const [notDone] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Ještě nekoupeno', done: false, price: '5' }).returning()

    const { purchases } = await completePurchaseAction(listId)

    expect(purchases).toHaveLength(1)
    expect(purchases[0].store).toBeUndefined()
    expect(purchases[0].total).toBe(30 * 2 + 25 * 1)
    expect(purchases[0].items.map((i) => i.name).sort()).toEqual(['Chleba', 'Mléko'])

    expect(await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, item1.id) })).toBeUndefined()
    expect(await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, item2.id) })).toBeUndefined()
    expect(await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, notDone.id) })).toBeDefined()
  })

  it('does not record an item a receipt already ticked off as a second purchase, but still removes it from the list', async () => {
    const [receiptPurchase] = await db.insert(schema.purchases).values({ householdId, date: '2026-09-20', total: '30' }).returning()
    const [settled] = await db
      .insert(schema.shoppingListItems)
      .values({ listId, name: 'Z účtenky', done: true, price: '30', quantity: 1, checkedByPurchaseId: receiptPurchase.id })
      .returning()
    const [manual] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Ručně', done: true, price: '10', quantity: 1 }).returning()

    const { purchases } = await completePurchaseAction(listId)

    expect(purchases).toHaveLength(1)
    expect(purchases[0].items.map((i) => i.name)).toEqual(['Ručně'])
    expect(purchases[0].total).toBe(10)
    expect(await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, settled.id) })).toBeUndefined()
    expect(await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, manual.id) })).toBeUndefined()
  })

  it('records nothing when every done item was already settled by a receipt', async () => {
    const [receiptPurchase] = await db.insert(schema.purchases).values({ householdId, date: '2026-09-20', total: '30' }).returning()
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Z účtenky', done: true, price: '30', checkedByPurchaseId: receiptPurchase.id })

    const { purchases } = await completePurchaseAction(listId)

    expect(purchases).toEqual([])
  })

  it('groups done items into separate purchases per preferred store', async () => {
    const storeLocation = await db.query.storeLocations.findFirst({ with: { store: true } })
    if (!storeLocation) return // no seeded store locations in this database; nothing to assert without inventing one

    await db.insert(schema.shoppingListItems).values({ listId, name: 'S obchodem', done: true, price: '10', preferredStoreLocationId: storeLocation.id })
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Bez obchodu', done: true, price: '20' })

    const { purchases } = await completePurchaseAction(listId)

    expect(purchases).toHaveLength(2)
    const withStore = purchases.find((p) => p.store === storeLocation.store.chain)
    const withoutStore = purchases.find((p) => p.store === undefined)
    expect(withStore?.items.map((i) => i.name)).toEqual(['S obchodem'])
    expect(withoutStore?.items.map((i) => i.name)).toEqual(['Bez obchodu'])
  })
})

describe('completePurchaseAction — pantry restocking', () => {
  it('creates a new pantry row for a product not seen before', async () => {
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Rýže', done: true, price: '40', quantity: 1, category: 'Potraviny' })
    await completePurchaseAction(listId)

    const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRow?.name).toBe('Rýže')
    expect(pantryRow?.quantity).toBe(1)
    expect(pantryRow?.category).toBe('Potraviny')
    expect(pantryRow?.location).toBe('Spíž') // shelf-stable, no fridge/freezer keyword match
    expect(pantryRow?.askedAt).toBeNull()
  })

  it('infers the fridge/freezer/household location for a new row from category and name', async () => {
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Kuřecí prsa', done: true, price: '90', quantity: 1, category: 'Potraviny' })
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Mražený hrášek', done: true, price: '25', quantity: 1, category: 'Potraviny' })
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Prací prostředek', done: true, price: '150', quantity: 1, category: 'Drogerie' })
    await completePurchaseAction(listId)

    const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(rows.find((r) => r.name === 'Kuřecí prsa')?.location).toBe('Lednice')
    expect(rows.find((r) => r.name === 'Mražený hrášek')?.location).toBe('Mrazák')
    expect(rows.find((r) => r.name === 'Prací prostředek')?.location).toBe('Domácnost')
  })

  it('does not re-infer location on restock, so a manual move (e.g. into the freezer) survives a later purchase', async () => {
    await db.insert(schema.pantryItems).values({ householdId, name: 'Kuřecí prsa', category: 'Potraviny', location: 'Mrazák', quantity: 1 })
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Kuřecí prsa', done: true, price: '90', quantity: 1, category: 'Potraviny' })
    await completePurchaseAction(listId)

    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(row?.location).toBe('Mrazák') // stayed put — restock never overwrites an existing row's location
    expect(row?.quantity).toBe(2)
  })

  it('replaces stock that is past its shelf life instead of adding to it', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000)
    await db.insert(schema.pantryItems).values({ householdId, name: 'Rohlík', category: 'Potraviny', location: 'Spíž', quantity: 4, addedAt: fiveDaysAgo })
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Rohlík', done: true, price: '3', quantity: 6, category: 'Potraviny' })
    await completePurchaseAction(listId)

    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(row?.quantity).toBe(6) // the rolls from five days ago are gone (3-day shelf life), not 10
  })

  it('sums quantity into an existing pantry row on restock, case-insensitively by name, and resets askedAt', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
    await db.insert(schema.pantryItems).values({ householdId, name: 'Vejce', category: 'Potraviny', quantity: 6, addedAt: twoDaysAgo, askedAt: twoDaysAgo })

    await db.insert(schema.shoppingListItems).values({ listId, name: 'VEJCE', done: true, price: '5', quantity: 10, category: 'Potraviny' })
    await completePurchaseAction(listId)

    const pantryRows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRows).toHaveLength(1) // restocked, not duplicated
    expect(pantryRows[0].quantity).toBe(16)
    expect(pantryRows[0].askedAt).toBeNull()
    expect(pantryRows[0].addedAt.getTime()).toBeGreaterThan(twoDaysAgo.getTime())
  })
})
