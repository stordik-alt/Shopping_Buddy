import type { ExpenseCategory } from '@/lib/expense-categories'

export type SpendingCategoryTotal = { category: ExpenseCategory; total: number }

export type SpendingDonutSegment =
  | { kind: 'category'; category: ExpenseCategory; total: number }
  | { kind: 'other'; categories: SpendingCategoryTotal[]; total: number }

/** Group very small wedges in the visual ring while keeping their individual legend rows intact. */
export function spendingDonutSegments(rows: SpendingCategoryTotal[], minimumShare = 0.03): SpendingDonutSegment[] {
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  if (total <= 0) return []

  const visible: SpendingDonutSegment[] = []
  const small: SpendingCategoryTotal[] = []
  for (const row of rows) {
    if (row.total <= 0) continue
    if (row.total / total < minimumShare) small.push(row)
    else visible.push({ kind: 'category', category: row.category, total: row.total })
  }
  if (small.length > 0) visible.push({ kind: 'other', categories: small, total: small.reduce((sum, row) => sum + row.total, 0) })
  return visible
}
