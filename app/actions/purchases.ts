'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { todayInPrague } from '@/lib/today'
import { getDb } from '@/lib/db/client'
import { getHouseholdExpenses, getHouseholdNotifications, restockPantryItem } from '@/lib/db/queries'
import { getPurchaseItemsForExpense, recordPurchaseAsExpense, setPurchaseItemExpenseSplits, type PurchaseExpenseItem } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory, isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { Expense, Notification, PurchaseRecord } from '@/lib/types'

// Real receipts never need more than a handful of ways to split one line; this only stops a crafted
// request from sending something unbounded (lib/db/purchase-items.ts checks the exact limit).
const MAX_SPLITS_PER_ITEM = 20

async function assertOwnsList(householdId: string, listId: string) {
  const db = getDb()
  const list = await db.query.shoppingLists.findFirst({ where: eq(schema.shoppingLists.id, listId) })
  if (!list || list.householdId !== householdId) throw new Error('Shopping list not found')
}

/** Turns a finished shopping trip into real purchase history — until now `purchases`/
 *  `purchase_items` were seeded once and never written to again (docs/01_CURRENT_STATE.md,
 *  "Purchase analytics"). Takes every done item on the list, groups it by preferred store (items
 *  with none share one purchase with no store — a real, valid case, not an error), and records one
 *  `purchases` row + its `purchase_items` per group. Also restocks the household's pantry
 *  (`lib/pantry.ts`) with each purchased item — per the product owner, every purchased item should
 *  land in the pantry. Removes the completed items from the active list, since the trip is over.
 *  Per docs/05_BUSINESS_RULES.md ("past purchases are historical facts... must not be rewritten"),
 *  this only ever creates new purchases, never edits one. */
export async function completePurchaseAction(listId: string): Promise<{ purchases: PurchaseRecord[] }> {
  const householdId = await requireHouseholdId()
  await assertOwnsList(householdId, listId)
  const db = getDb()

  const doneItems = await db.query.shoppingListItems.findMany({
    where: and(eq(schema.shoppingListItems.listId, listId), eq(schema.shoppingListItems.done, true)),
    with: { preferredStoreLocation: { with: { store: true } } },
  })
  if (doneItems.length === 0) return { purchases: [] }

  // Items an imported receipt already ticked off were recorded as a purchase (and restocked into the
  // pantry) by that import; recording them again would count the same trip twice. They are still
  // removed from the list below, since the trip is over.
  const itemsToRecord = doneItems.filter((item) => item.checkedByPurchaseId == null)

  for (const item of itemsToRecord) {
    await restockPantryItem(householdId, { productId: item.productId, name: item.name, category: item.category, quantity: item.quantity, unit: item.unit })
  }

  const groups = new Map<string, typeof doneItems>()
  for (const item of itemsToRecord) {
    const key = item.preferredStoreLocationId ?? 'none'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  const created: PurchaseRecord[] = []
  for (const items of groups.values()) {
    const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    const [purchaseRow] = await db
      .insert(schema.purchases)
      .values({ householdId, storeLocationId: items[0].preferredStoreLocationId, date: todayInPrague(), total: total.toString() })
      .returning()
    const itemRows = await db
      .insert(schema.purchaseItems)
      .values(
        items.map((item) => ({
          purchaseId: purchaseRow.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          category: item.category,
        })),
      )
      .returning()

    created.push({
      id: purchaseRow.id,
      date: purchaseRow.date,
      store: items[0].preferredStoreLocation?.store.chain,
      total: Number(purchaseRow.total),
      discount: purchaseRow.discount != null ? Number(purchaseRow.discount) : undefined,
      items: itemRows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        price: Number(row.price),
        category: row.category,
        expenseSplits: [],
      })),
    })
  }

  await db.delete(schema.shoppingListItems).where(
    inArray(
      schema.shoppingListItems.id,
      doneItems.map((item) => item.id),
    ),
  )

  revalidatePath('/')
  return { purchases: created }
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
  await setPurchaseItemExpenseSplits(householdId, purchaseItemId, splits)
  // No revalidatePath: it would re-render the whole page. The recomputed expenses are all that changed.
  return { expenses: await getHouseholdExpenses(householdId) }
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
  const [expenses, notifications] = await Promise.all([getHouseholdExpenses(householdId), getHouseholdNotifications(householdId)])
  return { expenses, notifications }
}
