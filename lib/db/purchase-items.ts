import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { periodSpending, notifyBudgetThresholds } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isExpenseCategory, isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'
import { sameExpenseTarget, splitPurchaseByCategory, targetsOf, type ExpenseSplitPart, type ExpenseTarget, type PurchaseExpenseLine } from '@/lib/purchase-expenses'
import type { ItemCategory, ItemUnit } from '@/lib/types'
import { isValidProductSubcategory } from '@/lib/product-subcategories'

// Lets a household split one purchase-item's expense-category assignment by hand — a plain
// reassignment (e.g. a gift bought during an otherwise ordinary grocery trip, counted under Ostatní ▸
// Dárky instead of Potraviny) or, since a receipt often can't say, a genuine split across more than
// one target (e.g. "Oblečení" that was actually half adult, half a child's clothing) — and remembers
// a plain reassignment for the product, so it applies on its own to that product's next receipt
// (owner request, 2026-09-27). Authorization is the caller's job (app/actions/purchases.ts resolves
// the household from the session).

export class PurchaseNotFoundError extends Error {}
export class InvalidExpenseCategoryError extends Error {}
export class InvalidExpenseSplitError extends Error {}
export class NotFromReceiptError extends Error {}
export class AlreadyRecordedError extends Error {}
export class NothingToRecordError extends Error {}

/** Syncs the shared product classification into historical receipt items and ordinary budget rows.
 * Genuine multi-way expense splits remain explicit per-purchase exceptions; plain one-target overrides
 * and learned defaults are cleared because the product is now the canonical classification. */
export async function syncProductClassificationToPurchases(productId: string): Promise<void> {
  const db = getDb()
  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
    columns: { id: true, categoryId: true, subcategoryId: true },
    with: { category: { columns: { name: true } } },
  })
  if (!product) return
  const items = await db.query.purchaseItems.findMany({
    where: eq(schema.purchaseItems.productId, productId),
    columns: { id: true, purchaseId: true },
    with: { expenseSplits: { columns: { id: true } } },
  })
  const purchaseIds = [...new Set(items.map((item) => item.purchaseId))]
  const plainOverrideIds = items.filter((item) => item.expenseSplits.length === 1).flatMap((item) => item.expenseSplits.map((split) => split.id))
  await db.update(schema.purchaseItems).set({ category: product.category.name, subcategoryId: product.subcategoryId }).where(eq(schema.purchaseItems.productId, productId))
  if (plainOverrideIds.length > 0) await db.delete(schema.purchaseItemExpenseSplits).where(inArray(schema.purchaseItemExpenseSplits.id, plainOverrideIds))
  await db.delete(schema.householdProductExpenseDefaults).where(eq(schema.householdProductExpenseDefaults.productId, productId))
  for (const purchaseId of purchaseIds) await recomputePurchaseExpenses(db, purchaseId)
}

// A crafted request could otherwise ask for an unbounded number of rows; real receipts never need
// more than a handful of ways to split one line.
const MAX_SPLITS_PER_ITEM = 6

/** Recomputes and replaces a purchase's expense rows (`expenses` where `purchase_id = purchaseId`)
 *  from its current items and their splits (`splitPurchaseByCategory`, lib/purchase-expenses.ts).
 *  The one place that turns a purchase's items into its expenses — called both right after a receipt
 *  becomes a purchase and after any later reassignment, so the two can never compute the split
 *  differently (CLAUDE.md section 6). Deliberately does not re-check per-category budget thresholds
 *  on a reassignment (`notifyBudget` defaults to off): a reassignment moves money between categories
 *  of the *same* purchase and date, so the month's total is unchanged — only a per-category budget
 *  could in principle newly cross 80 %/100 % by this, which is not re-evaluated here (a known,
 *  accepted gap, not a silent one). */
export async function recomputePurchaseExpenses(
  db: ReturnType<typeof getDb>,
  purchaseId: string,
  options: { notifyBudget?: boolean; noteForNewPurchase?: string } = {},
): Promise<void> {
  const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchaseId), columns: { householdId: true, date: true, total: true } })
  if (!purchase) throw new PurchaseNotFoundError('Nákup neexistuje.')
  const items = await db.query.purchaseItems.findMany({
    where: eq(schema.purchaseItems.purchaseId, purchaseId),
    columns: { price: true, quantity: true, category: true },
    with: { subcategory: { columns: { name: true } }, expenseSplits: { columns: { category: true, subcategory: true, amount: true } } },
  })
  // An item without a known category (a purchase made before that column existed) contributes
  // nothing usable to the split — CLAUDE.md section 5: its original category was never kept, so
  // nothing invents one for it now.
  const lines: PurchaseExpenseLine[] = items
    .filter((item): item is typeof item & { category: NonNullable<(typeof item)['category']> } => item.category != null)
    .map((item) => ({
      category: item.category,
      amount: Number(item.price) * item.quantity,
      subcategory: item.subcategory?.name ?? null,
      expenseOverride: item.expenseSplits.map((split) => ({ category: split.category, subcategory: split.subcategory, amount: Number(split.amount) })),
    }))
  const parts = splitPurchaseByCategory(lines, Number(purchase.total))

  // The note text (e.g. "Nákup Lidl") is whatever the purchase's expenses already carried; reused
  // rather than re-derived, so a reassignment cannot accidentally change it. A brand-new purchase has
  // none to reuse yet — the caller (app/actions/receipts.ts, creating the purchase) supplies the
  // right note itself via `noteForNewPurchase`.
  const existingNote = (await db.query.expenses.findFirst({ where: eq(schema.expenses.purchaseId, purchaseId), columns: { note: true } }))?.note ?? options.noteForNewPurchase ?? 'Nákup z účtenky'

  const before = options.notifyBudget ? await periodSpending(db, purchase.householdId, purchase.date) : null

  if (parts.length === 0) {
    await db.delete(schema.expenses).where(eq(schema.expenses.purchaseId, purchaseId))
    return
  }
  // One batch: the purchase never has zero or a stale mix of expense rows in between.
  await db.batch([
    db.delete(schema.expenses).where(eq(schema.expenses.purchaseId, purchaseId)),
    db.insert(schema.expenses).values(
      parts.map((part) => ({
        householdId: purchase.householdId,
        purchaseId,
        date: purchase.date,
        category: part.category,
        subcategory: part.subcategory,
        amount: part.amount.toString(),
        note: existingNote,
      })),
    ),
  ])
  if (before) await notifyBudgetThresholds(db, purchase.householdId, before, parts.map((part) => ({ category: part.category, amount: part.amount })))
}

/** The household's remembered choice for a product (owner request, 2026-09-27: "aplikace by se měla
 *  postupně učit... ihned po importu účtenky") — the automatic mapping applies until the household
 *  reassigns a product once, whole (not a multi-way split, treated as specific to that one purchase,
 *  not a repeating pattern); from then on every later receipt of the same product starts pre-assigned
 *  to it, the same way `products.default_location` already does for pantry placement. */
export async function getHouseholdProductExpenseDefaults(householdId: string, productIds: string[]): Promise<Map<string, ExpenseTarget>> {
  if (productIds.length === 0) return new Map()
  const rows = await getDb()
    .select({ productId: schema.householdProductExpenseDefaults.productId, category: schema.householdProductExpenseDefaults.category, subcategory: schema.householdProductExpenseDefaults.subcategory })
    .from(schema.householdProductExpenseDefaults)
    .where(and(eq(schema.householdProductExpenseDefaults.householdId, householdId), inArray(schema.householdProductExpenseDefaults.productId, productIds)))
  return new Map(rows.map((row) => [row.productId, { category: row.category, subcategory: row.subcategory }]))
}

/** Pre-assigns a newly-created purchase's items whose product already has a remembered default
 *  (`getHouseholdProductExpenseDefaults` above) — called right after `purchase_items` is inserted, so
 *  the receipt-becomes-expenses split that follows (`recomputePurchaseExpenses`) already honours the
 *  household's earlier reassignment, without them repeating it on every receipt. Returns each item's
 *  resulting splits (empty for one with no default), for building the created purchase's own record
 *  without a second query. */
export async function applyLearnedExpenseDefaults(
  db: ReturnType<typeof getDb>,
  householdId: string,
  itemRows: { id: string; productId: string | null; price: string; quantity: number }[],
): Promise<Map<string, ExpenseSplitPart[]>> {
  const productIds = [...new Set(itemRows.map((row) => row.productId).filter((id): id is string => id != null))]
  const defaults = await getHouseholdProductExpenseDefaults(householdId, productIds)
  const result = new Map<string, ExpenseSplitPart[]>()
  const rowsToInsert: (typeof schema.purchaseItemExpenseSplits.$inferInsert)[] = []
  for (const row of itemRows) {
    const target = row.productId ? defaults.get(row.productId) : undefined
    if (!target) {
      result.set(row.id, [])
      continue
    }
    const amount = Number(row.price) * row.quantity
    result.set(row.id, [{ ...target, amount }])
    rowsToInsert.push({ purchaseItemId: row.id, category: target.category, subcategory: target.subcategory, amount: amount.toString() })
  }
  if (rowsToInsert.length > 0) await db.insert(schema.purchaseItemExpenseSplits).values(rowsToInsert)
  return result
}

/** Remembers or forgets a product's default for this household — a plain reassignment (one target)
 *  is remembered; clearing back to automatic forgets it; a multi-way split leaves it untouched (not a
 *  repeating pattern). No-op without a known product (nothing stable to remember it by). */
async function learnProductExpenseDefault(db: ReturnType<typeof getDb>, householdId: string, productId: string | null, splits: ExpenseSplitPart[]): Promise<void> {
  if (!productId) return
  if (splits.length === 0) {
    await db.delete(schema.householdProductExpenseDefaults).where(and(eq(schema.householdProductExpenseDefaults.householdId, householdId), eq(schema.householdProductExpenseDefaults.productId, productId)))
    return
  }
  if (splits.length > 1) return
  const [{ category, subcategory }] = splits
  await db
    .insert(schema.householdProductExpenseDefaults)
    .values({ householdId, productId, category, subcategory })
    .onConflictDoUpdate({ target: [schema.householdProductExpenseDefaults.householdId, schema.householdProductExpenseDefaults.productId], set: { category, subcategory, updatedAt: new Date() } })
}

/** Sets (`splits` non-empty) or clears (`splits: []`) one purchase-item's expense split, remembers a
 *  plain reassignment for the product (see above), and recomputes the purchase's expenses to match.
 *  Every split's `amount` must be positive and they must add up to exactly the item's own paid amount
 *  (`price × quantity`, to the nearest haléř) — a split that silently didn't cover the whole line
 *  would understate it, and one that overcovered it would double-count part of it. Throws if the item
 *  does not belong to `householdId`'s own purchase, or if a target is not a valid category/
 *  subcategory pair (CLAUDE.md section 9: never trust client input). */
export async function setPurchaseItemExpenseSplits(householdId: string, purchaseItemId: string, splits: ExpenseSplitPart[]): Promise<void> {
  if (splits.length > MAX_SPLITS_PER_ITEM) throw new InvalidExpenseSplitError(`Položku lze rozdělit nejvýš na ${MAX_SPLITS_PER_ITEM} částí.`)
  for (const split of splits) {
    if (!isExpenseCategory(split.category)) throw new InvalidExpenseCategoryError('Neplatná kategorie výdaje.')
    if (!isValidSubcategory(split.category, split.subcategory)) throw new InvalidExpenseCategoryError('Neplatná podkategorie výdaje.')
    if (!(split.amount > 0) || !Number.isFinite(split.amount)) throw new InvalidExpenseSplitError('Částka části musí být kladná.')
  }

  const db = getDb()
  const item = await db.query.purchaseItems.findFirst({
    where: eq(schema.purchaseItems.id, purchaseItemId),
    columns: { purchaseId: true, productId: true, price: true, quantity: true },
    with: { purchase: { columns: { householdId: true } } },
  })
  if (!item || item.purchase.householdId !== householdId) throw new PurchaseNotFoundError('Položka nákupu neexistuje.')

  if (splits.length > 0) {
    const itemAmountHalere = Math.round(Number(item.price) * item.quantity * 100)
    const splitHalere = Math.round(splits.reduce((sum, split) => sum + split.amount, 0) * 100)
    if (splitHalere !== itemAmountHalere) {
      throw new InvalidExpenseSplitError('Součet částí musí odpovídat celé částce položky.')
    }
  }

  if (splits.length === 0) {
    await db.delete(schema.purchaseItemExpenseSplits).where(eq(schema.purchaseItemExpenseSplits.purchaseItemId, purchaseItemId))
  } else {
    await db.batch([
      db.delete(schema.purchaseItemExpenseSplits).where(eq(schema.purchaseItemExpenseSplits.purchaseItemId, purchaseItemId)),
      db.insert(schema.purchaseItemExpenseSplits).values(splits.map((split) => ({ purchaseItemId, category: split.category, subcategory: split.subcategory, amount: split.amount.toString() }))),
    ])
  }
  await learnProductExpenseDefault(db, householdId, item.productId, splits)

  // A plain budget assignment can also be the product's canonical classification. When it is,
  // propagate it back to the shared product so Zásoby, future receipts and historical ordinary
  // expenses all show the same category/subcategory. A non-product expense target (e.g. Dárky)
  // remains a one-purchase override, and a multi-way split remains purchase-specific.
  if (item.productId && splits.length === 1) {
    const target = splits[0]
    const itemCategories: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
    if (itemCategories.includes(target.category as ItemCategory) && isValidProductSubcategory(target.category as ItemCategory, target.subcategory)) {
      const product = await db.query.products.findFirst({ where: eq(schema.products.id, item.productId), columns: { categoryId: true, subcategoryId: true } })
      const categoryRow = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, target.category as ItemCategory), columns: { id: true } })
      const targetSubcategory = target.subcategory
        ? await db.query.productSubcategories.findFirst({ where: and(eq(schema.productSubcategories.category, target.category as ItemCategory), eq(schema.productSubcategories.name, target.subcategory)), columns: { id: true } })
        : null
      if (categoryRow && target.subcategory && !targetSubcategory) throw new InvalidExpenseCategoryError('Neplatná podkategorie výdaje.')
      if (categoryRow && (product?.categoryId !== categoryRow.id || product.subcategoryId !== (targetSubcategory?.id ?? null))) {
        await db.update(schema.products).set({ categoryId: categoryRow.id, subcategoryId: targetSubcategory?.id ?? null }).where(eq(schema.products.id, item.productId))
        await syncProductClassificationToPurchases(item.productId)
        return
      }
    }
  }
  await recomputePurchaseExpenses(db, item.purchaseId)
}

export type PurchaseExpenseItem = {
  id: string
  name: string
  quantity: number
  unit: ItemUnit
  price: number
  category: ItemCategory | null
  expenseSplits: ExpenseSplitPart[]
  /** This item's own amount actually counted under the requested target — equal to
   *  `price × quantity` unless the item is split across more than one target, in which case it is
   *  only the part of it that landed here. */
  matchedAmount: number
}

/** The purchase-items actually behind one category's (or subcategory's) amount for one purchase —
 *  the "exact items, not just the whole receipt" view (owner request, 2026-09-27), so a household can
 *  check (and, per item, correct) what went into that number. Resolved with the exact same
 *  `targetsOf()` `recomputePurchaseExpenses` uses, so this can never show a different answer than
 *  what the expense total actually is. Items with no known category (an old purchase) contribute
 *  nothing to any target and are correctly absent here, same as in the real split. */
export async function getPurchaseItemsForExpense(householdId: string, purchaseId: string, target: ExpenseTarget): Promise<PurchaseExpenseItem[]> {
  const db = getDb()
  const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchaseId), columns: { householdId: true } })
  if (!purchase || purchase.householdId !== householdId) throw new PurchaseNotFoundError('Nákup neexistuje.')

  const items = await db.query.purchaseItems.findMany({
    where: eq(schema.purchaseItems.purchaseId, purchaseId),
    columns: { id: true, name: true, quantity: true, unit: true, price: true, category: true },
    with: { subcategory: { columns: { name: true } }, expenseSplits: { columns: { category: true, subcategory: true, amount: true } } },
  })
  const result: PurchaseExpenseItem[] = []
  for (const item of items) {
    if (item.category == null) continue
    const expenseSplits = item.expenseSplits.map((split) => ({ category: split.category, subcategory: split.subcategory, amount: Number(split.amount) }))
    const line: PurchaseExpenseLine = { category: item.category, amount: Number(item.price) * item.quantity, subcategory: item.subcategory?.name ?? null, expenseOverride: expenseSplits }
    const matched = targetsOf(line).find((entry) => sameExpenseTarget(entry.target, target))
    if (!matched) continue
    result.push({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, price: Number(item.price), category: item.category, expenseSplits, matchedAmount: matched.weight })
  }
  return result.sort((a, b) => b.matchedAmount - a.matchedAmount)
}

/** Records a receipt-derived purchase's items into the budget after the fact — for one imported
 *  before receipts started counting as expenses (2026-09-26), or otherwise missed (owner request,
 *  2026-09-27: "k již nahraný účtenkám bych chtěl možnost, aby se zapsali do rozpočtu dodatečně").
 *  Refuses a purchase that did not come from a receipt (a completed shopping list's prices are
 *  estimates, never counted — CLAUDE.md/owner's choice, 2026-09-26) or one that already has expenses
 *  (recomputePurchaseExpenses is for correcting those, not this). */
export async function recordPurchaseAsExpense(householdId: string, purchaseId: string): Promise<void> {
  const db = getDb()
  const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchaseId), columns: { householdId: true } })
  if (!purchase || purchase.householdId !== householdId) throw new PurchaseNotFoundError('Nákup neexistuje.')

  const fromReceipt = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.purchaseId, purchaseId), columns: { id: true } })
  if (!fromReceipt) throw new NotFromReceiptError('Tento nákup nepochází z účtenky.')

  const existing = await db.query.expenses.findFirst({ where: eq(schema.expenses.purchaseId, purchaseId), columns: { id: true } })
  if (existing) throw new AlreadyRecordedError('Tento nákup je už v rozpočtu zapsaný.')

  // An item from before purchase_items.category existed (migration 0042) has no known category —
  // nothing invents one for it now (CLAUDE.md section 5), so if every item on this purchase is that
  // old, there is genuinely nothing to record.
  const hasCategorizedItem = await db.query.purchaseItems.findFirst({ where: and(eq(schema.purchaseItems.purchaseId, purchaseId), isNotNull(schema.purchaseItems.category)), columns: { id: true } })
  if (!hasCategorizedItem) throw new NothingToRecordError('U položek tohoto nákupu neznáme kategorii, nelze je zapsat do rozpočtu.')

  await recomputePurchaseExpenses(db, purchaseId, { notifyBudget: true, noteForNewPurchase: 'Nákup z účtenky' })
}
