import { EXPENSE_CATEGORY_NAMES, type ExpenseCategory } from '@/lib/expense-categories'
import type { Expense, Item } from '@/lib/types'

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

export function categoryBreakdown(expenses: Expense[]): { category: ExpenseCategory; total: number }[] {
  const totals = new Map<ExpenseCategory, number>()
  for (const expense of expenses) totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

/** `YYYY-MM` of an ISO date — the key the expense overview pages by. */
export const expenseMonth = monthKey

/** The months the overview can show, newest first: the current month (even with nothing in it yet)
 *  and every month with an expense. */
export function expenseMonths(expenses: Expense[], today: string): string[] {
  const months = new Set([monthKey(today), ...expenses.map((expense) => monthKey(expense.date))])
  return [...months].sort().reverse()
}

export type CategorySummary = {
  category: ExpenseCategory
  total: number
  /** Per subcategory, largest first; expenses without one are summed under `null`. */
  subcategories: { subcategory: string | null; total: number }[]
  /** The category's expenses, newest first. */
  expenses: Expense[]
}

/** One month's expenses by category and subcategory — what was paid, on what, and when. Categories
 *  with the most spent first (ties in the fixed category order); only categories with an expense. */
export function monthSummary(expenses: Expense[], month: string): { total: number; categories: CategorySummary[] } {
  const inMonth = expenses.filter((expense) => monthKey(expense.date) === month)
  const categories: CategorySummary[] = []
  for (const category of EXPENSE_CATEGORY_NAMES) {
    const own = inMonth.filter((expense) => expense.category === category)
    if (own.length === 0) continue
    const bySub = new Map<string | null, number>()
    for (const expense of own) bySub.set(expense.subcategory, (bySub.get(expense.subcategory) ?? 0) + expense.amount)
    categories.push({
      category,
      total: totalSpent(own),
      subcategories: [...bySub.entries()].map(([subcategory, total]) => ({ subcategory, total })).sort((a, b) => b.total - a.total),
      expenses: own.slice().sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)),
    })
  }
  categories.sort((a, b) => b.total - a.total)
  return { total: totalSpent(inMonth), categories }
}

export type CategoryRow = CategorySummary & {
  /** The category's monthly limit, or null without one. */
  limit: number | null
  /** Spending against the limit (`ok` without one): the same 80 % / 100 % bands as the budget. */
  level: BudgetLevel
}

/** A month's categories with their limits: every category with an expense, plus every category with
 *  a limit even when nothing was spent in it yet (a limit is worth seeing at 0 Kč). Most spent first;
 *  limited categories without spending last, in the fixed category order. */
export function categoryRows(summary: { categories: CategorySummary[] }, limits: Partial<Record<ExpenseCategory, number>>): CategoryRow[] {
  const withLimit = (entry: CategorySummary): CategoryRow => {
    const limit = limits[entry.category] ?? null
    return { ...entry, limit, level: limit == null ? 'ok' : budgetLevel(entry.total, limit) }
  }
  const spent = summary.categories.map(withLimit)
  const unspent = EXPENSE_CATEGORY_NAMES.filter((category) => limits[category] != null && !summary.categories.some((entry) => entry.category === category)).map(
    (category) => withLimit({ category, total: 0, subcategories: [], expenses: [] }),
  )
  return [...spent, ...unspent]
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
export const BUDGET_WARNING_RATIO = 0.8
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

/** How much of what is left can go on one week, so the rest of the month is still covered: the
 *  remaining budget spread over the weeks left in the month, counting today. In the last week the
 *  whole remainder is available. Nothing when the budget is used up. */
/** A projection needs some history: before the 7th, one big shop on the 2nd would extrapolate to
 *  a month many times over the limit. Until then only the daily allowance is shown. */
export const PACE_MIN_DAYS = 7

/** Where the month is heading, for the budget card: how much may be spent per remaining day
 *  (today included) to stay within the limit, and — from `PACE_MIN_DAYS` on — the month-end total
 *  at the current daily rate and by how much it would exceed the limit. `null` without a budget.
 *  Deterministic from this month's spending; no guessing about future shops. */
export function budgetPace(
  monthSpent: number,
  budget: number,
  today: string,
): { daysLeft: number; perDayLeft: number; projected: number | null; projectedOver: number | null } | null {
  if (budget <= 0) return null
  const day = Number(today.slice(8, 10))
  const daysLeft = daysInMonth(today) - day + 1
  const perDayLeft = Math.max(0, budget - monthSpent) / daysLeft
  const projected = day >= PACE_MIN_DAYS ? (monthSpent / day) * daysInMonth(today) : null
  const projectedOver = projected != null && projected > budget ? projected - budget : null
  return { daysLeft, perDayLeft, projected, projectedOver }
}

export function weeklyAllowance(remaining: number, today: string): number {
  if (remaining <= 0) return 0
  const daysLeft = daysInMonth(today) - Number(today.slice(8, 10)) + 1
  return remaining / Math.max(1, daysLeft / 7)
}
