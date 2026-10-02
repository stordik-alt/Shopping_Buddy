'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { todayInPrague } from '@/lib/today'
import { getDb } from '@/lib/db/client'
import { getHouseholdExpenses, getHouseholdNotifications, getPurchaseAftermath, restockPantryItem, upsertProductCatalogDefaults, type PurchaseAftermath } from '@/lib/db/queries'
import { getProductCatalogCached, getSubcategoryCatalogCached } from '@/lib/db/cached-reads'
import { getPurchaseItemsForExpense, recordPurchaseAsExpense, recomputePurchaseExpenses, setPurchaseItemExpenseSplits, type PurchaseExpenseItem } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory, isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'
import { matchProductByName } from '@/lib/products'
import { isValidProductSubcategory } from '@/lib/product-subcategories'
import { inferPantryLocation } from '@/lib/pantry'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { Expense, ItemCategory, ItemUnit, Notification, PurchaseRecord } from '@/lib/types'

// Real receipts never need more than a handful of ways to split one line; this only stops a crafted
// request from sending something unbounded (lib/db/purchase-items.ts checks the exact limit).
const MAX_SPLITS_PER_ITEM = 20
const PRODUCT_ITEM_CATEGORIES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const

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
export async function completePurchaseAction(listId: string): Promise<{ purchases: PurchaseRecord[]; aftermath: PurchaseAftermath | null }> {
  const householdId = await requireHouseholdId()
  await assertOwnsList(householdId, listId)
  const db = getDb()

  const doneItems = await db.query.shoppingListItems.findMany({
    where: and(eq(schema.shoppingListItems.listId, listId), eq(schema.shoppingListItems.done, true)),
    with: { preferredStoreLocation: { with: { store: true } } },
  })
  if (doneItems.length === 0) return { purchases: [], aftermath: null }

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

  // No revalidatePath: it would re-render the whole page. The new history and the restocked pantry are returned instead.
  return { purchases: created, aftermath: await getPurchaseAftermath(householdId) }
}

/** Creates a real purchase directly from user-entered lines. It counts immediately towards
 * the budget and restocks inventory just like an imported receipt. */
export async function createManualPurchaseAction(input: {
  date: string
  storeChain?: string | null
  discount?: number | null
  items: Array<{ name: string; quantity: number; unit: ItemUnit; price: number; category: ItemCategory; subcategory?: string | null }>
}): Promise<{ purchase: PurchaseRecord; expenses: Expense[]; notifications: Notification[] }> {
  const householdId = await requireHouseholdId()
  if (!input || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Neplatné datum nákupu.')
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('Nákup musí obsahovat alespoň jednu položku.')
  if (input.items.length > 100) throw new Error('Nákup může obsahovat nejvýše 100 položek.')

  const items = input.items.map((item, index) => {
    const name = String(item.name ?? '').trim()
    const quantity = Number(item.quantity)
    const price = Number(item.price)
    if (!name) throw new Error(`Položka ${index + 1} nemá název.`)
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Neplatné množství u položky „${name}“.`)
    if (!Number.isFinite(price) || price < 0) throw new Error(`Neplatná cena u položky „${name}“.`)
    if (!['ks', 'kg', 'g', 'l', 'ml'].includes(item.unit)) throw new Error(`Neplatná jednotka u položky „${name}“.`)
    if (!(PRODUCT_ITEM_CATEGORIES as readonly string[]).includes(item.category)) throw new Error(`Neplatná kategorie u položky „${name}“.`)
    if (item.subcategory != null && !isValidProductSubcategory(item.category, item.subcategory)) throw new Error(`Neplatná podkategorie u položky „${name}“.`)
    return { name, quantity, price, unit: item.unit, category: item.category, subcategory: item.subcategory ?? null }
  })

  const catalog = await getProductCatalogCached(items.map((item) => item.name))
  const resolved = items.map((item) => {
    const product = matchProductByName(catalog, item.name)
    const category = item.category
    const subcategory = item.subcategory ?? null
    if (!isValidProductSubcategory(category, subcategory)) throw new Error(`Neplatná podkategorie u položky „${item.name}“.`)
    return { ...item, product, category, subcategory }
  })
  const subcategories = await getSubcategoryCatalogCached()
  const subcategoryId = (category: ItemCategory, name: string | null) => name ? subcategories.find((row) => row.category === category && row.name === name)?.id ?? null : null

  const db = getDb()
  let storeLocationId: string | null = null
  if (input.storeChain?.trim()) {
    const store = await db.query.stores.findFirst({ where: eq(schema.stores.chain, input.storeChain.trim()) })
    if (store) {
      const location = await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.storeId, store.id) })
      storeLocationId = location?.id ?? null
    }
  }

  const subtotal = resolved.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const discount = input.discount == null ? null : Number(input.discount)
  if (discount != null && (!Number.isFinite(discount) || discount < 0 || discount > subtotal)) throw new Error('Neplatná sleva.')
  const total = Math.max(0, subtotal - (discount ?? 0))

  const [purchaseRow] = await db.insert(schema.purchases).values({
    householdId,
    storeLocationId,
    date: input.date,
    total: total.toFixed(2),
    discount: discount?.toFixed(2),
  }).returning()

  const itemRows = await db.insert(schema.purchaseItems).values(
    resolved.map((item) => ({
      purchaseId: purchaseRow.id,
      productId: item.product?.id ?? null,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price.toFixed(2),
      category: item.category,
      subcategoryId: subcategoryId(item.category, item.subcategory),
    })),
  ).returning()

  for (const item of resolved) {
    if (!item.product?.isNonInventory) {
      await restockPantryItem(householdId, {
        productId: item.product?.id ?? null,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        subcategoryId: subcategoryId(item.category, item.subcategory),
      })
    }
    // A manual import is a human-confirmed classification, so remember it for future imports too.
    await upsertProductCatalogDefaults({
      name: item.name,
      category: item.category,
      unit: item.unit,
      location: item.product?.defaultLocation ?? inferPantryLocation(item.category, item.name) ?? 'Spíž',
      subcategory: item.subcategory,
      isNonInventory: item.product?.isNonInventory,
    })
  }

  const note = input.storeChain?.trim() ? `Nákup ${input.storeChain.trim()} (ručně)` : 'Nákup (ručně)'
  await recomputePurchaseExpenses(db, purchaseRow.id, { notifyBudget: true, noteForNewPurchase: note })

  const [expenses, notifications] = await Promise.all([
    getHouseholdExpenses(householdId),
    getHouseholdNotifications(householdId),
  ])

  return {
    purchase: {
      id: purchaseRow.id,
      date: purchaseRow.date,
      store: input.storeChain?.trim() || undefined,
      total: Number(purchaseRow.total),
      discount: purchaseRow.discount != null ? Number(purchaseRow.discount) : undefined,
      items: itemRows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: Number(row.quantity),
        unit: row.unit,
        price: Number(row.price),
        category: row.category,
        expenseSplits: [],
      })),
    },
    expenses,
    notifications,
  }
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
  return { expenses: await getHouseholdExpenses(householdId, 1, purchaseItem?.purchaseId) }
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
  const [expenses, notifications] = await Promise.all([getHouseholdExpenses(householdId, 1, purchaseId), getHouseholdNotifications(householdId)])
  return { expenses, notifications }
}
