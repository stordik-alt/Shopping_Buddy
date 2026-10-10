import type { PocketAmount } from '@/lib/budget-closing'
import { shortfall } from '@/lib/budget-balances'

// docs/15_BUDGET_PERIODS.md §12, §17: what ANITKA suggests doing with the result of a period that has
// ended — how much to put aside and how much to leave for the next period. Pure and deterministic; the
// suggestion only pre-fills the closing form, which the user can change, and nothing moves until the
// user confirms (§17). The server checks the final split with the same rules as any other (planClosing).

const round2 = (value: number) => Math.round(value * 100) / 100

export type RecommendationPocket = {
  id: string
  name: string
  balance: number
  isReserve: boolean
  targetAmount: number | null
  targetDate: string | null
  plannedContribution: number | null
  /** The contribution per period that reaches the goal in time (lib/budget-closing.ts). */
  recommended: number | null
}

/** What the next period still needs beyond the money it has and expects: unpaid recurring payments plus
 *  planned expenses, less the planned income and less what it already holds (`onHand`: its actual
 *  balance so far, which is negative when it has spent more than it received). 0 when it covers them. */
export function nextPeriodNeed(input: { commitments: number; plannedExpenses: number; plannedIncome: number; onHand?: number }): number {
  return Math.max(0, round2(input.commitments + input.plannedExpenses - input.plannedIncome - (input.onHand ?? 0)))
}

/** Why an amount was suggested — the UI turns these into sentences; the amounts are already final. */
export type RecommendationReason =
  | { kind: 'keep'; amount: number; planned?: boolean }
  | { kind: 'reserve'; amount: number; pocketName: string }
  | { kind: 'pocket'; amount: number; pocketName: string }
  | { kind: 'rest'; amount: number }
  | { kind: 'cover'; amount: number; pocketName: string; isReserve: boolean }

export type ClosingRecommendation = {
  deposits: PocketAmount[]
  withdrawals: PocketAmount[]
  carryOn: number
  reasons: RecommendationReason[]
}

/** A surplus, in the order of what a household would rather not be without:
 *  1. keep for the next period what the household planned to leave (docs/15 §14), else what its known
 *     obligations need beyond its expected income;
 *  2. top up the financial reserve towards its goal (its target, or one period of spending);
 *  3. give the other Kapsy their planned (else recommended) contribution, the nearest deadline first;
 *  4. whatever is left goes to the next period — it is the most flexible place for it.
 *  Never more than the surplus, never a Kapsa beyond what it still lacks to its target. */
export function recommendSurplus(input: {
  surplus: number
  pockets: RecommendationPocket[]
  nextNeed: number
  /** A transfer the household planned in advance for this period; the actual one is capped by the surplus. */
  plannedCarry?: number | null
  /** One period of spending: the reserve's goal when it has no target of its own. */
  reserveFallbackGoal: number
}): ClosingRecommendation {
  let left = round2(input.surplus)
  const deposits: PocketAmount[] = []
  const reasons: RecommendationReason[] = []

  const planned = input.plannedCarry !== undefined && input.plannedCarry !== null && input.plannedCarry > 0
  const keep = round2(Math.min(left, planned ? (input.plannedCarry as number) : input.nextNeed))
  left = round2(left - keep)
  if (keep > 0) reasons.push(planned ? { kind: 'keep', amount: keep, planned: true } : { kind: 'keep', amount: keep })

  const lacking = (pocket: RecommendationPocket) => (pocket.targetAmount === null ? Infinity : Math.max(0, round2(pocket.targetAmount - pocket.balance)))

  const reserve = input.pockets.find((pocket) => pocket.isReserve)
  if (reserve && left > 0) {
    const goal = reserve.targetAmount ?? input.reserveFallbackGoal
    const gap = Math.max(0, round2(goal - reserve.balance))
    const amount = round2(Math.min(left, gap))
    if (amount > 0) {
      deposits.push({ pocketId: reserve.id, amount })
      reasons.push({ kind: 'reserve', amount, pocketName: reserve.name })
      left = round2(left - amount)
    }
  }

  const others = input.pockets
    .filter((pocket) => !pocket.isReserve)
    .sort((a, b) => (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31') || a.name.localeCompare(b.name, 'cs'))
  for (const pocket of others) {
    if (left <= 0) break
    const wanted = pocket.plannedContribution ?? pocket.recommended ?? 0
    const amount = round2(Math.min(left, wanted, lacking(pocket)))
    if (amount <= 0) continue
    deposits.push({ pocketId: pocket.id, amount })
    reasons.push({ kind: 'pocket', amount, pocketName: pocket.name })
    left = round2(left - amount)
  }

  if (left > 0) reasons.push({ kind: 'rest', amount: left })
  return { deposits, withdrawals: [], carryOn: round2(keep + left), reasons }
}

/** A deficit: cover it from the reserve first, then from the Kapsy with the most money; what they
 *  cannot cover is carried on as a negative transfer by the closing itself. */
export function recommendDeficit(input: { deficit: number; pockets: RecommendationPocket[] }): ClosingRecommendation {
  let left = round2(shortfall(-input.deficit, 0, 0))
  const withdrawals: PocketAmount[] = []
  const reasons: RecommendationReason[] = []
  const byUse = [...input.pockets].sort((a, b) => Number(b.isReserve) - Number(a.isReserve) || b.balance - a.balance)
  for (const pocket of byUse) {
    if (left <= 0) break
    const amount = round2(Math.min(left, pocket.balance))
    if (amount <= 0) continue
    withdrawals.push({ pocketId: pocket.id, amount })
    reasons.push({ kind: 'cover', amount, pocketName: pocket.name, isReserve: pocket.isReserve })
    left = round2(left - amount)
  }
  return { deposits: [], withdrawals, carryOn: 0, reasons }
}
