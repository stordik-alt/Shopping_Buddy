// Regular household income schedules. Pure date/validation rules are shared by server actions and tests.
import { isIsoDate } from '@/lib/income-input'

export const RECURRING_INCOME_INTERVALS = [1, 3, 6, 12] as const
export type RecurringIncomeInterval = (typeof RECURRING_INCOME_INTERVALS)[number]
export const RECURRING_INCOME_INTERVAL_LABELS: Record<RecurringIncomeInterval, string> = {
  1: 'měsíčně',
  3: 'čtvrtletně',
  6: 'pololetně',
  12: 'ročně',
}

export type RecurringIncome = {
  id: string
  description: string
  expectedAmount: number
  intervalMonths: RecurringIncomeInterval
  startDate: string
  active: boolean
}
export type RecurringIncomeOccurrence = {
  recurringIncomeId: string
  dueDate: string
  status: 'received' | 'skipped'
}
export type DueRecurringIncome = { income: RecurringIncome; dueDate: string }
export type RecurringIncomeInput = {
  description: string
  expectedAmount: number
  intervalMonths: number
  startDate: string
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Preserve the day-of-month; if a month is shorter, use its last day. */
export function recurringIncomeDueDate(startDate: string, intervalMonths: number, n: number): string {
  const [year, month, day] = startDate.split('-').map(Number)
  const index = year * 12 + month - 1 + n * intervalMonths
  const y = Math.floor(index / 12)
  const m = index % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, daysIn(y, m))).padStart(2, '0')}`
}

export function recurringIncomeDueDatesBetween(
  income: Pick<RecurringIncome, 'startDate' | 'intervalMonths'>,
  from: string,
  to: string,
): string[] {
  const dates: string[] = []
  for (let n = 0; ; n++) {
    const date = recurringIncomeDueDate(income.startDate, income.intervalMonths, n)
    if (date > to) break
    if (date >= from) dates.push(date)
  }
  return dates
}

export function isRecurringIncomeDueDate(
  income: Pick<RecurringIncome, 'startDate' | 'intervalMonths'>,
  date: string,
): boolean {
  return isIsoDate(date) && recurringIncomeDueDatesBetween(income, date, date).length === 1
}

export function validateRecurringIncomeInput(
  input: RecurringIncomeInput,
  today: string,
): { income: Omit<RecurringIncome, 'id' | 'active'> } | { error: string } {
  const description = input.description.trim().slice(0, 200)
  if (!description) return { error: 'Zadejte popis pravidelného příjmu.' }
  if (!Number.isFinite(input.expectedAmount) || input.expectedAmount <= 0 || input.expectedAmount > 99_999_999.99) {
    return { error: 'Zadejte očekávanou částku větší než 0.' }
  }
  if (!(RECURRING_INCOME_INTERVALS as readonly number[]).includes(input.intervalMonths)) {
    return { error: 'Neznámá četnost příjmu.' }
  }
  if (!isIsoDate(input.startDate) || input.startDate < '2000-01-01' || input.startDate > recurringIncomeDueDate(today, 12, 1)) {
    return { error: 'Zadejte platné první datum příjmu (nejvýš rok dopředu).' }
  }
  return {
    income: {
      description,
      expectedAmount: Math.round(input.expectedAmount * 100) / 100,
      intervalMonths: input.intervalMonths as RecurringIncomeInterval,
      startDate: input.startDate,
    },
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Due reminders and the next 31 days of forecasts. Stopped schedules never produce new dates. */
export function recurringIncomeOverview(
  incomes: RecurringIncome[],
  occurrences: RecurringIncomeOccurrence[],
  today: string,
): { due: DueRecurringIncome[]; upcoming: DueRecurringIncome[] } {
  const handled = new Set(occurrences.map((row) => `${row.recurringIncomeId}|${row.dueDate}`))
  const due: DueRecurringIncome[] = []
  const upcoming: DueRecurringIncome[] = []
  for (const income of incomes) {
    if (!income.active) continue
    const since = addDays(today, -365) > income.startDate ? addDays(today, -365) : income.startDate
    const open = recurringIncomeDueDatesBetween(income, since, today).filter((date) => !handled.has(`${income.id}|${date}`))
    for (const dueDate of open.slice(-3)) due.push({ income, dueDate })
    const next = recurringIncomeDueDatesBetween(income, addDays(today, 1), addDays(today, 31))[0]
    if (next) upcoming.push({ income, dueDate: next })
  }
  const byDate = (a: DueRecurringIncome, b: DueRecurringIncome) =>
    a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.income.description.localeCompare(b.income.description, 'cs')
  return { due: due.sort(byDate), upcoming: upcoming.sort(byDate) }
}
