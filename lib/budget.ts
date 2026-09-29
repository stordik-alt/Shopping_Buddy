import { EXPENSE_CATEGORY_NAMES, type ExpenseCategory } from '@/lib/expense-categories'
import type { Expense, Item } from '@/lib/types'

// The budget runs over a period that starts on the household's chosen day of the month (1–28): with
// day 1 that is the calendar month, with 28 it is "28th to 27th of the next month". Every function
// below takes `today` (`YYYY-MM-DD`, from lib/today.ts) and the household's `startDay`, and works on
// the period `today` falls in, so the numbers move with the real date. A period is identified by its
// start date (`YYYY-MM-DD`). Dates are handled as strings and UTC day numbers, never local `Date`s,
// so no time zone can shift a day. `startDay` defaults to 1, which is exactly the calendar month.

/** The latest day of the month a period may start on: every month has one, so the period always
 *  begins on a real date (a start on the 31st would have no February). */
export const MAX_PERIOD_START_DAY = 28

const DAY_MS = 86_400_000

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Whole days since the Unix epoch of an ISO date. */
const dayNumber = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

const isoFromDayNumber = (days: number) => new Date(days * DAY_MS).toISOString().slice(0, 10)

/** Whether `value` is a usable period start day: a whole number from 1 to 28. */
export const isValidPeriodStartDay = (value: number) => Number.isInteger(value) && value >= 1 && value <= MAX_PERIOD_START_DAY

/** The first day of the period `date` falls in: the latest `startDay` on or before it. */
export function periodStart(date: string, startDay = 1): string {
  const [year, month, day] = date.split('-').map(Number)
  if (day >= startDay) return `${year}-${pad2(month)}-${pad2(startDay)}`
  return month === 1 ? `${year - 1}-12-${pad2(startDay)}` : `${year}-${pad2(month - 1)}-${pad2(startDay)}`
}

/** The first day of the period after the one that starts on `start` (a value from periodStart). */
export function nextPeriodStart(start: string): string {
  const [year, month, day] = start.split('-').map(Number)
  return month === 12 ? `${year + 1}-01-${pad2(day)}` : `${year}-${pad2(month + 1)}-${pad2(day)}`
}

/** The last day (inclusive) of the period that starts on `start`. */
export function periodEnd(start: string): string {
  return isoFromDayNumber(dayNumber(nextPeriodStart(start)) - 1)
}

/** Number of days in the period that starts on `start` (28–31). */
function periodLengthFrom(start: string): number {
  return dayNumber(nextPeriodStart(start)) - dayNumber(start)
}

/** The start of the period before the one `today` falls in. */
export function previousPeriodStart(today: string, startDay = 1): string {
  return periodStart(isoFromDayNumber(dayNumber(periodStart(today, startDay)) - 1), startDay)
}

/** Number of days in the period `today` falls in (28–31). */
export function periodLength(today: string, startDay = 1): number {
  return periodLengthFrom(periodStart(today, startDay))
}

/** Which day of its period `today` is, counting the first day as 1 — so the first day of a period
 *  divides by 1, never by 0. */
export function periodDay(today: string, startDay = 1): number {
  return dayNumber(today) - dayNumber(periodStart(today, startDay)) + 1
}

/** Days left in the period, today included (1 on its last day). */
export function periodDaysLeft(today: string, startDay = 1): number {
  return periodLength(today, startDay) - periodDay(today, startDay) + 1
}

/** The expenses dated in the period `today` falls in — what "this month" means everywhere the
 *  monthly budget is shown or checked. */
export function expensesInPeriod(expenses: Expense[], today: string, startDay = 1): Expense[] {
  const key = periodStart(today, startDay)
  return expenses.filter((expense) => periodStart(expense.date, startDay) === key)
}

export function totalSpent(expenses: Expense[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

/** This period's spending per day so far: days elapsed count its first day through `today`
 *  inclusive, so the first day divides by 1, never by 0. */
export function dailyAverage(expenses: Expense[], today: string, startDay = 1) {
  return totalSpent(expensesInPeriod(expenses, today, startDay)) / periodDay(today, startDay)
}

export function weeklyAverage(expenses: Expense[], today: string, startDay = 1) {
  return dailyAverage(expenses, today, startDay) * 7
}

/** This period's spending extrapolated to the whole period at the current daily rate. */
export function projectedPeriodEnd(expenses: Expense[], today: string, startDay = 1) {
  return dailyAverage(expenses, today, startDay) * periodLength(today, startDay)
}

export function categoryBreakdown(expenses: Expense[]): { category: ExpenseCategory; total: number }[] {
  const totals = new Map<ExpenseCategory, number>()
  for (const expense of expenses) totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

/** The period key (its start date) of an expense's date — what the expense overview pages by. */
export const expensePeriod = periodStart

/** The periods the overview can show, newest first: the current one (even with nothing in it yet)
 *  and every period with an expense. Keys are period start dates. */
export function expensePeriods(expenses: Expense[], today: string, startDay = 1): string[] {
  const periods = new Set([periodStart(today, startDay), ...expenses.map((expense) => periodStart(expense.date, startDay))])
  return [...periods].sort().reverse()
}

export type CategorySummary = {
  category: ExpenseCategory
  total: number
  /** Per subcategory, largest first; expenses without one are summed under `null`. */
  subcategories: { subcategory: string | null; total: number }[]
  /** The category's expenses, newest first. */
  expenses: Expense[]
}

/** One period's expenses by category and subcategory — what was paid, on what, and when. Categories
 *  with the most spent first (ties in the fixed category order); only categories with an expense.
 *  `period` is the period's start date; `startDay` must be the one it was made with. */
export function periodSummary(expenses: Expense[], period: string, startDay = 1): { total: number; categories: CategorySummary[] } {
  const inPeriod = expenses.filter((expense) => periodStart(expense.date, startDay) === period)
  const categories: CategorySummary[] = []
  for (const category of EXPENSE_CATEGORY_NAMES) {
    const own = inPeriod.filter((expense) => expense.category === category)
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
  return { total: totalSpent(inPeriod), categories }
}

export type CategoryRow = CategorySummary & {
  /** The category's limit for a period, or null without one. */
  limit: number | null
  /** Spending against the limit (`ok` without one): the same 80 % / 100 % bands as the budget. */
  level: BudgetLevel
}

/** A period's categories with their limits: every category with an expense, plus every category with
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

/** This period's spending so far against the same part of the previous period: its first day through
 *  the same day count (capped at that period's length, e.g. day 31 of one period compares with the
 *  whole of a 28-day one). Comparing a running period with a whole finished one would read "you
 *  spend less" every early period. From the household's real expenses; `null` when the previous
 *  period has no expenses up to that day — there is nothing to compare with, and a baseline is never
 *  invented (it used to be a fixed 8 120 Kč). */
export function periodOverPeriodChange(
  expenses: Expense[],
  today: string,
  startDay = 1,
): { current: number; previous: number; changePercent: number } | null {
  const current = totalSpent(expensesInPeriod(expenses, today, startDay))
  const previousStart = previousPeriodStart(today, startDay)
  const comparableDays = Math.min(periodDay(today, startDay), periodLengthFrom(previousStart))
  // Exclusive upper bound: the day after the last comparable one.
  const until = isoFromDayNumber(dayNumber(previousStart) + comparableDays)
  const previous = totalSpent(expenses.filter((expense) => expense.date >= previousStart && expense.date < until))
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

/** Where current spending stands against the period's budget: below 80 % is `ok`, 80 % up to (not
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

/** A projection needs some history: before the 7th day, one big shop on the 2nd would extrapolate
 *  to a period many times over the limit. Until then only the daily allowance is shown. */
export const PACE_MIN_DAYS = 7

/** Where the period is heading, for the budget card: how much may be spent per remaining day
 *  (today included) to stay within the limit, and — from `PACE_MIN_DAYS` on — the period-end total
 *  at the current daily rate and by how much it would exceed the limit. `null` without a budget.
 *  Deterministic from this period's spending; no guessing about future shops. */
export function budgetPace(
  periodSpent: number,
  budget: number,
  today: string,
  startDay = 1,
): { daysLeft: number; perDayLeft: number; projected: number | null; projectedOver: number | null } | null {
  if (budget <= 0) return null
  const day = periodDay(today, startDay)
  const length = periodLength(today, startDay)
  const daysLeft = length - day + 1
  const perDayLeft = Math.max(0, budget - periodSpent) / daysLeft
  const projected = day >= PACE_MIN_DAYS ? (periodSpent / day) * length : null
  const projectedOver = projected != null && projected > budget ? projected - budget : null
  return { daysLeft, perDayLeft, projected, projectedOver }
}

/** How much of what is left can go on one week, so the rest of the period is still covered: the
 *  remaining budget spread over the weeks left in the period, counting today. In the last week the
 *  whole remainder is available. Nothing when the budget is used up. */
export function weeklyAllowance(remaining: number, today: string, startDay = 1): number {
  if (remaining <= 0) return 0
  return remaining / Math.max(1, periodDaysLeft(today, startDay) / 7)
}
