// Deleting a purchase — usually a test receipt that would otherwise stay in the budget and inflate the
// past periods' savings (docs/20_DELETE_PURCHASE.md, owner request 2026-10-06). Authorization is the
// caller's job: app/actions/purchases.ts resolves the household from the session.

import { and, eq, ilike } from 'drizzle-orm'
import { detectNonInventory } from '@/lib/categorization'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { pantryQuantityAfterRemoval } from '@/lib/pantry'
import { deleteReceiptFile } from '@/lib/storage'

export class PurchaseToDeleteNotFoundError extends Error {}

export type DeletedPurchase = { date: string; untickedListItems: number; pantryRowsChanged: number }

/** Deletes one of the household's purchases with its lines, expenses and receipt, unticks the list
 *  items its receipt ticked off and takes what it restocked out of the pantry. */
export async function deletePurchase(householdId: string, purchaseId: string): Promise<DeletedPurchase> {
  const db = getDb()
  const purchase = await db.query.purchases.findFirst({
    where: and(eq(schema.purchases.id, purchaseId), eq(schema.purchases.householdId, householdId)),
    columns: { id: true, date: true },
    with: { items: { columns: { productId: true, name: true, quantity: true, unit: true }, with: { product: { columns: { isNonInventory: true } } } } },
  })
  if (!purchase) throw new PurchaseToDeleteNotFoundError('Nákup nenalezen.')
  const receipts = await db.query.receiptImports.findMany({
    where: and(eq(schema.receiptImports.purchaseId, purchaseId), eq(schema.receiptImports.householdId, householdId)),
    columns: { id: true, imageUrl: true },
  })
  const ticked = await db.query.shoppingListItems.findMany({ where: eq(schema.shoppingListItems.checkedByPurchaseId, purchaseId), columns: { id: true } })

  // Atomic: the list items are unticked before the purchase is gone (the link would be nulled by the
  // foreign key otherwise), and the purchase never disappears while its receipt row stays.
  // Deleting the purchase cascades to its lines, their expense splits and its expenses.
  await db.batch([
    db.update(schema.shoppingListItems).set({ done: false, checkedByPurchaseId: null }).where(eq(schema.shoppingListItems.checkedByPurchaseId, purchaseId)),
    db.delete(schema.receiptImports).where(and(eq(schema.receiptImports.purchaseId, purchaseId), eq(schema.receiptImports.householdId, householdId))),
    db.delete(schema.purchases).where(and(eq(schema.purchases.id, purchaseId), eq(schema.purchases.householdId, householdId))),
  ])

  // What the purchase put into the pantry comes out again: the same row a restock would have used
  // (by product, else by name), only in the same unit, never below zero (docs/20_DELETE_PURCHASE.md).
  let pantryRowsChanged = 0
  for (const line of purchase.items) {
    if (line.product?.isNonInventory || detectNonInventory(line.name)) continue
    const byProduct = line.productId
      ? await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.productId, line.productId)) })
      : null
    const row = byProduct ?? (await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), ilike(schema.pantryItems.name, line.name.trim())) }))
    if (!row || row.unit !== line.unit) continue
    const left = pantryQuantityAfterRemoval(row.quantity, line.quantity)
    if (left === null) await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, row.id))
    else await db.update(schema.pantryItems).set({ quantity: left }).where(eq(schema.pantryItems.id, row.id))
    pantryRowsChanged++
  }

  // Best effort: a leftover photo is harmless, unlike a failed deletion — but it is logged.
  for (const receipt of receipts) {
    if (!receipt.imageUrl) continue
    await deleteReceiptFile(receipt.imageUrl).catch((err) =>
      console.error(JSON.stringify({ event: 'receipt_file_delete_failed', receiptImportId: receipt.id, error: err instanceof Error ? err.message : String(err) })),
    )
  }

  return { date: purchase.date, untickedListItems: ticked.length, pantryRowsChanged }
}

