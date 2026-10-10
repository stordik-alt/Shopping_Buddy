import { carryIntoPeriod, periodResult, type ClosedPeriodResult, type PeriodMoney } from '@/lib/budget-closing'
import { previousPeriodStartFor, type PeriodConfig } from '@/lib/budget-period'

// docs/15_BUDGET_PERIODS.md §18: the past budget periods with their budget, income, expenses, savings,
// result and carry. Pure: the period boundaries come from the household's own period setting (so a
// payday period is shown as the payday period it is) and the money from the same functions the budget
// uses, so history can never disagree with the current view.

const round2 = (value: number) => Math.round(value * 100) / 100

/** How many past periods the history lists at most (bounds the load, docs/15 §19). */
export const MAX_HISTORY_PERIODS = 24

export type PeriodHistoryRow = {
  periodStart: string
  /** Exclusive end — the start of the next period. */
  periodEnd: string
  budget: number
  received: number
  expenses: number
  /** Net money moved into Kapsy in the period, including the moves made while closing it. */
  saved: number
  /** Transfer that arrived from the previous period (signed). */
  carryIn: number
  /** Actual result of the period: received + carry-in − expenses − ordinary Kapsa moves. */
  result: number
  closed: boolean
  /** Transfer passed to the next period; only known (not null) once the period is closed. */
  carryOut: number | null
}

/** The periods before `currentStart`, newest first, back to the one containing `earliest` (the first
 *  day anything was recorded) but at most `limit`. Periods in which nothing happened are skipped. */
export function buildPeriodHistory(input: {
  config: PeriodConfig
  currentStart: string
  earliest: string | null
  closed: ClosedPeriodResult[]
  moneyOf: (start: string, end: string) => PeriodMoney
  budgetOf: (start: string) => number
  limit?: number
}): PeriodHistoryRow[] {
  const { config, currentStart, earliest, closed, moneyOf, budgetOf } = input
  const limit = Math.min(input.limit ?? MAX_HISTORY_PERIODS, MAX_HISTORY_PERIODS)
  if (earliest === null) return []
  const rows: PeriodHistoryRow[] = []
  let end = currentStart
  while (rows.length < limit) {
    const start = previousPeriodStartFor(config, end)
    if (start >= end) break
    // Periods wholly before the first record cannot hold anything.
    if (end <= earliest) break
    const money = moneyOf(start, end)
    const carryIn = carryIntoPeriod(closed, start)
    const closing = closed.find((period) => period.periodStart === start)
    const touched = money.received !== 0 || money.expenses !== 0 || money.transfers !== 0 || carryIn !== 0 || closing !== undefined
    if (touched) {
      rows.push({
        periodStart: start,
        periodEnd: end,
        budget: budgetOf(start),
        received: money.received,
        expenses: money.expenses,
        saved: round2(money.transfers + (closing?.closingTransfers ?? 0)),
        carryIn,
        result: periodResult(money, carryIn),
        closed: closing !== undefined,
        carryOut: closing ? closing.carry : null,
      })
    }
    end = start
  }
  return rows
}
