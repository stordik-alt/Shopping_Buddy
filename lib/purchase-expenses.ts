import type { ExpenseCategory } from '@/lib/expense-categories'
import type { ItemCategory } from '@/lib/types'

// A receipt's purchase counted as expenses (the owner's choice, 2026-09-26: only receipts — what was
// really paid — never the estimated prices of a finished shopping list). The amount paid is split by
// the items' categories, so groceries and drugstore goods of one trip land in their own categories.
// Pure and deterministic; app/actions/receipts.ts writes the result.

/** The item categories are the first five expense categories, by the same names. */
const EXPENSE_CATEGORY_OF_ITEM: Record<ItemCategory, ExpenseCategory> = {
  Potraviny: 'Potraviny',
  Drogerie: 'Drogerie',
  Děti: 'Děti',
  Domácnost: 'Domácnost',
  Ostatní: 'Ostatní',
}

/** `total` (what the receipt says was paid) split by the items' categories in proportion to what
 *  each line cost, in whole haléře, so the parts add up to exactly the total: each category gets its
 *  rounded-down share and the haléře left over go one by one to the largest remainders (ties by the
 *  category name, so the result never depends on item order). Lines worth nothing (all zero) put the
 *  whole total under the first item's category. Categories with nothing are left out. */
export function splitPurchaseByCategory(lines: { category: ItemCategory; amount: number }[], total: number): { category: ExpenseCategory; amount: number }[] {
  const totalHalere = Math.round(total * 100)
  if (lines.length === 0 || totalHalere <= 0) return []
  const byCategory = new Map<ExpenseCategory, number>()
  for (const line of lines) {
    const category = EXPENSE_CATEGORY_OF_ITEM[line.category]
    byCategory.set(category, (byCategory.get(category) ?? 0) + Math.max(0, line.amount))
  }
  const weights = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'))
  const weightSum = weights.reduce((sum, [, weight]) => sum + weight, 0)
  if (weightSum <= 0) return [{ category: EXPENSE_CATEGORY_OF_ITEM[lines[0].category], amount: totalHalere / 100 }]

  const shares = weights.map(([category, weight]) => {
    const exact = (totalHalere * weight) / weightSum
    return { category, halere: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let left = totalHalere - shares.reduce((sum, share) => sum + share.halere, 0)
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.category.localeCompare(b.category, 'cs'))) {
    if (left <= 0) break
    share.halere++
    left--
  }
  return shares.filter((share) => share.halere > 0).map((share) => ({ category: share.category, amount: share.halere / 100 }))
}
