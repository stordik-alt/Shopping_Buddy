// docs/15 §8–9: the balances the budget shows. Actual, planned and predicted money are kept apart on
// purpose — a planned income or expense never changes the actual balance until it really happens.
// Every function is pure and takes plain amounts (one currency), so the numbers are deterministic and
// the same wherever they are shown. Amounts are rounded to whole hellers so float sums never drift.

const round2 = (value: number) => Math.round(value * 100) / 100

/** Money that really happened in a period. */
export type ActualMoney = {
  /** Income that was actually received. */
  income: number
  /** Expenses that were actually paid. */
  expenses: number
  /** Money actually moved out of the budget to savings (later: into a Kapsa). */
  transfers: number
}

/** Income split by whether it was really received ('actual') or is only expected ('planned'): the two
 *  sums that must never be mixed (§8). */
export function incomeTotals(incomes: { amount: number; status: 'planned' | 'actual' }[]): { received: number; planned: number } {
  let received = 0
  let planned = 0
  for (const income of incomes) {
    if (income.status === 'actual') received += income.amount
    else planned += income.amount
  }
  return { received: round2(received), planned: round2(planned) }
}

/** §9.1 Actual balance = received income − paid expenses − executed transfers. Planned amounts are
 *  deliberately not part of the input. */
export function actualBalance({ income, expenses, transfers }: ActualMoney): number {
  return round2(income - expenses - transfers)
}

/** §9.2 Available balance = actual balance − amounts already reserved for upcoming commitments
 *  (e.g. recurring payments still to come). What the household can safely spend. */
export function availableBalance(actual: number, reserved: number): number {
  return round2(actual - reserved)
}

/** §9.3 Planned balance = planned income − planned expenses − planned savings. Planning only. */
export function plannedBalance(plannedIncome: number, plannedExpenses: number, plannedSavings: number): number {
  return round2(plannedIncome - plannedExpenses - plannedSavings)
}

/** §9.4 Predicted balance = actual balance + expected income − expected expenses − planned future
 *  transfers. Where the period is expected to end. */
export function predictedBalance(actual: number, expectedIncome: number, expectedExpenses: number, plannedTransfers: number): number {
  return round2(actual + expectedIncome - expectedExpenses - plannedTransfers)
}

/** The free-money calculation before it is clamped: actual balance minus reserved commitments minus
 *  money already earmarked for another purpose. Negative means the period is short of money. */
export function freeMoneyRaw(actual: number, reserved: number, earmarked: number): number {
  return round2(actual - reserved - earmarked)
}

/** §9.5 Free money — the only amount that may be distributed at the end of a period. Never negative:
 *  a shortfall is not free money (§13), see `shortfall`. */
export function freeMoney(actual: number, reserved: number, earmarked: number): number {
  return Math.max(0, freeMoneyRaw(actual, reserved, earmarked))
}

/** The part of the period's money that is missing (0 when there is none) — what §13 says must be
 *  covered or carried as a deficit, never saved or shown as spendable. */
export function shortfall(actual: number, reserved: number, earmarked: number): number {
  return Math.max(0, -freeMoneyRaw(actual, reserved, earmarked))
}

/** §16 Whether the predicted end-of-period balance is negative, i.e. the user should be warned in advance. */
export function isShortfallPredicted(predicted: number): boolean {
  return predicted < 0
}
