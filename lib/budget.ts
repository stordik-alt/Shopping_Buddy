import {
  dayNumber,
  isoFromDayNumber,
  nextPeriodStartFor,
  periodDayFor,
  periodDaysLeftFor,
  periodEndFor,
  periodLengthFor,
  periodStartFor,
  previousPeriodStartFor,
  toPeriodConfig,
  type PeriodInput,
} from '@/lib/budget-period'
import { EXPENSE_CATEGORY_NAMES, type ExpenseCategory } from '@/lib/expense-categories'
import type { Expense, Item } from '@/lib/types'

// The budget runs over the household's budget period (lib/budget-period.ts): the calendar month, a
// period starting on a chosen day of the month (1–28, "28th to 27th of the next month"), or a custom
// one of N days from an anchor date. Every function below takes `today` (`YYYY-MM-DD`, from
// lib/today.ts) and the household's `period`, and works on the period `today` falls in, so the numbers
// move with the real date. A period is identified by its start date (`YYYY-MM-DD`). `period` is a
// PeriodConfig, or a bare number meaning "payday N"; it defaults to 1, exactly the calendar month.

// The period arithmetic lives in lib/budget-period.ts; these are the names the budget code and its
// callers have always used.
export { dayNumber, isoFromDayNumber, isValidPeriodStartDay, MAX_PERIOD_START_DAY } from '@/lib/budget-period'

/** The first day of the period `date` falls in. */
export function periodStart(date: string, period: PeriodInput = 1): string {
  return periodStartFor(toPeriodConfig(period), date)
}

/** The first day of the period after the one that starts on `start` (a value from periodStart).
 *  `period` matters only for a custom period, whose length is not implied by the date. */
export function nextPeriodStart(start: string, period: PeriodInput = 1): string {
  return nextPeriodStartFor(toPeriodConfig(period), start)
}

/** The last day (inclusive) of the period that starts on `start`. */
export function periodEnd(start: string, period: PeriodInput = 1): string {
  return periodEndFor(toPeriodConfig(period), start)
}

/** Number of days in the period that starts on `start`. */
function periodLengthFrom(start: string, period: PeriodInput): number {
  return periodLengthFor(toPeriodConfig(period), start)
}

/** The start of the period before the one `today` falls in. */
export function previousPeriodStart(today: string, period: PeriodInput = 1): string {
  return previousPeriodStartFor(toPeriodConfig(period), today)
}

/** Number of days in the period `today` falls in. */
export function periodLength(today: string, period: PeriodInput = 1): number {
  return periodLengthFrom(periodStart(today, period), period)
}

/** Which day of its period `today` is, counting the first day as 1 — so the first day of a period
 *  divides by 1, never by 0. */
export function periodDay(today: string, period: PeriodInput = 1): number {
  return periodDayFor(toPeriodConfig(period), today)
}

/** Days left in the period, today included (1 on its last day). */
export function periodDaysLeft(today: string, period: PeriodInput = 1): number {
  return periodDaysLeftFor(toPeriodConfig(period), today)
}

/** The expenses dated in the period `today` falls in — what "this month" means everywhere the
 *  monthly budget is shown or checked. */
export function expensesInPeriod(expenses: Expense[], today: string, period: PeriodInput = 1): Expense[] {
  const key = periodStart(today, period)
  return expenses.filter((expense) => periodStart(expense.date, period) === key)
}

export function totalSpent(expenses: Expense[]) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

/** This period's spending per day so far: days elapsed count its first day through `today`
 *  inclusive, so the first day divides by 1, never by 0. */
export function dailyAverage(expenses: Expense[], today: string, period: PeriodInput = 1) {
  return totalSpent(expensesInPeriod(expenses, today, period)) / periodDay(today, period)
}

export function weeklyAverage(expenses: Expense[], today: string, period: PeriodInput = 1) {
  return dailyAverage(expenses, today, period) * 7
}

/** This period's spending extrapolated to the whole period at the current daily rate. */
export function projectedPeriodEnd(expenses: Expense[], today: string, period: PeriodInput = 1) {
  return dailyAverage(expenses, today, period) * periodLength(today, period)
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
export function expensePeriods(expenses: Expense[], today: string, period: PeriodInput = 1): string[] {
  const periods = new Set([periodStart(today, period), ...expenses.map((expense) => periodStart(expense.date, period))])
  return [...periods].sort().reverse()
}

export type CategorySummary = {
  category: ExpenseCategory
  total: number
  /** Per subcategory, A–Z; expenses without one are summed under `null`, last. */
  subcategories: { subcategory: string | null; total: number }[]
  /** The category's expenses, newest first. */
  expenses: Expense[]
}

/** One period's expenses by category and subcategory — what was paid, on what, and when. Categories
 *  with the most spent first (ties in the fixed category order); only categories with an expense.
 *  `period` is the period's start date; `config` must be the one it was made with. */
export function periodSummary(expenses: Expense[], period: string, config: PeriodInput = 1): { total: number; categories: CategorySummary[] } {
  const inPeriod = expenses.filter((expense) => periodStart(expense.date, config) === period)
  const categories: CategorySummary[] = []
  for (const category of EXPENSE_CATEGORY_NAMES) {
    const own = inPeriod.filter((expense) => expense.category === category)
    if (own.length === 0) continue
    const bySub = new Map<string | null, number>()
    for (const expense of own) bySub.set(expense.subcategory, (bySub.get(expense.subcategory) ?? 0) + expense.amount)
    categories.push({
      category,
      total: totalSpent(own),
      // A–Z like every subcategory list (owner request 2026-10-06); spending without a subcategory last.
      subcategories: [...bySub.entries()]
        .map(([subcategory, total]) => ({ subcategory, total }))
        .sort((a, b) => (a.subcategory === null ? 1 : b.subcategory === null ? -1 : a.subcategory.localeCompare(b.subcategory, 'cs'))),
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
  period: PeriodInput = 1,
): { current: number; previous: number; changePercent: number } | null {
  const current = totalSpent(expensesInPeriod(expenses, today, period))
  const previousStart = previousPeriodStart(today, period)
  const comparableDays = Math.min(periodDay(today, period), periodLengthFrom(previousStart, period))
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
  period: PeriodInput = 1,
): { daysLeft: number; perDayLeft: number; projected: number | null; projectedOver: number | null } | null {
  if (budget <= 0) return null
  const day = periodDay(today, period)
  const length = periodLength(today, period)
  const daysLeft = length - day + 1
  const perDayLeft = Math.max(0, budget - periodSpent) / daysLeft
  const projected = day >= PACE_MIN_DAYS ? (periodSpent / day) * length : null
  const projectedOver = projected != null && projected > budget ? projected - budget : null
  return { daysLeft, perDayLeft, projected, projectedOver }
}

/** How much of what is left can go on one week, so the rest of the period is still covered: the
 *  remaining budget spread over the weeks left in the period, counting today. In the last week the
 *  whole remainder is available. Nothing when the budget is used up. */
export function weeklyAllowance(remaining: number, today: string, period: PeriodInput = 1): number {
  if (remaining <= 0) return 0
  return remaining / Math.max(1, periodDaysLeft(today, period) / 7)
}

/** One subcategory of a category in a period, with its payments — what an opened category in Výdaje
 *  lists (one short row each) instead of every payment at once. A–Z, like
 *  `CategorySummary.subcategories`; payments newest first; `null` = without a subcategory. */
export type SubcategoryGroup = { subcategory: string | null; total: number; expenses: Expense[] }

export function subcategoryGroups(entry: Pick<CategorySummary, 'subcategories' | 'expenses'>): SubcategoryGroup[] {
  return entry.subcategories.map(({ subcategory, total }) => ({
    subcategory,
    total,
    expenses: entry.expenses.filter((expense) => expense.subcategory === subcategory),
  }))
}

/** A row of the Výdaje list by date: a payment entered by hand, or one purchase (a receipt) whose
 *  amount the budget keeps split by category and subcategory — shown again as the one purchase it was. */
export type LedgerEntry =
  | { kind: 'single'; expense: Expense }
  | { kind: 'purchase'; purchaseId: string; date: string; note: string; total: number; parts: Expense[] }

/** Joins a purchase's split expenses back into one entry, keeping the order of the input (newest first
 *  in Výdaje): the purchase takes the place of its first part. The total is the sum of its parts, so it
 *  equals what the budget counts. */
export function groupExpensesByPurchase(expenses: Expense[]): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  const byPurchase = new Map<string, Extract<LedgerEntry, { kind: 'purchase' }>>()
  for (const expense of expenses) {
    if (!expense.purchaseId) {
      entries.push({ kind: 'single', expense })
      continue
    }
    const existing = byPurchase.get(expense.purchaseId)
    if (existing) {
      existing.parts.push(expense)
      existing.total = Math.round((existing.total + expense.amount) * 100) / 100
      continue
    }
    const entry = { kind: 'purchase' as const, purchaseId: expense.purchaseId, date: expense.date, note: expense.note, total: expense.amount, parts: [expense] }
    byPurchase.set(expense.purchaseId, entry)
    entries.push(entry)
  }
  return entries
}

// --- Budget by period (docs/15_BUDGET_PERIODS.md) ---------------------------------------------------

/** A period's budget: its own amount when the household set one, else the default from Profil. */
export function budgetForPeriod(period: string, periodBudgets: Readonly<Record<string, number>>, defaultBudget: number): number {
  return periodBudgets[period] ?? defaultBudget
}

/** Spending per budget period from per-day totals (what Rozpočet loads for past periods instead of every
 *  expense). Keyed by the period's start date; rounded to haléře. */
export function spendingByPeriod(daily: ReadonlyArray<{ date: string; total: number }>, config: PeriodInput = 1): Map<string, number> {
  const totals = new Map<string, number>()
  for (const { date, total } of daily) {
    const period = periodStart(date, config)
    totals.set(period, Math.round(((totals.get(period) ?? 0) + total) * 100) / 100)
  }
  return totals
}

/** What a period saved: its budget minus its spending (negative = overspent). Null without a budget, where
 *  "saved" would mean nothing. */
export function periodSavings(budget: number, spent: number): number | null {
  if (budget <= 0) return null
  return Math.round((budget - spent) * 100) / 100
}

/** "Ušetřeno celkem": the savings of the finished periods (before `currentPeriod`) that had a budget,
 *  oldest first, and their sum. */
export function savingsHistory(
  spending: ReadonlyMap<string, number>,
  currentPeriod: string,
  budgetOf: (period: string) => number,
): { periods: { period: string; budget: number; spent: number; saved: number }[]; total: number } {
  const periods = [...spending.keys()]
    .filter((period) => period < currentPeriod)
    .sort()
    .flatMap((period) => {
      const budget = budgetOf(period)
      const spent = spending.get(period) ?? 0
      const saved = periodSavings(budget, spent)
      return saved === null ? [] : [{ period, budget, spent, saved }]
    })
  return { periods, total: Math.round(periods.reduce((sum, entry) => sum + entry.saved, 0) * 100) / 100 }
}
