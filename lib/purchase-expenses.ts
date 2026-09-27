import type { ExpenseCategory } from '@/lib/expense-categories'
import type { ItemCategory } from '@/lib/types'

// A receipt's purchase counted as expenses (the owner's choice, 2026-09-26: only receipts — what was
// really paid — never the estimated prices of a finished shopping list). The amount paid is split by
// the items' categories, so groceries and drugstore goods of one trip land in their own categories.
//
// Update 2026-09-27 (owner request): a household can override one line's category — e.g. a gift
// bought during an otherwise ordinary grocery trip, counted under Ostatní ▸ Dárky instead of
// Potraviny — instead of always taking the automatic mapping below. Pure and deterministic;
// app/actions/receipts.ts and lib/db/purchase-items.ts write the result.

/** The item categories are the first five expense categories, by the same names. */
const EXPENSE_CATEGORY_OF_ITEM: Record<ItemCategory, ExpenseCategory> = {
  Potraviny: 'Potraviny',
  Drogerie: 'Drogerie',
  Děti: 'Děti',
  Domácnost: 'Domácnost',
  Ostatní: 'Ostatní',
}

export type PurchaseExpenseLine = {
  category: ItemCategory
  amount: number
  /** The household's own choice for this one line, replacing the automatic mapping above. `null`/
   *  absent means "use the automatic mapping". */
  expenseOverride?: { category: ExpenseCategory; subcategory: string | null } | null
}

export type ExpenseShare = { category: ExpenseCategory; subcategory: string | null; amount: number }

/** Where one line's amount is counted: its household override if it has one, otherwise the automatic
 *  mapping of its shopping category (no subcategory — the automatic mapping does not guess one). */
function targetOf(line: Pick<PurchaseExpenseLine, 'category' | 'expenseOverride'>): { category: ExpenseCategory; subcategory: string | null } {
  return line.expenseOverride ?? { category: EXPENSE_CATEGORY_OF_ITEM[line.category], subcategory: null }
}

/** `total` (what the receipt says was paid) split by the lines' expense targets in proportion to
 *  what each line cost, in whole haléře, so the parts add up to exactly the total: each target gets
 *  its rounded-down share and the haléře left over go one by one to the largest remainders (ties by
 *  the category and subcategory, so the result never depends on line order). Lines worth nothing
 *  (all zero) put the whole total under the first line's target. Targets with nothing are left out. */
export function splitPurchaseByCategory(lines: PurchaseExpenseLine[], total: number): ExpenseShare[] {
  const totalHalere = Math.round(total * 100)
  if (lines.length === 0 || totalHalere <= 0) return []
  const targetKey = (target: { category: ExpenseCategory; subcategory: string | null }) => `${target.category}\u0000${target.subcategory ?? ''}`

  const byTarget = new Map<string, { target: { category: ExpenseCategory; subcategory: string | null }; weight: number }>()
  for (const line of lines) {
    const target = targetOf(line)
    const key = targetKey(target)
    const existing = byTarget.get(key)
    byTarget.set(key, { target, weight: (existing?.weight ?? 0) + Math.max(0, line.amount) })
  }
  const weights = [...byTarget.values()].sort((a, b) => targetKey(a.target).localeCompare(targetKey(b.target), 'cs'))
  const weightSum = weights.reduce((sum, entry) => sum + entry.weight, 0)
  if (weightSum <= 0) {
    const target = targetOf(lines[0])
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
