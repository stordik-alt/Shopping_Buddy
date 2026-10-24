'use server'

import { eq } from 'drizzle-orm'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import { createManualPurchaseForHousehold } from '@/lib/db/manual-purchase'
import { getHouseholdExpenses, getHouseholdNotifications } from '@/lib/db/queries'
import { getPurchaseItemsForExpense, recordPurchaseAsExpense, setPurchaseItemExpenseSplits, type PurchaseExpenseItem } from '@/lib/db/purchase-items'
import { deletePurchase, PurchaseToDeleteNotFoundError } from '@/lib/db/purchase-deletion'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory, isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'
import { clearDoneShoppingItemsForHousehold } from '@/lib/shopping-list-service'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { Expense, ManualPurchaseInput, Notification } from '@/lib/types'

// Real receipts never need more than a handful of ways to split one line; this only stops a crafted
// request from sending something unbounded (lib/db/purchase-items.ts checks the exact limit).
const MAX_SPLITS_PER_ITEM = 20

/** "Dokončit nákup" on the shopping list: removes the ticked items. A list is only a reminder and
 *  tick-off tool (owner request, 2026-10-11) — it creates no purchase, expense or pantry stock.
 *  Purchases come from receipt imports and manual purchases, which know what was really bought and
 *  paid. */
export async function clearDoneItemsAction(listId: string): Promise<{ removed: number }> {
  const householdId = await requireHouseholdId()
  // No revalidatePath: it would re-render the whole page; the client drops the items itself.
  return clearDoneShoppingItemsForHousehold(householdId, listId)
}

/** Creates a real purchase directly from user-entered lines. It counts immediately towards
 * the budget and restocks inventory just like an imported receipt. */
export async function createManualPurchaseAction(input: ManualPurchaseInput) {
  const householdId = await requireHouseholdId()
  return createManualPurchaseForHousehold(householdId, input)
}

/** The household's own split of one item of one of its own past purchases across expense targets —
 *  a plain reassignment (one target, e.g. a gift bought during an otherwise ordinary grocery trip,
 *  counted under Ostatní ▸ Dárky instead of Potraviny) or a genuine split across more than one, since
 *  a receipt often can't say (owner request, 2026-09-27 — "Oblečení" that was actually half adult,
 *  half a child's clothing). An empty array clears it back to the automatic mapping. The purchase's
 *  expense rows are recomputed to match, and a plain reassignment is remembered for the product, so
 *  it applies on its own to that product's next receipt (lib/db/purchase-items.ts). */
export async function setPurchaseItemExpenseSplitsAction(purchaseItemId: string, splits: ExpenseSplitPart[]): Promise<{ expenses: Expense[] }> {
  const householdId = await requireHouseholdId()
  if (typeof purchaseItemId !== 'string' || purchaseItemId.length === 0) throw new Error('Neplatná položka nákupu.')
  if (!Array.isArray(splits) || splits.length > MAX_SPLITS_PER_ITEM) throw new Error('Neplatné rozdělení položky.')
  for (const split of splits) {
    if (typeof split !== 'object' || split == null || typeof split.category !== 'string' || typeof split.amount !== 'number') throw new Error('Neplatné rozdělení položky.')
    if (split.subcategory != null && typeof split.subcategory !== 'string') throw new Error('Neplatné rozdělení položky.')
  }
  const purchaseItem = await getDb().query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.id, purchaseItemId), columns: { purchaseId: true } })
  await setPurchaseItemExpenseSplits(householdId, purchaseItemId, splits)
  // No revalidatePath: it would re-render the whole page. The recomputed expenses are all that changed.
  // Include the affected purchase even when its date is outside the current budget period; this is an
  // immediate mutation response, not the normal history read.
  return { expenses: await getHouseholdExpenses(householdId, purchaseItem?.purchaseId) }
}

/** The purchase-items behind one category's (or subcategory's) amount for one purchase, for the
 *  Výdaje breakdown's "exact items, not just the whole receipt" drill-down (owner request,
 *  2026-09-27). Read-only; reassigning one of these items is the action above. */
export async function getPurchaseExpenseItemsAction(purchaseId: string, category: ExpenseCategory, subcategory: string | null): Promise<PurchaseExpenseItem[]> {
  const householdId = await requireHouseholdId()
  if (typeof purchaseId !== 'string' || purchaseId.length === 0) throw new Error('Neplatný nákup.')
  if (!isExpenseCategory(category)) throw new Error('Neplatná kategorie výdaje.')
  if (subcategory != null && (typeof subcategory !== 'string' || !isValidSubcategory(category, subcategory))) throw new Error('Neplatná podkategorie výdaje.')
  return getPurchaseItemsForExpense(householdId, purchaseId, { category, subcategory })
}

/** Records a receipt-derived purchase into the budget after the fact — for one imported before
 *  receipts started counting as expenses, or otherwise missed (owner request, 2026-09-27). Refuses a
 *  purchase that did not come from a receipt or one that already has expenses
 *  (lib/db/purchase-items.ts). */
export async function recordPurchaseAsExpenseAction(purchaseId: string): Promise<{ expenses: Expense[]; notifications: Notification[] }> {
  const householdId = await requireHouseholdId()
  if (typeof purchaseId !== 'string' || purchaseId.length === 0) throw new Error('Neplatný nákup.')
  await recordPurchaseAsExpense(householdId, purchaseId)
  // No revalidatePath (see above). Recording can also raise a budget-threshold notification, so both are returned.
  const [expenses, notifications] = await Promise.all([getHouseholdExpenses(householdId, purchaseId), getHouseholdNotifications(householdId)])
  return { expenses, notifications }
}

const PURCHASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Deletes one of the household's purchases — a test receipt, a mistake — with its expenses and
 *  receipt, unticks the list items its receipt ticked and takes it out of the pantry
 *  (docs/20_DELETE_PURCHASE.md). Returns the purchase's date, so the client can reload the past
 *  period it belonged to. */
export async function deletePurchaseAction(purchaseId: string): Promise<{ date: string }> {
  const { householdId, memberId } = await requireHousehold()
  if (typeof purchaseId !== 'string' || !PURCHASE_ID_PATTERN.test(purchaseId)) throw new Error('Neplatný nákup.')
  try {
    const { date } = await deletePurchase(householdId, purchaseId)
    await recordAudit({ householdId, memberId }, 'purchase.deleted', { date }, purchaseId)
    return { date }
  } catch (err) {
    // Another household's purchase reads the same as a missing one.
    if (err instanceof PurchaseToDeleteNotFoundError) throw new Error('Nákup nenalezen. Možná už byl odstraněn.')
    throw err
  }
}
