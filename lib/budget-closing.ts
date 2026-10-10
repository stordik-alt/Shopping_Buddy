import { actualBalance, freeMoney, shortfall } from '@/lib/budget-balances'
import { nextPeriodStartFor, periodStartFor, type PeriodConfig } from '@/lib/budget-period'

// docs/15_BUDGET_PERIODS.md §11–15: closing a period, the transfer to the next one, and Kapsy.
// Pure and deterministic — the server (app/actions/period-closing.ts) feeds it real rows, the UI only
// shows its numbers. Amounts are rounded to hellers so float sums never drift.
//
// The model, in one place:
//   result(P)  = received income + carry-in − paid expenses − ordinary Kapsa transfers of P   (§9.1, §14)
//   carry(P)   = result(P) − Kapsa moves made while closing P − kept (left unassigned)
// The carry is never stored: it is recomputed from the period's real data, so a later change to a
// closed period moves the carry (and everything after it) by itself — §14 "Změna uzavřeného období".

const round2 = (value: number) => Math.round(value * 100) / 100

// ---------------------------------------------------------------------------------------------------
// Period result and carry

/** The real money of one period. */
export type PeriodMoney = {
  /** Income that was actually received (planned income is not money yet, §8). */
  received: number
  /** Expenses actually paid. */
  expenses: number
  /** Net budget → Kapsa moves made during the period (positive = saved, negative = taken back). Moves
   *  made while closing the period are not part of this: they distribute the result (§15). */
  transfers: number
}

/** §9.1 + §14: the period's result. The carry-in is a transfer, not an income (§14), but it is part of
 *  the money available in the period, so it enters the balance next to the income. */
export function periodResult(money: PeriodMoney, carryIn: number): number {
  return actualBalance({ income: round2(money.received + carryIn), expenses: money.expenses, transfers: money.transfers })
}

/** What the period passes on to the next one. `closingTransfers` are the Kapsa moves made while closing
 *  (positive = into a Kapsa, negative = taken out to cover a deficit); `kept` is the surplus the user
 *  deliberately left unassigned. Positive = surplus carried, negative = deficit carried (§14). */
export function closingCarry(result: number, closingTransfers: number, kept: number): number {
  return round2(result - closingTransfers - kept)
}

/** A closed period as stored. */
export type ClosedPeriod = {
  periodStart: string
  /** Exclusive end — the start of the period the carry goes to. */
  periodEnd: string
  kept: number
  closingTransfers: number
}

export type ClosedPeriodResult = ClosedPeriod & { carryIn: number; result: number; carry: number }

/** Works out every closed period's result and carry in time order. A period receives the carry of the
 *  closed period that ends where it starts; with none, its carry-in is 0. `moneyOf` gives a period's
 *  real money (it must be the same data the budget shows). Returns the closed periods in order. */
export function resolveClosedPeriods(closings: ClosedPeriod[], moneyOf: (periodStart: string, periodEnd: string) => PeriodMoney): ClosedPeriodResult[] {
  const ordered = [...closings].sort((a, b) => a.periodStart.localeCompare(b.periodStart))
  const carryByEnd = new Map<string, number>()
  const results: ClosedPeriodResult[] = []
  for (const closing of ordered) {
    const carryIn = carryByEnd.get(closing.periodStart) ?? 0
    const result = periodResult(moneyOf(closing.periodStart, closing.periodEnd), carryIn)
    const carry = closingCarry(result, closing.closingTransfers, closing.kept)
    carryByEnd.set(closing.periodEnd, carry)
    results.push({ ...closing, carryIn, result, carry })
  }
  return results
}

/** The carry that arrives at the start of `periodStart` (0 when the period before it is not closed). */
export function carryIntoPeriod(closed: ClosedPeriodResult[], periodStart: string): number {
  return closed.find((period) => period.periodEnd === periodStart)?.carry ?? 0
}

// ---------------------------------------------------------------------------------------------------
// Closing a period

export type PeriodVerdict = { kind: 'surplus'; amount: number } | { kind: 'deficit'; amount: number } | { kind: 'even'; amount: 0 }

/** §12: whether the period ended with money to distribute, a deficit to cover, or exactly nothing.
 *  Nothing is reserved here: at the end of a period no commitment of it is left to come. */
export function evaluatePeriod(result: number): PeriodVerdict {
  const free = freeMoney(result, 0, 0)
  if (free > 0) return { kind: 'surplus', amount: free }
  const missing = shortfall(result, 0, 0)
  if (missing > 0) return { kind: 'deficit', amount: missing }
  return { kind: 'even', amount: 0 }
}

/** An amount of one Kapsa, as the user chose it. */
export type PocketAmount = { pocketId: string; amount: number }

export type ClosingChoice = {
  /** Surplus only: money put into Kapsy (§12). */
  deposits: PocketAmount[]
  /** Deficit only: money taken out of Kapsy to cover it (§12, §13). */
  withdrawals: PocketAmount[]
  /** Surplus only: the part left for the next period (a positive transfer, §14). */
  carryOn: number
}

export type ClosingPlan = {
  /** Signed Kapsa moves to record: positive into the Kapsa, negative out of it. */
  moves: PocketAmount[]
  /** The surplus left unassigned (neither in a Kapsa nor carried). */
  kept: number
  /** What the next period receives: positive surplus, negative deficit. */
  carry: number
}

/** Checks the user's split of the result against §13–14 and turns it into the moves to record, or says
 *  why it cannot be done:
 *  - a surplus may be spread over Kapsy and the next period, never beyond the real surplus (a transfer
 *    must not create money that does not exist);
 *  - a deficit is not free money: it cannot be saved, it is covered from Kapsy and whatever is not
 *    covered is carried on as a negative transfer, never more than the real deficit;
 *  - a Kapsa cannot be drawn below zero. `pocketBalances` maps Kapsa id → current balance. */
export function planClosing(result: number, choice: ClosingChoice, pocketBalances: ReadonlyMap<string, number>): { plan: ClosingPlan } | { error: string } {
  const verdict = evaluatePeriod(result)
  const amountsError = checkAmounts([...choice.deposits, ...choice.withdrawals], pocketBalances)
  if (amountsError) return { error: amountsError }
  const deposited = round2(choice.deposits.reduce((sum, item) => sum + item.amount, 0))
  const withdrawn = round2(choice.withdrawals.reduce((sum, item) => sum + item.amount, 0))
  if (!Number.isFinite(choice.carryOn) || choice.carryOn < 0) return { error: 'Převod do dalšího období nemůže být záporný.' }

  if (verdict.kind === 'deficit') {
    // A deficit is covered first; no new savings and no positive transfer while it exists (§13).
    if (deposited > 0 || choice.carryOn > 0) return { error: 'Při schodku nelze nic ukládat do Kapes ani převádět jako přebytek. Nejdřív ho pokryjte.' }
    if (withdrawn > verdict.amount) return { error: 'Z Kapes nelze vzít víc, než je schodek.' }
    for (const item of choice.withdrawals) {
      if (item.amount > (pocketBalances.get(item.pocketId) ?? 0)) return { error: 'V Kapse není dost peněz.' }
    }
    return {
      plan: {
        moves: choice.withdrawals.map((item) => ({ pocketId: item.pocketId, amount: -item.amount })),
        kept: 0,
        // Whatever the Kapsy do not cover is carried on as a deficit (§12 "následující období").
        // `0 -` rather than a unary minus: a fully covered deficit must be 0, not -0.
        carry: round2(0 - (verdict.amount - withdrawn)),
      },
    }
  }

  if (withdrawn > 0) return { error: 'Z Kapes lze při uzavření brát jen na pokrytí schodku.' }
  const assigned = round2(deposited + choice.carryOn)
  if (assigned > verdict.amount) return { error: 'Rozdělujete víc, než vám skutečně zbylo.' }
  return {
    plan: {
      moves: choice.deposits.map((item) => ({ pocketId: item.pocketId, amount: item.amount })),
      kept: round2(verdict.amount - assigned),
      carry: choice.carryOn,
    },
  }
}

/** Every amount is positive, finite, and each Kapsa appears once and exists. */
function checkAmounts(items: PocketAmount[], pocketBalances: ReadonlyMap<string, number>): string | null {
  const seen = new Set<string>()
  for (const item of items) {
    if (!pocketBalances.has(item.pocketId)) return 'Kapsa nebyla nalezena.'
    if (seen.has(item.pocketId)) return 'Každou Kapsu uveďte jen jednou.'
    seen.add(item.pocketId)
    if (!Number.isFinite(item.amount) || item.amount <= 0) return 'Částky musí být větší než 0.'
  }
  return null
}

/** Whether a period can be closed on `today`: only a period that has already ended (§12). */
export function canClosePeriod(periodEnd: string, today: string): boolean {
  return today >= periodEnd
}

/** The newest period that has ended and is not closed yet, or null. Only the one just before the
 *  current period is offered: older gaps are history, not a prompt. */
export function periodToClose(config: PeriodConfig, today: string, closedStarts: ReadonlySet<string>): { periodStart: string; periodEnd: string } | null {
  const currentStart = periodStartFor(config, today)
  // The day before the current period starts lies in the previous period.
  const previousStart = periodStartFor(config, isoDayBefore(currentStart))
  if (closedStarts.has(previousStart)) return null
  return { periodStart: previousStart, periodEnd: nextPeriodStartFor(config, previousStart) }
}

function isoDayBefore(date: string): string {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------------------------------
// Kapsy

/** §11 A Kapsa's balance: what it started with plus every real transfer (negative ones take money out).
 *  A planned contribution is not a transfer, so it never changes this (§11.1). */
export function pocketBalance(openingAmount: number, transfers: number[]): number {
  return round2(openingAmount + transfers.reduce((sum, amount) => sum + amount, 0))
}

/** How many budget periods remain until `deadline`, counting the current one (at least 1). Used to
 *  spread what is still missing evenly over the periods the user will actually save in. */
export function periodsUntil(config: PeriodConfig, today: string, deadline: string): number {
  let start = periodStartFor(config, today)
  let count = 1
  // A target date decades away would be a typo; the guard also bounds the loop.
  while (count < 1200) {
    const next = nextPeriodStartFor(config, start)
    if (next > deadline) break
    start = next
    count += 1
  }
  return count
}

/** §11 The recommended contribution per period to reach `targetAmount` by `targetDate`: what is still
 *  missing divided evenly over the remaining periods, rounded up to whole crowns. null when there is
 *  no goal or no deadline to plan against; 0 once the goal is reached. */
export function recommendedContribution(
  config: PeriodConfig,
  today: string,
  pocket: { balance: number; targetAmount: number | null; targetDate: string | null },
): number | null {
  if (pocket.targetAmount === null || pocket.targetDate === null) return null
  const missing = pocket.targetAmount - pocket.balance
  if (missing <= 0) return 0
  // A deadline already passed leaves one period to save in: the whole rest.
  const periods = pocket.targetDate < today ? 1 : periodsUntil(config, today, pocket.targetDate)
  return Math.ceil(missing / periods)
}

/** Progress towards the goal, 0–1 (null without a goal). */
export function pocketProgress(balance: number, targetAmount: number | null): number | null {
  if (targetAmount === null || targetAmount <= 0) return null
  return Math.min(1, Math.max(0, balance / targetAmount))
}

/** The most that may be moved from the budget into a Kapsa: money that really is in the budget. A
 *  transfer must not create money (§14), and a deficit is not money to save (§13). */
export function maxDeposit(actualBalanceOfPeriod: number): number {
  return Math.max(0, round2(actualBalanceOfPeriod))
}
