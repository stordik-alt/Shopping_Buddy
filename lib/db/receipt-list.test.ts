import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { applyConfirmedReceiptListPairs, autoCheckShoppingListFromPurchase, getReceiptListSuggestions } from '@/lib/db/receipt-list'
import * as schema from '@/lib/db/schema'

// Database-backed tests for ticking the shopping list from an imported receipt. The matching rules
// themselves are covered in lib/receipt-list-match.test.ts; these check persistence, the values
// written to the list, and household scoping.
const db = getDb()
const createdHouseholdIds: string[] = []
const createdProductIds: string[] = []
let householdId: string
let listId: string
let otherHouseholdId: string
let otherListId: string
let productId: string

async function purchaseWith(household: string, lines: Array<{ name: string; quantity: number; unit?: 'ks' | 'kg' | 'l'; price: string; productId?: string }>) {
  const [purchase] = await db.insert(schema.purchases).values({ householdId: household, date: '2026-09-20', total: '100' }).returning()
  const rows = await db
    .insert(schema.purchaseItems)
    .values(lines.map((line) => ({ purchaseId: purchase.id, name: line.name, quantity: line.quantity, unit: line.unit ?? 'ks', price: line.price, productId: line.productId })))
    .returning()
  return { purchase, rows }
}

const getItem = (id: string) => db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, id) })

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_receipt_list__' }).returning()
  const [list] = await db.insert(schema.shoppingLists).values({ householdId: household.id, name: 'List' }).returning()
  householdId = household.id
  listId = list.id
  createdHouseholdIds.push(householdId)

  const [other] = await db.insert(schema.households).values({ name: '__test_household_receipt_list_other__' }).returning()
  const [otherList] = await db.insert(schema.shoppingLists).values({ householdId: other.id, name: 'Other' }).returning()
  otherHouseholdId = other.id
  otherListId = otherList.id
  createdHouseholdIds.push(otherHouseholdId)

  const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
  const [product] = await db
    .insert(schema.products)
    .values({ name: `__test_receipt_list_product_${crypto.randomUUID()}`, categoryId: category!.id, defaultUnit: 'l' })
    .returning()
  productId = product.id
  createdProductIds.push(productId)
})

afterAll(async () => {
  for (const id of createdHouseholdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
  for (const id of createdProductIds) await db.delete(schema.products).where(eq(schema.products.id, id))
})

describe('autoCheckShoppingListFromPurchase', () => {
  it('ticks a certain match and writes the real quantity, unit and price from the receipt', async () => {
    const [item] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Maso', quantity: 1, unit: 'ks', price: '0' }).returning()
    const { purchase } = await purchaseWith(householdId, [{ name: 'MASO', quantity: 0.582, unit: 'kg', price: '199.90' }])

    expect(await autoCheckShoppingListFromPurchase(householdId, purchase.id)).toBe(1)

    const updated = await getItem(item.id)
    expect(updated).toMatchObject({ done: true, unit: 'kg', quantity: 0.582, checkedByPurchaseId: purchase.id })
    expect(Number(updated?.price)).toBe(199.9)
  })

  it('matches by catalog product even when the receipt wording differs', async () => {
    const [item] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Mléko', productId }).returning()
    const { purchase } = await purchaseWith(householdId, [{ name: 'MLEKO POLOTUC. 1L', quantity: 2, unit: 'l', price: '25.90', productId }])

    expect(await autoCheckShoppingListFromPurchase(householdId, purchase.id)).toBe(1)
    expect((await getItem(item.id))?.done).toBe(true)
  })

  it('leaves loose matches and unrelated items untouched', async () => {
    const [loose] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Mléko' }).returning()
    const [unrelated] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Vejce' }).returning()
    const { purchase } = await purchaseWith(householdId, [{ name: 'MLEKO POLOTUC. 1L', quantity: 1, price: '25' }])

    expect(await autoCheckShoppingListFromPurchase(householdId, purchase.id)).toBe(0)
    expect((await getItem(loose.id))?.done).toBe(false)
    expect((await getItem(unrelated.id))?.done).toBe(false)
  })

  it("does not touch another household's list or an already ticked item", async () => {
    const [foreign] = await db.insert(schema.shoppingListItems).values({ listId: otherListId, name: 'Máslo' }).returning()
    const [alreadyDone] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Máslo', done: true, price: '50', quantity: 3 }).returning()
    const { purchase } = await purchaseWith(householdId, [{ name: 'Máslo', quantity: 1, price: '60' }])

    expect(await autoCheckShoppingListFromPurchase(householdId, purchase.id)).toBe(0)
    expect((await getItem(foreign.id))?.done).toBe(false)
    expect(await getItem(alreadyDone.id)).toMatchObject({ quantity: 3, checkedByPurchaseId: null })
  })

  it('does nothing for a purchase that belongs to another household', async () => {
    await db.insert(schema.shoppingListItems).values({ listId, name: 'Máslo' })
    const { purchase } = await purchaseWith(otherHouseholdId, [{ name: 'Máslo', quantity: 1, price: '60' }])

    expect(await autoCheckShoppingListFromPurchase(householdId, purchase.id)).toBe(0)
  })
})

describe('suggestions and confirmation', () => {
  it("suggests a loose match and ticks it only after confirmation, with the receipt's figures", async () => {
    const [item] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Mléko' }).returning()
    const { purchase, rows } = await purchaseWith(householdId, [{ name: 'MLEKO POLOTUC. 1L', quantity: 2, unit: 'l', price: '25.90' }])

    const suggestions = await getReceiptListSuggestions(householdId, purchase.id)
    expect(suggestions).toEqual([
      { listItemId: item.id, listItemName: 'Mléko', purchaseItemId: rows[0].id, receiptName: 'MLEKO POLOTUC. 1L', quantity: 2, unit: 'l', price: 25.9 },
    ])
    expect((await getItem(item.id))?.done).toBe(false)

    expect(await applyConfirmedReceiptListPairs(householdId, purchase.id, [{ listItemId: item.id, purchaseItemId: rows[0].id }])).toBe(1)
    expect(await getItem(item.id)).toMatchObject({ done: true, unit: 'l', quantity: 2, checkedByPurchaseId: purchase.id })
    expect(await getReceiptListSuggestions(householdId, purchase.id)).toEqual([])
  })

  it('ignores a pair the server did not propose', async () => {
    const [item] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Vejce' }).returning()
    const { purchase, rows } = await purchaseWith(householdId, [{ name: 'MLEKO POLOTUC. 1L', quantity: 1, price: '25' }])

    expect(await applyConfirmedReceiptListPairs(householdId, purchase.id, [{ listItemId: item.id, purchaseItemId: rows[0].id }])).toBe(0)
    expect((await getItem(item.id))?.done).toBe(false)
  })

  it("cannot tick another household's item through a forged pair", async () => {
    const [foreign] = await db.insert(schema.shoppingListItems).values({ listId: otherListId, name: 'Mléko' }).returning()
    const { purchase, rows } = await purchaseWith(householdId, [{ name: 'MLEKO POLOTUC. 1L', quantity: 1, price: '25' }])

    expect(await applyConfirmedReceiptListPairs(householdId, purchase.id, [{ listItemId: foreign.id, purchaseItemId: rows[0].id }])).toBe(0)
    expect((await getItem(foreign.id))?.done).toBe(false)
  })
})
