// docs/15_BUDGET_PERIODS.md §14, §16: the outlook for the periods ahead — where each one is expected to
// start and end, and what it would carry on to the next. Pure and deterministic; no model is involved.
//
// Unlike the forecast of the running period (lib/budget-forecast.ts, which counts only money that is
// known), a period that has not begun has no spending yet, so its own budget stands for the ordinary
// spending: the household said how much it means to spend. When the known payments and planned
// expenses already exceed that budget, they win. Planned money stays planned: nothing here is an actual
// balance, and the numbers are estimates the household can change by changing the plan.

const round2 = (value: number) => Math.round(value * 100) / 100

/** How many periods the outlook covers: the running one and a year ahead. */
export const OUTLOOK_PERIODS = 13

/** What is known about one period of the outlook. The first one is the running period. */
export type OutlookPeriodInput = {
  periodStart: string
  /** Incomes still only planned. */
  plannedIncome: number
  /** Incomes already marked received but dated in this period (for the running period they are already
   *  part of the actual balance, so the caller passes 0). */
  receivedIncome: number
  /** Planned expenses not yet paid. */
  plannedExpenses: number
  /** Unpaid recurring payments of the period. */
  commitments: number
  /** Planned Kapsa contributions not yet made. */
  plannedTransfers: number
  /** What the household plans to leave for the next period (docs/15 §14 "Plánovaný převod"), if anything. */
  plannedCarry: number | null
  budget: number
}

export type OutlookPeriod = {
  periodStart: string
  /** Money the period is expected to start with: the actual balance now for the running period, else the
   *  expected carry of the previous one. */
  opening: number
  income: number
  /** The ordinary spending still expected: the budget, or the known outflows if those are higher. */
  spending: number
  plannedTransfers: number
  predicted: number
  plannedCarry: number | null
  /** What goes on to the next period. */
  carryOut: number
}

/** §14: only the part explicitly set aside for the next period is carried (and never more than the period
 *  really ends with); a shortfall is carried whole, as a negative transfer. */
export function expectedCarry(predicted: number, planned: number | null): number {
  if (predicted < 0) return round2(predicted)
  return round2(Math.min(Math.max(0, planned ?? 0), predicted))
}

/** The periods in order, each starting from the carry the one before it is expected to hand over. */
export function projectOutlook(input: { actualNow: number; spentNow: number; periods: OutlookPeriodInput[] }): OutlookPeriod[] {
  const result: OutlookPeriod[] = []
  input.periods.forEach((period, index) => {
    const running = index === 0
    const opening = running ? round2(input.actualNow) : result[index - 1].carryOut
    const income = round2(period.plannedIncome + period.receivedIncome)
    const known = round2(period.commitments + period.plannedExpenses)
    // The running period has already spent part of its budget; only the rest is still ahead.
    const budgetLeft = running ? Math.max(0, round2(period.budget - input.spentNow)) : period.budget
    const spending = Math.max(budgetLeft, known)
    const predicted = round2(opening + income - spending - period.plannedTransfers)
    result.push({
      periodStart: period.periodStart,
      opening,
      income,
      spending: round2(spending),
      plannedTransfers: round2(period.plannedTransfers),
      predicted,
      plannedCarry: period.plannedCarry,
      carryOut: expectedCarry(predicted, period.plannedCarry),
    })
  })
  return result
}
