import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { loadProductTypeIds } from '@/lib/db/product-type-assignment'
import * as schema from '@/lib/db/schema'
import { describeItemTypes, matchingProductTypes, productTypeByKey, resolveReceiptLineType } from '@/lib/product-types'
import { matchReceiptToList, type MatchableListItem, type MatchablePurchaseItem, type ReceiptListPair } from '@/lib/receipt-list-match'
import type { ItemUnit } from '@/lib/types'

// Data access for "an imported receipt ticks off the shopping list" (CLAUDE.md section 6: the
// matching itself is pure and lives in lib/receipt-list-match.ts; this file only reads and writes).
//
// Every function takes the household id from the caller, which got it from the authenticated
// session — never from the client — and re-checks that the purchase and every list item belong to
// it, so a forged id cannot tick another household's list.

export type ReceiptListSuggestion = {
  listItemId: string
  listItemName: string
  purchaseItemId: string
  receiptName: string
  quantity: number
  unit: ItemUnit
  /** Per-unit price actually paid, as stored on the purchase item. */
  price: number
}

/** The purchase's lines and the household's still-open list items, or `null` when the purchase is
 *  not this household's. "Open" means not ticked and not already settled by another receipt. */
async function loadMatchCandidates(householdId: string, purchaseId: string) {
  const db = getDb()
  const purchase = await db.query.purchases.findFirst({
    where: and(eq(schema.purchases.id, purchaseId), eq(schema.purchases.householdId, householdId)),
    with: { items: true },
  })
  if (!purchase) return null

  const lists = await db.query.shoppingLists.findMany({
    where: eq(schema.shoppingLists.householdId, householdId),
    with: { items: true },
  })
  const openListItems = lists.flatMap((list) => list.items).filter((item) => !item.done)
  return { purchaseItems: purchase.items, openListItems }
}

type MatchCandidates = NonNullable<Awaited<ReturnType<typeof loadMatchCandidates>>>

/** The candidates in the form the pure matcher reads (docs/12_PRODUCT_TYPES.md phase 4): each open
 *  list item with the product types it asks for (its chosen types, else what its name resolves to),
 *  each receipt line with its type — its catalog product's, else the rules' reading of its text. */
async function toMatchable(candidates: MatchCandidates): Promise<{ listItems: MatchableListItem[]; purchaseItems: MatchablePurchaseItem[] }> {
  const purchaseProductIds = candidates.purchaseItems.flatMap((item) => (item.productId ? [item.productId] : []))
  const listProductIds = candidates.openListItems.flatMap((item) => (item.productId ? [item.productId] : []))
  const productIds = [...new Set([...purchaseProductIds, ...listProductIds])]
  const typeKeyByProduct = new Map<string, string>()
  const productNameById = new Map<string, string>()
  if (productIds.length > 0) {
    const db = getDb()
    const rows = await db
      .select({ productId: schema.products.id, key: schema.productTypes.key })
      .from(schema.products)
      .leftJoin(schema.productTypes, eq(schema.productTypes.id, schema.products.productTypeId))
      .where(inArray(schema.products.id, productIds))
    for (const row of rows) {
      if (row.key) typeKeyByProduct.set(row.productId, row.key)
    }
    const products = await db.query.products.findMany({
      where: inArray(schema.products.id, productIds),
      columns: { id: true, name: true },
    })
    for (const product of products) productNameById.set(product.id, product.name)
  }
  return {
    listItems: candidates.openListItems.map((item) => ({
      id: item.id,
      name: item.name,
      productId: item.productId,
      catalogProductName: item.productId ? productNameById.get(item.productId) ?? null : null,
      acceptedTypes: describeItemTypes(item.name, item.productTypes).accepted,
    })),
    purchaseItems: candidates.purchaseItems.map((item) => ({
      id: item.id,
      name: item.name,
      productId: item.productId,
      type: resolveReceiptLineType({ productTypeKey: item.productId ? typeKeyByProduct.get(item.productId) ?? null : null, category: item.category, name: item.name }),
    })),
  }
}

async function matchCandidates(candidates: MatchCandidates) {
  const { listItems, purchaseItems } = await toMatchable(candidates)
  return matchReceiptToList(listItems, purchaseItems)
}

/** Ticks the given list items off using the purchase's real figures: the quantity, unit and
 *  per-unit price that were actually paid replace the planned ones (the owner's requirement — the
 *  list then shows what the trip really cost). The values come from the stored purchase, never from
 *  the client. The `done = false` condition on the UPDATE makes a concurrent tick harmless.
 *  Returns the pairs that were applied. */
async function applyPairs(householdId: string, purchaseId: string, pairs: ReceiptListPair[]): Promise<ReceiptListPair[]> {
  if (pairs.length === 0) return []
  const candidates = await loadMatchCandidates(householdId, purchaseId)
  if (!candidates) throw new Error('Nákup nebyl nalezen.')

  const openById = new Map(candidates.openListItems.map((item) => [item.id, item]))
  const purchaseItemById = new Map(candidates.purchaseItems.map((item) => [item.id, item]))
  const db = getDb()

  const applied: ReceiptListPair[] = []
  const usedPurchaseItems = new Set<string>()
  for (const pair of pairs) {
    const listItem = openById.get(pair.listItemId)
    const purchaseItem = purchaseItemById.get(pair.purchaseItemId)
    // A pair that is stale (already ticked meanwhile) or does not belong to this household/purchase
    // is skipped rather than failing the whole batch; a purchase line is used for at most one item.
    if (!listItem || !purchaseItem || usedPurchaseItems.has(purchaseItem.id)) continue
    const rows = await db
      .update(schema.shoppingListItems)
      .set({
        done: true,
        quantity: purchaseItem.quantity,
        unit: purchaseItem.unit,
        price: purchaseItem.price,
        checkedByPurchaseId: purchaseId,
      })
      .where(and(eq(schema.shoppingListItems.id, listItem.id), eq(schema.shoppingListItems.done, false)))
      .returning({ id: schema.shoppingListItems.id })
    if (rows.length > 0) {
      applied.push(pair)
      usedPurchaseItems.add(purchaseItem.id)
    }
  }
  return applied
}

/** Learning from a confirmed match (docs/12_PRODUCT_TYPES.md phase 4): when the household confirmed
 *  that a receipt line is the single type its list item asks for, and the line's catalog product has
 *  no type yet, the product takes that type (source 'alias'). Never overwrites a type, never guesses
 *  from a group (which part of the chicken?), and never gives a product a type of another category
 *  or one its own name contradicts. */
async function learnProductTypes(householdId: string, purchaseId: string, applied: ReceiptListPair[]): Promise<void> {
  if (applied.length === 0) return
  const candidates = await loadMatchCandidates(householdId, purchaseId)
  if (!candidates) return
  // The list items are ticked now, so read them from the lists again rather than from the open ones.
  const lists = await getDb().query.shoppingLists.findMany({ where: eq(schema.shoppingLists.householdId, householdId), with: { items: true } })
  const listById = new Map(lists.flatMap((list) => list.items).map((item) => [item.id, item]))
  const purchaseById = new Map(candidates.purchaseItems.map((item) => [item.id, item]))
  const wanted = new Map<string, string>()
  for (const pair of applied) {
    const listItem = listById.get(pair.listItemId)
    const productId = purchaseById.get(pair.purchaseItemId)?.productId
    const accepted = listItem ? describeItemTypes(listItem.name, listItem.productTypes).accepted : null
    if (productId && accepted?.length === 1) wanted.set(productId, accepted[0])
  }
  if (wanted.size === 0) return

  const db = getDb()
  const typeIds = await loadProductTypeIds()
  const products = await db.query.products.findMany({
    where: and(inArray(schema.products.id, [...wanted.keys()]), isNull(schema.products.productTypeId)),
    columns: { id: true, name: true },
    with: { category: { columns: { name: true } } },
  })
  for (const product of products) {
    const key = wanted.get(product.id)
    const typeId = key ? typeIds.get(key) : undefined
    const definition = key ? productTypeByKey(key) : undefined
    if (!typeId || !definition || !definition.categories.includes(product.category.name)) continue
    // A name the rules read as another type (or as several) says what it is better than one tick.
    if (matchingProductTypes(product.category.name, product.name).some((other) => other !== key)) continue
    await db
      .update(schema.products)
      .set({ productTypeId: typeId, productTypeSource: 'alias' })
      .where(and(eq(schema.products.id, product.id), isNull(schema.products.productTypeId)))
  }
}

/** Ticks off every list item that a receipt line matches with certainty (same catalog product or
 *  same name). Called right after a receipt becomes a purchase. Returns how many were ticked. */
export async function autoCheckShoppingListFromPurchase(householdId: string, purchaseId: string): Promise<number> {
  const candidates = await loadMatchCandidates(householdId, purchaseId)
  if (!candidates) return 0
  const { certain } = await matchCandidates(candidates)
  return (await applyPairs(householdId, purchaseId, certain)).length
}

/** Plausible-but-unconfirmed matches for the household to accept or reject. Recomputed from the
 *  current state each time, so anything already ticked (automatically or by hand) drops out. */
export async function getReceiptListSuggestions(householdId: string, purchaseId: string): Promise<ReceiptListSuggestion[]> {
  const candidates = await loadMatchCandidates(householdId, purchaseId)
  if (!candidates) return []
  const { suggested } = await matchCandidates(candidates)
  const listById = new Map(candidates.openListItems.map((item) => [item.id, item]))
  const purchaseById = new Map(candidates.purchaseItems.map((item) => [item.id, item]))
  return suggested.flatMap((pair) => {
    const listItem = listById.get(pair.listItemId)
    const purchaseItem = purchaseById.get(pair.purchaseItemId)
    if (!listItem || !purchaseItem) return []
    return [
      {
        listItemId: listItem.id,
        listItemName: listItem.name,
        purchaseItemId: purchaseItem.id,
        receiptName: purchaseItem.name,
        quantity: purchaseItem.quantity,
        unit: purchaseItem.unit,
        price: Number(purchaseItem.price),
      },
    ]
  })
}

/** Applies the pairs the household confirmed. Only pairs the matcher itself proposes are accepted,
 *  so a client cannot tick an arbitrary item by sending its id — it can only confirm or drop a
 *  suggestion the server would have made. Returns how many list items were ticked. */
export async function applyConfirmedReceiptListPairs(householdId: string, purchaseId: string, pairs: ReceiptListPair[]): Promise<number> {
  const proposed = await getReceiptListSuggestions(householdId, purchaseId)
  const allowed = new Set(proposed.map((suggestion) => `${suggestion.listItemId}:${suggestion.purchaseItemId}`))
  const valid = pairs.filter((pair) => allowed.has(`${pair.listItemId}:${pair.purchaseItemId}`))
  const applied = await applyPairs(householdId, purchaseId, valid)
  await learnProductTypes(householdId, purchaseId, applied)
  return applied.length
}
