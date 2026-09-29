import { isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'
import type { ItemCategory } from '@/lib/types'

// A receipt's purchase counted as expenses (the owner's choice, 2026-09-26: only receipts — what was
// really paid — never the estimated prices of a finished shopping list). The amount paid is split by
// the items' categories, so groceries and drugstore goods of one trip land in their own categories.
//
// Update 2026-09-27 (owner request): a household can override where one line's amount is counted —
// either as a plain reassignment (e.g. a gift bought during an otherwise ordinary grocery trip,
// counted under Ostatní ▸ Dárky instead of Potraviny) or, since a receipt often can't say which,
// split across more than one target (e.g. "Oblečení" that was actually half adult, half a child's
// clothing) — instead of always taking the automatic mapping below. Pure and deterministic;
// app/actions/receipts.ts and lib/db/purchase-items.ts write the result.

/** The item categories are the first five expense categories, by the same names. */
const EXPENSE_CATEGORY_OF_ITEM: Record<ItemCategory, ExpenseCategory> = {
  Potraviny: 'Potraviny',
  Drogerie: 'Drogerie',
  Děti: 'Děti',
  Domácnost: 'Domácnost',
  Ostatní: 'Ostatní',
}

/** The expense category a shopping category falls under automatically, with no household override —
 *  what a purchase-item's expense-split dialog starts from (components/budget/). */
export function automaticExpenseCategory(category: ItemCategory): ExpenseCategory {
  return EXPENSE_CATEGORY_OF_ITEM[category]
}

export type ExpenseTarget = { category: ExpenseCategory; subcategory: string | null }
export type ExpenseSplitPart = ExpenseTarget & { amount: number }

export type PurchaseExpenseLine = {
  category: ItemCategory
  amount: number
  /** The item's own subcategory (lib/product-subcategories.ts), e.g. "Pečivo". Used by the automatic
   *  mapping when the expense category offers the same subcategory, so a receipt line lands in
   *  Potraviny ▸ Pečivo without the household assigning it. */
  subcategory?: string | null
  /** The household's own split of this one line's amount across expense targets, replacing the
   *  automatic mapping above — one entry is a plain reassignment, more than one a genuine split.
   *  Every entry's `amount` is a weight within this line (like every other line's `amount`, it is
   *  scaled to the purchase's real total, so it need not itself be exact down to the last haléř).
   *  Absent/empty means "use the automatic mapping" for the whole line. */
  expenseOverride?: ExpenseSplitPart[]
}

export type ExpenseShare = ExpenseTarget & { amount: number }

/** Where one line's amount is counted, as (target, weight) pairs: its household split if it has one,
 *  otherwise the automatic mapping of its shopping category (no subcategory — the automatic mapping
 *  does not guess one), as the line's one and only target. Exported so the Výdaje breakdown can
 *  answer "which of this purchase's items are actually behind this category?" using the exact same
 *  resolution `splitPurchaseByCategory` uses, not a second copy of it (CLAUDE.md section 6). */
export function targetsOf(line: Pick<PurchaseExpenseLine, 'category' | 'amount' | 'subcategory' | 'expenseOverride'>): { target: ExpenseTarget; weight: number }[] {
  if (line.expenseOverride && line.expenseOverride.length > 0) {
    return line.expenseOverride.map(({ amount, ...target }) => ({ target, weight: amount }))
  }
  const category = EXPENSE_CATEGORY_OF_ITEM[line.category]
  // Only Potraviny: its expense subcategories are the product subcategories (one vocabulary). The
  // other categories' expense lists differ from the product lists, so nothing is guessed across.
  const subcategory = line.category === 'Potraviny' && line.subcategory && isValidSubcategory(category, line.subcategory) ? line.subcategory : null
  return [{ target: { category, subcategory }, weight: line.amount }]
}

/** Whether two targets are the same category and subcategory (both `null` counts as equal). */
export function sameExpenseTarget(a: ExpenseTarget, b: ExpenseTarget): boolean {
  return a.category === b.category && a.subcategory === b.subcategory
}

/** `total` (what the receipt says was paid) split by the lines' expense targets in proportion to
 *  what each target is worth, in whole haléře, so the parts add up to exactly the total: each target
 *  gets its rounded-down share and the haléře left over go one by one to the largest remainders (ties
 *  by the category and subcategory, so the result never depends on line order). Lines worth nothing
 *  (all zero) put the whole total under the first line's target. Targets with nothing are left out. */
export function splitPurchaseByCategory(lines: PurchaseExpenseLine[], total: number): ExpenseShare[] {
  const totalHalere = Math.round(total * 100)
  if (lines.length === 0 || totalHalere <= 0) return []
  const targetKey = (target: ExpenseTarget) => `${target.category}\u0000${target.subcategory ?? ''}`

  const byTarget = new Map<string, { target: ExpenseTarget; weight: number }>()
  for (const line of lines) {
    for (const { target, weight } of targetsOf(line)) {
      const key = targetKey(target)
      const existing = byTarget.get(key)
      byTarget.set(key, { target, weight: (existing?.weight ?? 0) + Math.max(0, weight) })
    }
  }
  const weights = [...byTarget.values()].sort((a, b) => targetKey(a.target).localeCompare(targetKey(b.target), 'cs'))
  const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0)
  if (weightSum <= 0) {
    const target = targetsOf(lines[0])[0].target
    return [{ ...target, amount: totalHalere / 100 }]
  }

  const shares = weights.map(({ target, weight }) => {
    const exact = (totalHalere * weight) / weightSum
    return { target, halere: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let left = totalHalere - shares.reduce((sum, share) => sum + share.halere, 0)
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || targetKey(a.target).localeCompare(targetKey(b.target), 'cs'))) {
    if (left <= 0) break
    share.halere++
    left--
  }
  return shares.filter((share) => share.halere > 0).map((share) => ({ ...share.target, amount: share.halere / 100 }))
}
