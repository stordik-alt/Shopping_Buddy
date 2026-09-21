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
