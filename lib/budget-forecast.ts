import { availableBalance, predictedBalance } from '@/lib/budget-balances'
import { dueDatesBetween, type RecurringOccurrence, type RecurringPayment } from '@/lib/recurring-payments'

// docs/15_BUDGET_PERIODS.md §9.2, §9.4, §16, §17: where the period is expected to end, and what the
// household could do about a shortfall. Pure and deterministic — no model is involved. The forecast
// counts only what is actually known: the actual balance, planned income still to come, recurring
// payments not yet paid or skipped, and planned Kapsa contributions not yet made. Ordinary spending
// that has not happened yet is not guessed. Advice is text for the user to decide on; nothing here
// ever moves money (§17).

const round2 = (value: number) => Math.round(value * 100) / 100

/** A recurring payment that falls in the period and is neither paid nor skipped. */
export type Commitment = { paymentId: string; name: string; dueDate: string; amount: number }

/** Recurring payments still to come (or overdue and unhandled) in `[start, end]` (both inclusive).
 *  Paid and skipped due dates are done (§8: no double counting once it became a real expense). */
export function pendingCommitments(payments: RecurringPayment[], occurrences: RecurringOccurrence[], start: string, end: string): Commitment[] {
  const handled = new Set(occurrences.map((entry) => `${entry.recurringPaymentId}|${entry.dueDate}`))
  const result: Commitment[] = []
  for (const payment of payments) {
    if (!payment.active) continue
    for (const dueDate of dueDatesBetween(payment, start, end)) {
      if (!handled.has(`${payment.id}|${dueDate}`)) result.push({ paymentId: payment.id, name: payment.name, dueDate, amount: payment.amount })
    }
  }
  return result.sort((a, b) => (a.dueDate === b.dueDate ? a.name.localeCompare(b.name, 'cs') : a.dueDate < b.dueDate ? -1 : 1))
}

/** What is left of the planned Kapsa contributions: a planned contribution minus what was already put
 *  into that Kapsa in the period (never below 0). A contribution made already is a real transfer, so
 *  counting it again as planned would subtract it twice. */
export function remainingPlannedTransfers(pockets: { plannedContribution: number | null; depositedThisPeriod: number }[]): number {
  return round2(pockets.reduce((sum, pocket) => sum + Math.max(0, (pocket.plannedContribution ?? 0) - pocket.depositedThisPeriod), 0))
}

export type ForecastInput = {
  /** §9.1 actual balance of the period (including the carry from the previous one). */
  actual: number
  /** Planned income that has not been received yet. */
  expectedIncome: number
  commitments: Commitment[]
  /** Planned Kapsa contributions not yet made. */
  plannedTransfers: number
  /** Planned expenses of the period not yet paid (§7). Expected, so only the prediction counts them. */
  plannedExpenses?: number
  pockets: { id: string; name: string; balance: number; isReserve?: boolean }[]
}

export type Advice =
  | { kind: 'shortfall'; amount: number }
  | { kind: 'postpone-savings'; amount: number }
  | { kind: 'trim-expenses'; amount: number }
  | { kind: 'use-pocket'; amount: number; pocketId: string; pocketName: string; isReserve: boolean }
  | { kind: 'carry-deficit'; amount: number }
  | { kind: 'payment-risk'; amount: number }

export type Forecast = {
  actual: number
  /** Sum of the pending recurring payments. */
  reserved: number
  /** Planned expenses still to be paid in the period. */
  plannedExpenses: number
  /** §9.2 actual balance − reserved commitments; can be negative (then it is not spendable money). */
  available: number
  expectedIncome: number
  plannedTransfers: number
  /** §9.4 where the period is expected to end. */
  predicted: number
  /** How much money is expected to be missing at the end (0 when none). */
  shortfall: number
  advice: Advice[]
}

/** §9.2 + §9.4 + §16–17. Advice, in the order a household would reach for it: postpone planned savings,
 *  spend less on planned expenses, then take from Kapsy (the reserve first, then the largest), and what is still missing becomes an expected negative carry
 *  to the next period. A separate warning appears when the money in hand does not cover the payments
 *  that are due, even though the period is expected to end well (income arrives later). */
export function forecastPeriod(input: ForecastInput): Forecast {
  const reserved = round2(input.commitments.reduce((sum, commitment) => sum + commitment.amount, 0))
  const available = availableBalance(input.actual, reserved)
  const plannedExpenses = round2(input.plannedExpenses ?? 0)
  const predicted = predictedBalance(input.actual, input.expectedIncome, round2(reserved + plannedExpenses), input.plannedTransfers)
  const missing = Math.max(0, round2(-predicted))
  const advice: Advice[] = []

  if (missing > 0) {
    advice.push({ kind: 'shortfall', amount: missing })
    let left = missing
    // Not saving this period is the cheapest fix: the money was only planned to leave the budget.
    const postponed = Math.min(left, input.plannedTransfers)
    if (postponed > 0) {
      advice.push({ kind: 'postpone-savings', amount: round2(postponed) })
      left = round2(left - postponed)
    }
    // Then spending less on what is only planned (§16), before any saved money is touched.
    const trimmed = Math.min(left, plannedExpenses)
    if (trimmed > 0) {
      advice.push({ kind: 'trim-expenses', amount: round2(trimmed) })
      left = round2(left - trimmed)
    }
    // The reserve exists for exactly this, so it goes first; then the largest Kapsa.
    const byUse = [...input.pockets].sort((a, b) => Number(b.isReserve === true) - Number(a.isReserve === true) || b.balance - a.balance)
    for (const pocket of byUse) {
      if (left <= 0) break
      const taken = Math.min(left, pocket.balance)
      if (taken <= 0) continue
      advice.push({ kind: 'use-pocket', amount: round2(taken), pocketId: pocket.id, pocketName: pocket.name, isReserve: pocket.isReserve === true })
      left = round2(left - taken)
    }
    if (left > 0) advice.push({ kind: 'carry-deficit', amount: left })
  } else if (available < 0) {
    advice.push({ kind: 'payment-risk', amount: round2(-available) })
  }

  return { actual: input.actual, reserved, plannedExpenses, available, expectedIncome: input.expectedIncome, plannedTransfers: input.plannedTransfers, predicted, shortfall: missing, advice }
}
