// Deleting a purchase — usually a test receipt that would otherwise stay in the budget and inflate the
// past periods' savings (docs/20_DELETE_PURCHASE.md, owner request 2026-10-06). Authorization is the
// caller's job: app/actions/purchases.ts resolves the household from the session.

import { and, eq, ilike, isNull } from 'drizzle-orm'
import { detectNonInventory } from '@/lib/categorization'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { pantryQuantityAfterRemoval } from '@/lib/pantry'
import { stockTypesForLines } from '@/lib/db/stock-types'
import { purchasedInventoryQuantity } from '@/lib/inventory-packaging'
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
    with: { items: { columns: { productId: true, name: true, quantity: true, unit: true, category: true }, with: { subcategory: { columns: { name: true } }, product: { columns: { isNonInventory: true } } } } },
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
  // The purchase is already deleted at this point, and the pantry must never undo or fail that
  // (owner, 2026-10-06): a product no longer in the pantry is simply skipped, and a line whose
  // adjustment fails is logged and skipped too.
  let pantryRowsChanged = 0
  const stockLines = purchase.items.filter((line) => !line.product?.isNonInventory && !detectNonInventory(line.name))
  // Receipts and manual purchases stock by product type (lib/db/stock-types.ts), so the row to take
  // from is the type's row; the product/name lookup stays for stock saved before that.
  let lineTypes: Awaited<ReturnType<typeof stockTypesForLines>> = stockLines.map(() => null)
  try {
    lineTypes = await stockTypesForLines(stockLines.map((line) => ({ productId: line.productId, name: line.name, category: line.category })))
  } catch (err) {
    console.error(JSON.stringify({ event: 'purchase_delete_pantry_types_failed', purchaseId, error: err instanceof Error ? err.message : String(err) }))
  }
  for (const [index, line] of stockLines.entries()) {
    try {
      const inventory = await purchasedInventoryQuantity({ productId: line.productId, name: line.name, subcategory: line.subcategory?.name ?? null, quantity: line.quantity, unit: line.unit })
      const type = lineTypes[index]
      // The amount to take out, in the row's own unit. Rows stocked before 2026-10-13 hold goods in
      // pieces of a known size ("5 ks á 250 g") while the purchase is now read as an exact amount
      // (0,5 kg), so a piece row of the same unit family is reduced by amount / piece size.
      const removalFrom = (candidate: { unit: string; pieceQuantity: number | null; pieceUnit: string | null }): number | null => {
        if (candidate.unit === inventory.unit) return inventory.quantity
        if (candidate.unit === 'ks' && candidate.pieceUnit === inventory.unit && candidate.pieceQuantity) return inventory.quantity / candidate.pieceQuantity
        return null
      }
      const typeRows = type
        ? await db.query.pantryItems.findMany({
            where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.productTypeId, type.id), isNull(schema.pantryItems.productId)),
          })
        : []
      const typeRow = typeRows.find((candidate) => candidate.unit === inventory.unit) ?? typeRows.find((candidate) => removalFrom(candidate) != null)
      const byProduct = !typeRow && line.productId
        ? await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.productId, line.productId)) })
        : null
      const row = typeRow ?? byProduct ?? (await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), ilike(schema.pantryItems.name, line.name.trim())) }))
      const removal = row ? removalFrom(row) : null
      if (!row || removal == null) continue
      const left = pantryQuantityAfterRemoval(row.quantity, removal)
      if (left === null) await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, row.id))
      else await db.update(schema.pantryItems).set({ quantity: left }).where(eq(schema.pantryItems.id, row.id))
      pantryRowsChanged++
    } catch (err) {
      console.error(JSON.stringify({ event: 'purchase_delete_pantry_failed', purchaseId, line: line.name, error: err instanceof Error ? err.message : String(err) }))
    }
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

