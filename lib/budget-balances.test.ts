import { describe, expect, it } from 'vitest'
import {
  actualBalance,
  availableBalance,
  freeMoney,
  incomeTotals,
  isShortfallPredicted,
  plannedBalance,
  predictedBalance,
  shortfall,
} from '@/lib/budget-balances'

// The examples below are the ones from docs/15 §9.

describe('incomeTotals', () => {
  it('keeps received and planned income apart (§8)', () => {
    expect(
      incomeTotals([
        { amount: 38_000, status: 'actual' },
        { amount: 1_500.5, status: 'planned' },
        { amount: 200.25, status: 'planned' },
      ]),
    ).toEqual({ received: 38_000, planned: 1_700.75 })
  })

  it('is zero for no income', () => {
    expect(incomeTotals([])).toEqual({ received: 0, planned: 0 })
  })
})

describe('actualBalance', () => {
  it('is income − expenses − transfers (§9.1)', () => {
    expect(actualBalance({ income: 38_000, expenses: 31_200, transfers: 2_000 })).toBe(4_800)
  })

  it('can be negative when more was paid than received', () => {
    expect(actualBalance({ income: 38_000, expenses: 40_300, transfers: 0 })).toBe(-2_300)
  })

  it('does not drift on float sums', () => {
    expect(actualBalance({ income: 0.3, expenses: 0.1, transfers: 0.1 })).toBe(0.1)
  })
})

describe('availableBalance', () => {
  it('subtracts reserved commitments (§9.2)', () => {
    expect(availableBalance(6_800, 3_800)).toBe(3_000)
  })
})

describe('plannedBalance / predictedBalance', () => {
  it('plans income − expenses − savings (§9.3)', () => {
    expect(plannedBalance(38_000, 30_000, 3_000)).toBe(5_000)
  })

  it('predicts actual + expected income − expected expenses − planned transfers (§9.4)', () => {
    expect(predictedBalance(6_800, 0, 6_000, 0)).toBe(800)
  })

  it('does not change the actual balance: planned amounts are separate inputs', () => {
    const actual = actualBalance({ income: 10_000, expenses: 4_000, transfers: 0 })
    predictedBalance(actual, 38_000, 20_000, 1_000)
    expect(actual).toBe(6_000)
  })
})

describe('freeMoney / shortfall', () => {
  it('is actual − reserved − earmarked (§9.5)', () => {
    expect(freeMoney(6_800, 3_800, 500)).toBe(2_500)
    expect(shortfall(6_800, 3_800, 500)).toBe(0)
  })

  it('is never negative; a deficit is reported as a shortfall instead (§13)', () => {
    expect(freeMoney(-2_300, 0, 0)).toBe(0)
    expect(shortfall(-2_300, 0, 0)).toBe(2_300)
    expect(freeMoney(1_000, 3_000, 0)).toBe(0)
    expect(shortfall(1_000, 3_000, 0)).toBe(2_000)
  })

  it('is not the same as the actual balance', () => {
    expect(freeMoney(4_800, 1_000, 0)).not.toBe(4_800)
  })
})

describe('isShortfallPredicted', () => {
  it('warns only below zero (§16)', () => {
    expect(isShortfallPredicted(-2_300)).toBe(true)
    expect(isShortfallPredicted(0)).toBe(false)
    expect(isShortfallPredicted(800)).toBe(false)
  })
})
