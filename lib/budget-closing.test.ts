import { describe, expect, it } from 'vitest'
import {
  canClosePeriod,
  carryIntoPeriod,
  closingCarry,
  evaluatePeriod,
  maxDeposit,
  periodResult,
  periodsUntil,
  periodToClose,
  planClosing,
  pocketBalance,
  pocketProgress,
  recommendedContribution,
  resolveClosedPeriods,
  type PeriodMoney,
} from '@/lib/budget-closing'
import type { PeriodConfig } from '@/lib/budget-period'

const calendar: PeriodConfig = { type: 'calendar' }
const balances = (entries: Record<string, number>) => new Map(Object.entries(entries))
const choice = (over: Partial<Parameters<typeof planClosing>[1]> = {}) => ({ deposits: [], withdrawals: [], carryOn: 0, ...over })

describe('periodResult', () => {
  it('adds the carry to the income side but keeps it out of the income itself (§14)', () => {
    // docs/15 §14: pay 38 000 + carry +1 800 → 39 800 available.
    expect(periodResult({ received: 38_000, expenses: 0, transfers: 0 }, 1_800)).toBe(39_800)
    expect(periodResult({ received: 38_000, expenses: 0, transfers: 0 }, -2_300)).toBe(35_700)
  })

  it('matches the §9.1 example (38 000 − 31 200 − 2 000 = 4 800)', () => {
    expect(periodResult({ received: 38_000, expenses: 31_200, transfers: 2_000 }, 0)).toBe(4_800)
  })
})

describe('evaluatePeriod', () => {
  it('tells a surplus, a deficit and an even period apart', () => {
    expect(evaluatePeriod(4_800)).toEqual({ kind: 'surplus', amount: 4_800 })
    expect(evaluatePeriod(-2_300)).toEqual({ kind: 'deficit', amount: 2_300 })
    expect(evaluatePeriod(0)).toEqual({ kind: 'even', amount: 0 })
  })
})

describe('planClosing — surplus (§12, §14)', () => {
  it('splits the §12 example: Auto +2 000, Rezerva +1 500, next period +1 300', () => {
    const outcome = planClosing(
      4_800,
      choice({ deposits: [{ pocketId: 'auto', amount: 2_000 }, { pocketId: 'rezerva', amount: 1_500 }], carryOn: 1_300 }),
      balances({ auto: 0, rezerva: 0 }),
    )
    expect(outcome).toEqual({
      plan: {
        moves: [{ pocketId: 'auto', amount: 2_000 }, { pocketId: 'rezerva', amount: 1_500 }],
        kept: 0,
        carry: 1_300,
      },
    })
  })

  it('keeps what is not assigned instead of inventing a transfer', () => {
    const outcome = planClosing(4_800, choice({ carryOn: 1_000 }), balances({}))
    expect(outcome).toEqual({ plan: { moves: [], kept: 3_800, carry: 1_000 } })
  })

  it('refuses to distribute more than the real surplus (a transfer must not create money)', () => {
    expect(planClosing(1_500, choice({ carryOn: 2_000 }), balances({}))).toEqual({ error: 'Rozdělujete víc, než vám skutečně zbylo.' })
    expect(planClosing(1_500, choice({ deposits: [{ pocketId: 'a', amount: 1_000 }], carryOn: 600 }), balances({ a: 0 }))).toHaveProperty('error')
  })

  it('refuses withdrawals, negative carries, unknown or repeated Kapsy and non-positive amounts', () => {
    expect(planClosing(1_000, choice({ withdrawals: [{ pocketId: 'a', amount: 100 }] }), balances({ a: 500 }))).toHaveProperty('error')
    expect(planClosing(1_000, choice({ carryOn: -1 }), balances({}))).toHaveProperty('error')
    expect(planClosing(1_000, choice({ deposits: [{ pocketId: 'x', amount: 100 }] }), balances({ a: 0 }))).toEqual({ error: 'Kapsa nebyla nalezena.' })
    expect(planClosing(1_000, choice({ deposits: [{ pocketId: 'a', amount: 100 }, { pocketId: 'a', amount: 100 }] }), balances({ a: 0 }))).toEqual({
      error: 'Každou Kapsu uveďte jen jednou.',
    })
    expect(planClosing(1_000, choice({ deposits: [{ pocketId: 'a', amount: 0 }] }), balances({ a: 0 }))).toHaveProperty('error')
    expect(planClosing(1_000, choice({ deposits: [{ pocketId: 'a', amount: Number.NaN }] }), balances({ a: 0 }))).toHaveProperty('error')
  })
})

describe('planClosing — deficit (§13, §14)', () => {
  it('carries the whole deficit as a negative transfer when nothing covers it', () => {
    expect(planClosing(-2_300, choice(), balances({}))).toEqual({ plan: { moves: [], kept: 0, carry: -2_300 } })
  })

  it('covers part from a Kapsa and carries only what is left uncovered', () => {
    const outcome = planClosing(-2_300, choice({ withdrawals: [{ pocketId: 'rezerva', amount: 1_000 }] }), balances({ rezerva: 5_000 }))
    expect(outcome).toEqual({ plan: { moves: [{ pocketId: 'rezerva', amount: -1_000 }], kept: 0, carry: -1_300 } })
  })

  it('carries nothing when the Kapsy cover the whole deficit', () => {
    const outcome = planClosing(-2_300, choice({ withdrawals: [{ pocketId: 'rezerva', amount: 2_300 }] }), balances({ rezerva: 5_000 }))
    expect(outcome).toEqual({ plan: { moves: [{ pocketId: 'rezerva', amount: -2_300 }], kept: 0, carry: 0 } })
  })

  it('never lets a deficit become a saving or a surplus carry', () => {
    expect(planClosing(-100, choice({ deposits: [{ pocketId: 'a', amount: 50 }] }), balances({ a: 0 }))).toHaveProperty('error')
    expect(planClosing(-100, choice({ carryOn: 50 }), balances({}))).toHaveProperty('error')
  })

  it('refuses to take more than the deficit or more than a Kapsa holds', () => {
    expect(planClosing(-500, choice({ withdrawals: [{ pocketId: 'a', amount: 600 }] }), balances({ a: 9_000 }))).toEqual({
      error: 'Z Kapes nelze vzít víc, než je schodek.',
    })
    expect(planClosing(-500, choice({ withdrawals: [{ pocketId: 'a', amount: 400 }] }), balances({ a: 300 }))).toEqual({ error: 'V Kapse není dost peněz.' })
  })
})

describe('planClosing — even period', () => {
  it('has nothing to distribute', () => {
    expect(planClosing(0, choice(), balances({}))).toEqual({ plan: { moves: [], kept: 0, carry: 0 } })
    expect(planClosing(0, choice({ carryOn: 10 }), balances({}))).toHaveProperty('error')
  })
})

describe('closed periods and the carry chain', () => {
  const money = (table: Record<string, PeriodMoney>) => (start: string) => table[start] ?? { received: 0, expenses: 0, transfers: 0 }

  it('recomputes the carry when a closed period changes (§14: +1 800, extra expense 500 → +1 300)', () => {
    const closing = { periodStart: '2026-09-01', periodEnd: '2026-10-01', kept: 0, closingTransfers: 3_000 }
    const before = resolveClosedPeriods([closing], money({ '2026-09-01': { received: 38_000, expenses: 33_200, transfers: 0 } }))
    expect(before[0].result).toBe(4_800)
    expect(before[0].carry).toBe(1_800)
    const after = resolveClosedPeriods([closing], money({ '2026-09-01': { received: 38_000, expenses: 33_700, transfers: 0 } }))
    expect(after[0].carry).toBe(1_300)
    expect(carryIntoPeriod(after, '2026-10-01')).toBe(1_300)
  })

  it('flows a carry through consecutive periods and turns into a deficit when expenses grow', () => {
    const chain = [
      { periodStart: '2026-08-01', periodEnd: '2026-09-01', kept: 0, closingTransfers: 0 },
      { periodStart: '2026-09-01', periodEnd: '2026-10-01', kept: 0, closingTransfers: 0 },
    ]
    const resolved = resolveClosedPeriods(
      chain,
      money({
        '2026-08-01': { received: 1_000, expenses: 1_500, transfers: 0 },
        '2026-09-01': { received: 1_000, expenses: 1_000, transfers: 0 },
      }),
    )
    // August: −500 carried; September starts with it and spends exactly its income → −500 again.
    expect(resolved.map((period) => period.carry)).toEqual([-500, -500])
    expect(resolved[1].carryIn).toBe(-500)
  })

  it('gives no carry to a period whose predecessor is not closed', () => {
    const resolved = resolveClosedPeriods([{ periodStart: '2026-09-01', periodEnd: '2026-10-01', kept: 0, closingTransfers: 0 }], money({}))
    expect(carryIntoPeriod(resolved, '2026-10-01')).toBe(0)
    expect(carryIntoPeriod(resolved, '2026-11-01')).toBe(0)
  })

  it('subtracts the unassigned part so only the chosen amount is carried', () => {
    expect(closingCarry(4_800, 2_000, 1_500)).toBe(1_300)
  })
})

describe('periodToClose / canClosePeriod', () => {
  it('offers the period just before the current one, unless it is already closed', () => {
    expect(periodToClose(calendar, '2026-10-12', new Set())).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-10-01' })
    expect(periodToClose(calendar, '2026-10-12', new Set(['2026-09-01']))).toBeNull()
  })

  it('follows a payday and a custom period', () => {
    expect(periodToClose({ type: 'payday', startDay: 15 }, '2026-10-20', new Set())).toEqual({ periodStart: '2026-09-15', periodEnd: '2026-10-15' })
    expect(periodToClose({ type: 'custom', anchor: '2026-01-05', lengthDays: 14 }, '2026-01-20', new Set())).toEqual({ periodStart: '2026-01-05', periodEnd: '2026-01-19' })
  })

  it('closes only a period that has ended', () => {
    expect(canClosePeriod('2026-10-01', '2026-09-30')).toBe(false)
    expect(canClosePeriod('2026-10-01', '2026-10-01')).toBe(true)
  })
})

describe('Kapsy', () => {
  it('sums the opening amount and real transfers only', () => {
    expect(pocketBalance(1_000, [500, -200, 0.1, 0.2])).toBe(1_300.3)
  })

  it('counts the periods left until the deadline, current one included', () => {
    expect(periodsUntil(calendar, '2026-10-12', '2026-10-31')).toBe(1)
    expect(periodsUntil(calendar, '2026-10-12', '2026-11-01')).toBe(2)
    expect(periodsUntil(calendar, '2026-10-12', '2027-12-31')).toBe(15)
  })

  it('recommends an even contribution that reaches the goal (§11: 150 000 by December 2027)', () => {
    // Oct 2026 … Dec 2027 is 15 periods; 150 000 / 15 = 10 000.
    expect(recommendedContribution(calendar, '2026-10-12', { balance: 0, targetAmount: 150_000, targetDate: '2027-12-31' })).toBe(10_000)
    // Part of it already saved: the rest is spread over the same periods, rounded up.
    expect(recommendedContribution(calendar, '2026-10-12', { balance: 50_000, targetAmount: 150_000, targetDate: '2027-12-31' })).toBe(6_667)
  })

  it('recommends nothing without a goal and 0 once it is reached', () => {
    expect(recommendedContribution(calendar, '2026-10-12', { balance: 0, targetAmount: null, targetDate: '2027-12-31' })).toBeNull()
    expect(recommendedContribution(calendar, '2026-10-12', { balance: 0, targetAmount: 1_000, targetDate: null })).toBeNull()
    expect(recommendedContribution(calendar, '2026-10-12', { balance: 1_000, targetAmount: 1_000, targetDate: '2027-01-01' })).toBe(0)
  })

  it('puts the whole rest into one period when the deadline has passed', () => {
    expect(recommendedContribution(calendar, '2026-10-12', { balance: 100, targetAmount: 1_000, targetDate: '2026-01-01' })).toBe(900)
  })

  it('shows progress between 0 and 1', () => {
    expect(pocketProgress(500, 1_000)).toBe(0.5)
    expect(pocketProgress(2_000, 1_000)).toBe(1)
    expect(pocketProgress(-5, 1_000)).toBe(0)
    expect(pocketProgress(5, null)).toBeNull()
  })

  it('allows saving only money that is in the budget', () => {
    expect(maxDeposit(4_800)).toBe(4_800)
    expect(maxDeposit(-300)).toBe(0)
  })
})
