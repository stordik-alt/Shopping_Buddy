import type { Expense, Item, ItemCategory } from '@/lib/types'

export const TODAY = '2026-09-19'
export const MONTH_START = '2026-09-01'
export const DAYS_IN_MONTH = 30
export const PREVIOUS_MONTH_TOTAL = 8120

function daysElapsed(from: string, to: string) {
  const diff = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
  return Math.max(1, Math.round(diff) + 1)
}

export function totalSpent(expenses: Expense[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

export function dailyAverage(expenses: Expense[], today = TODAY) {
  return totalSpent(expenses) / daysElapsed(MONTH_START, today)
}

export function weeklyAverage(expenses: Expense[], today = TODAY) {
  return dailyAverage(expenses, today) * 7
}

export function projectedMonthEnd(expenses: Expense[], today = TODAY) {
  return dailyAverage(expenses, today) * DAYS_IN_MONTH
}

export function categoryBreakdown(expenses: Expense[]): { category: ItemCategory; total: number }[] {
  const totals = new Map<ItemCategory, number>()
  for (const expense of expenses) totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

export function plannedSpend(items: Item[]) {
  return items.filter((item) => !item.done).reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function monthOverMonthChange(expenses: Expense[]) {
  const current = totalSpent(expenses)
  return { current, previous: PREVIOUS_MONTH_TOTAL, changePercent: ((current - PREVIOUS_MONTH_TOTAL) / PREVIOUS_MONTH_TOTAL) * 100 }
}

/** Whether a planned cost (e.g. a shopping trip) fits the household's remaining budget, and how
 *  much of it that cost would use up. `percentOfRemaining` is null when there's no positive
 *  remaining budget left to express a percentage of. */
export function budgetImpact(cost: number, remaining: number): { overBudget: boolean; percentOfRemaining: number | null } {
  return {
    overBudget: cost > remaining,
    percentOfRemaining: remaining > 0 ? (cost / remaining) * 100 : null,
  }
}

export type BudgetThreshold = 'reached' | 'exceeded'

/** Detects whether spending just crossed the 80% ("reached") or 100% ("exceeded") budget
 *  threshold, comparing totals from strictly before and after one new expense. Used to fire a
 *  notification exactly once at the moment of crossing rather than on every expense once already
 *  over — e.g. adding a 2nd expense while already at 105% must not re-fire "exceeded". */
export function crossedBudgetThreshold(spentBefore: number, spentAfter: number, budget: number): BudgetThreshold | null {
  if (budget <= 0) return null
  const before = spentBefore / budget
  const after = spentAfter / budget
  if (before < 1 && after >= 1) return 'exceeded'
  if (before < 0.8 && after >= 0.8) return 'reached'
  return null
}
