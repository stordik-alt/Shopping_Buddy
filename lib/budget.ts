import type { Expense, Item, ItemCategory } from '@/lib/types'

// The budget is monthly. Every function below takes `today` (`YYYY-MM-DD`, from lib/today.ts) and
// works on the calendar month it falls in, so the numbers move with the real date instead of a fixed
// demo month. Dates are handled as strings, never as `Date` objects, so no time zone can shift a day.

/** `YYYY-MM` of an ISO date. */
const monthKey = (isoDate: string) => isoDate.slice(0, 7)

/** Number of days in the month `today` falls in (28–31). */
export function daysInMonth(today: string): number {
  const [year, month] = today.split('-').map(Number)
  // Day 0 of the next month is the last day of this one; UTC so no local offset is involved.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** `YYYY-MM` of the month before the one `today` falls in. */
export function previousMonthKey(today: string): string {
  const [year, month] = today.split('-').map(Number)
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

/** The expenses dated in the same calendar month as `today` — what "this month" means everywhere
 *  the monthly budget is shown or checked. */
export function expensesInMonth(expenses: Expense[], today: string): Expense[] {
  const key = monthKey(today)
  return expenses.filter((expense) => monthKey(expense.date) === key)
}

export function totalSpent(expenses: Expense[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

/** This month's spending per day so far: days elapsed count the 1st through `today` inclusive, so
 *  the 1st of the month divides by 1, never by 0. */
export function dailyAverage(expenses: Expense[], today: string) {
  const daysElapsed = Number(today.slice(8, 10))
  return totalSpent(expensesInMonth(expenses, today)) / daysElapsed
}

export function weeklyAverage(expenses: Expense[], today: string) {
  return dailyAverage(expenses, today) * 7
}

/** This month's spending extrapolated to the whole month at the current daily rate. */
export function projectedMonthEnd(expenses: Expense[], today: string) {
  return dailyAverage(expenses, today) * daysInMonth(today)
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

/** This month's spending so far against the same part of the previous month: the 1st through the
 *  same day (capped at that month's last day, e.g. 31 March compares with the whole of February).
 *  Comparing a running month with a whole finished one would read "you spend less" every early
 *  month. From the household's real expenses; `null` when the previous month has no expenses up to
 *  that day — there is nothing to compare with, and a baseline is never invented (it used to be a
 *  fixed 8 120 Kč). */
export function monthOverMonthChange(expenses: Expense[], today: string): { current: number; previous: number; changePercent: number } | null {
  const current = totalSpent(expensesInMonth(expenses, today))
  const previousKey = previousMonthKey(today)
  const lastComparableDay = Math.min(Number(today.slice(8, 10)), daysInMonth(`${previousKey}-01`))
  const previous = totalSpent(
    expenses.filter((expense) => monthKey(expense.date) === previousKey && Number(expense.date.slice(8, 10)) <= lastComparableDay),
  )
  if (previous <= 0) return null
  return { current, previous, changePercent: ((current - previous) / previous) * 100 }
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

// Shared by the notification trigger below and the dashboard's colour state, so "80 %" and "100 %"
// can never mean different things in two places.
const BUDGET_WARNING_RATIO = 0.8
const BUDGET_LIMIT_RATIO = 1

export type BudgetLevel = 'ok' | 'warning' | 'over'

/** Where current spending stands against the monthly budget: below 80 % is `ok`, 80 % up to (not
 *  including) 100 % is `warning`, 100 % or more is `over`. Without a positive budget there is
 *  nothing to measure against, so it is `ok` rather than an alarming `over`. */
export function budgetLevel(spent: number, budget: number): BudgetLevel {
  if (budget <= 0) return 'ok'
  const ratio = spent / budget
  if (ratio >= BUDGET_LIMIT_RATIO) return 'over'
  if (ratio >= BUDGET_WARNING_RATIO) return 'warning'
  return 'ok'
}

/** Detects whether spending just crossed the 80% ("reached") or 100% ("exceeded") budget
 *  threshold, comparing totals from strictly before and after one new expense. Used to fire a
 *  notification exactly once at the moment of crossing rather than on every expense once already
 *  over — e.g. adding a 2nd expense while already at 105% must not re-fire "exceeded". */
export function crossedBudgetThreshold(spentBefore: number, spentAfter: number, budget: number): BudgetThreshold | null {
  if (budget <= 0) return null
  const before = spentBefore / budget
  const after = spentAfter / budget
  if (before < BUDGET_LIMIT_RATIO && after >= BUDGET_LIMIT_RATIO) return 'exceeded'
  if (before < BUDGET_WARNING_RATIO && after >= BUDGET_WARNING_RATIO) return 'reached'
  return null
}
