import { isExpenseCategory, isValidSubcategory, type ExpenseCategory } from '@/lib/expense-categories'

// Recurring payments — rent, energy advances, insurance, subscriptions (the owner's plan, part 4).
// A payment is entered once; each due date then waits for the household to confirm it (it becomes an
// expense) or skip it. Nothing counts until confirmed. Pure: the due dates and what is waiting are
// computed here from dates as strings, so no time zone can move a day; app/actions/recurring.ts and
// the reminder cron only do the I/O.

/** How often: every month, quarter, half-year or year. */
export const RECURRING_INTERVALS = [1, 3, 6, 12] as const
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number]

export const INTERVAL_LABELS: Record<RecurringInterval, string> = { 1: 'měsíčně', 3: 'čtvrtletně', 6: 'pololetně', 12: 'ročně' }

export type RecurringPayment = {
  id: string
  name: string
  category: ExpenseCategory
  subcategory: string | null
  amount: number
  intervalMonths: RecurringInterval
  /** The first due date (`YYYY-MM-DD`); its day of the month is kept for every later one. */
  startDate: string
  active: boolean
}

/** One due date the household has dealt with. */
export type RecurringOccurrence = { recurringPaymentId: string; dueDate: string; status: 'paid' | 'skipped' }

export type DuePayment = { payment: RecurringPayment; dueDate: string }

/** How far back an unhandled due date is still offered; older ones are left alone rather than
 *  piling up after months without opening the app. */
export const MAX_OPEN_DUE_DATES = 3
/** How far ahead "coming up" looks. */
export const UPCOMING_DAYS = 31

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The `n`-th due date (0 = the first): `n × interval` months after the start, on the start's day —
 *  or the month's last day when it is shorter (a payment on the 31st falls on 28/29 February). */
export function dueDateAt(startDate: string, intervalMonths: number, n: number): string {
  const [year, month, day] = startDate.split('-').map(Number)
  const index = year * 12 + (month - 1) + n * intervalMonths
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, daysIn(y, m))).padStart(2, '0')}`
}

/** Every due date of `payment` from `from` to `to` (inclusive), oldest first. */
export function dueDatesBetween(payment: Pick<RecurringPayment, 'startDate' | 'intervalMonths'>, from: string, to: string): string[] {
  const dates: string[] = []
  for (let n = 0; ; n++) {
    const date = dueDateAt(payment.startDate, payment.intervalMonths, n)
    if (date > to) break
    if (date >= from) dates.push(date)
  }
  return dates
}

/** Whether `date` is one of `payment`'s due dates. */
export function isDueDate(payment: Pick<RecurringPayment, 'startDate' | 'intervalMonths'>, date: string): boolean {
  return dueDatesBetween(payment, date, date).length === 1
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** What the household has to deal with on `today`: due dates up to today that are neither paid nor
 *  skipped (at most the last MAX_OPEN_DUE_DATES per payment, and none older than a year — the history
 *  the page loads), oldest first; and the next due date of each active payment within UPCOMING_DAYS
 *  after today. Stopped payments take part in neither. */
export function recurringOverview(
  payments: RecurringPayment[],
  occurrences: RecurringOccurrence[],
  today: string,
): { due: DuePayment[]; upcoming: DuePayment[] } {
  const handled = new Set(occurrences.map((entry) => `${entry.recurringPaymentId}|${entry.dueDate}`))
  const due: DuePayment[] = []
  const upcoming: DuePayment[] = []
  for (const payment of payments) {
    if (!payment.active) continue
    const since = addDays(today, -365) > payment.startDate ? addDays(today, -365) : payment.startDate
    const open = dueDatesBetween(payment, since, today).filter((date) => !handled.has(`${payment.id}|${date}`))
    for (const dueDate of open.slice(-MAX_OPEN_DUE_DATES)) due.push({ payment, dueDate })
    const next = dueDatesBetween(payment, addDays(today, 1), addDays(today, UPCOMING_DAYS))[0]
    if (next) upcoming.push({ payment, dueDate: next })
  }
  const byDate = (a: DuePayment, b: DuePayment) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.payment.name.localeCompare(b.payment.name, 'cs'))
  return { due: due.sort(byDate), upcoming: upcoming.sort(byDate) }
}

export type RecurringPaymentInput = { name: string; category: string; subcategory: string | null; amount: number; intervalMonths: number; startDate: string }

/** What the server accepts as a recurring payment, or why not (CLAUDE.md sections 9 and 33). The first
 *  due date may be in the past (a rent paid since spring) or up to a year ahead. */
export function validateRecurringPaymentInput(
  input: RecurringPaymentInput,
  today: string,
): { payment: Omit<RecurringPayment, 'id' | 'active'> } | { error: string } {
  const name = input.name.trim().slice(0, 80)
  if (!name) return { error: 'Zadejte název platby.' }
  if (!isExpenseCategory(input.category)) return { error: 'Neznámá kategorie výdaje.' }
  const subcategory = input.subcategory?.trim() || null
  if (!isValidSubcategory(input.category, subcategory)) return { error: 'Podkategorie nepatří do zvolené kategorie.' }
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 99_999_999.99) return { error: 'Zadejte částku větší než 0.' }
  if (!(RECURRING_INTERVALS as readonly number[]).includes(input.intervalMonths)) return { error: 'Neznámý interval platby.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || dueDateAt(input.startDate, 1, 0) !== input.startDate) return { error: 'Neplatné datum první platby.' }
  if (input.startDate < '2000-01-01' || input.startDate > dueDateAt(today, 12, 1)) return { error: 'Datum první platby musí být nejvýš rok dopředu.' }
  return {
    payment: {
      name,
      category: input.category,
      subcategory,
      amount: Math.round(input.amount * 100) / 100,
      intervalMonths: input.intervalMonths as RecurringInterval,
      startDate: input.startDate,
    },
  }
}

/** The payments to remind a household of on `today`: due today, neither paid nor skipped yet, and
 *  not reminded of this due date before (`remindedDueDate`, so the daily cron reminds once). */
export function paymentsToRemind<P extends RecurringPayment & { remindedDueDate: string | null }>(
  payments: P[],
  occurrences: RecurringOccurrence[],
  today: string,
): P[] {
  const handled = new Set(occurrences.map((entry) => `${entry.recurringPaymentId}|${entry.dueDate}`))
  return payments.filter((payment) => payment.active && isDueDate(payment, today) && !handled.has(`${payment.id}|${today}`) && payment.remindedDueDate !== today)
}
