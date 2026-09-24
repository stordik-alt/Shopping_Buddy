import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { matchReceiptToList, type ReceiptListPair } from '@/lib/receipt-list-match'
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

/** Ticks the given list items off using the purchase's real figures: the quantity, unit and
 *  per-unit price that were actually paid replace the planned ones (the owner's requirement — the
 *  list then shows what the trip really cost). The values come from the stored purchase, never from
 *  the client. The `done = false` condition on the UPDATE makes a concurrent tick harmless.
 *  Returns how many list items were updated. */
async function applyPairs(householdId: string, purchaseId: string, pairs: ReceiptListPair[]): Promise<number> {
  if (pairs.length === 0) return 0
  const candidates = await loadMatchCandidates(householdId, purchaseId)
  if (!candidates) throw new Error('Nákup nebyl nalezen.')

  const openById = new Map(candidates.openListItems.map((item) => [item.id, item]))
  const purchaseItemById = new Map(candidates.purchaseItems.map((item) => [item.id, item]))
  const db = getDb()

  let updated = 0
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
      updated += 1
      usedPurchaseItems.add(purchaseItem.id)
    }
  }
  return updated
}

/** Ticks off every list item that a receipt line matches with certainty (same catalog product or
 *  same name). Called right after a receipt becomes a purchase. Returns how many were ticked. */
export async function autoCheckShoppingListFromPurchase(householdId: string, purchaseId: string): Promise<number> {
  const candidates = await loadMatchCandidates(householdId, purchaseId)
  if (!candidates) return 0
  const { certain } = matchReceiptToList(candidates.openListItems, candidates.purchaseItems)
  return applyPairs(householdId, purchaseId, certain)
}

/** Plausible-but-unconfirmed matches for the household to accept or reject. Recomputed from the
 *  current state each time, so anything already ticked (automatically or by hand) drops out. */
export async function getReceiptListSuggestions(householdId: string, purchaseId: string): Promise<ReceiptListSuggestion[]> {
  const candidates = await loadMatchCandidates(householdId, purchaseId)
  if (!candidates) return []
  const { suggested } = matchReceiptToList(candidates.openListItems, candidates.purchaseItems)
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
  return applyPairs(householdId, purchaseId, valid)
}
