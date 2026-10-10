import { describe, expect, it } from 'vitest'
import { nextPeriodNeed, recommendDeficit, recommendSurplus, type RecommendationPocket } from '@/lib/budget-recommendation'
import { planClosing } from '@/lib/budget-closing'

const pocket = (over: Partial<RecommendationPocket> & { id: string }): RecommendationPocket => ({
  name: over.id,
  balance: 0,
  isReserve: false,
  targetAmount: null,
  targetDate: null,
  plannedContribution: null,
  recommended: null,
  ...over,
})
const balances = (pockets: RecommendationPocket[]) => new Map(pockets.map((p) => [p.id, p.balance]))

describe('nextPeriodNeed', () => {
  it('is what obligations need beyond expected income, never negative', () => {
    expect(nextPeriodNeed({ commitments: 12_000, plannedExpenses: 3_000, plannedIncome: 10_000 })).toBe(5_000)
    expect(nextPeriodNeed({ commitments: 1_000, plannedExpenses: 0, plannedIncome: 30_000 })).toBe(0)
  })

  it('counts what the period already holds, and an overdraft raises the need', () => {
    // The salary already arrived (on hand 30 000), so the 12 000 of payments are covered.
    expect(nextPeriodNeed({ commitments: 12_000, plannedExpenses: 0, plannedIncome: 0, onHand: 30_000 })).toBe(0)
    expect(nextPeriodNeed({ commitments: 12_000, plannedExpenses: 0, plannedIncome: 0, onHand: 5_000 })).toBe(7_000)
    expect(nextPeriodNeed({ commitments: 1_000, plannedExpenses: 0, plannedIncome: 0, onHand: -2_000 })).toBe(3_000)
  })
})

describe('recommendSurplus', () => {
  it('splits a surplus like the concept example: Kapsy first by priority, the rest to the next period', () => {
    const pockets = [
      pocket({ id: 'auto', name: 'Auto', plannedContribution: 2_000, targetAmount: 150_000, targetDate: '2027-12-31' }),
      pocket({ id: 'rez', name: 'Finanční rezerva', isReserve: true, targetAmount: 30_000, balance: 28_500 }),
    ]
    const result = recommendSurplus({ surplus: 4_800, pockets, nextNeed: 0, reserveFallbackGoal: 0 })
    expect(result.deposits).toEqual([
      { pocketId: 'rez', amount: 1_500 },
      { pocketId: 'auto', amount: 2_000 },
    ])
    expect(result.carryOn).toBe(1_300)
  })

  it('keeps for the next period what its known obligations need before saving anything', () => {
    const result = recommendSurplus({ surplus: 3_000, pockets: [pocket({ id: 'a', plannedContribution: 2_000 })], nextNeed: 2_500, reserveFallbackGoal: 0 })
    expect(result.deposits).toEqual([{ pocketId: 'a', amount: 500 }])
    expect(result.carryOn).toBe(2_500)
  })

  it('keeps the transfer the household planned, capped by the real surplus (docs/15 §14)', () => {
    const pockets = [pocket({ id: 'a', plannedContribution: 5_000 })]
    const planned = recommendSurplus({ surplus: 1_500, pockets, nextNeed: 0, plannedCarry: 2_000, reserveFallbackGoal: 0 })
    expect(planned.carryOn).toBe(1_500)
    expect(planned.deposits).toEqual([])
    expect(planned.reasons[0]).toEqual({ kind: 'keep', amount: 1_500, planned: true })

    const roomy = recommendSurplus({ surplus: 4_000, pockets, nextNeed: 3_500, plannedCarry: 1_000, reserveFallbackGoal: 0 })
    // The plan wins over the computed need; the rest still goes to the Kapsa.
    expect(roomy.deposits).toEqual([{ pocketId: 'a', amount: 3_000 }])
    expect(roomy.carryOn).toBe(1_000)
  })

  it('tops up a reserve without a target towards one period of spending', () => {
    const result = recommendSurplus({ surplus: 10_000, pockets: [pocket({ id: 'r', isReserve: true, balance: 30_000 })], nextNeed: 0, reserveFallbackGoal: 35_000 })
    expect(result.deposits).toEqual([{ pocketId: 'r', amount: 5_000 }])
    expect(result.carryOn).toBe(5_000)
  })

  it('never suggests more than a Kapsa lacks to its goal or more than the surplus', () => {
    const result = recommendSurplus({ surplus: 100, pockets: [pocket({ id: 'a', plannedContribution: 5_000, targetAmount: 1_000, balance: 950, targetDate: '2027-01-01' })], nextNeed: 0, reserveFallbackGoal: 0 })
    expect(result.deposits).toEqual([{ pocketId: 'a', amount: 50 }])
    expect(result.carryOn).toBe(50)
  })

  it('always produces a split that the closing rules accept', () => {
    const pockets = [pocket({ id: 'a', plannedContribution: 9_000 }), pocket({ id: 'r', isReserve: true, balance: 0 })]
    const rec = recommendSurplus({ surplus: 4_800, pockets, nextNeed: 1_000, reserveFallbackGoal: 20_000 })
    expect('plan' in planClosing(4_800, { deposits: rec.deposits, withdrawals: rec.withdrawals, carryOn: rec.carryOn }, balances(pockets))).toBe(true)
  })
})

describe('recommendDeficit', () => {
  it('covers a deficit from the reserve first, then the largest Kapsa', () => {
    const pockets = [pocket({ id: 'big', balance: 9_000 }), pocket({ id: 'rez', isReserve: true, balance: 1_500 })]
    const result = recommendDeficit({ deficit: 2_300, pockets })
    expect(result.withdrawals).toEqual([
      { pocketId: 'rez', amount: 1_500 },
      { pocketId: 'big', amount: 800 },
    ])
    expect('plan' in planClosing(-2_300, { deposits: [], withdrawals: result.withdrawals, carryOn: 0 }, balances(pockets))).toBe(true)
  })

  it('leaves what the Kapsy cannot cover to the negative carry', () => {
    const result = recommendDeficit({ deficit: 2_300, pockets: [pocket({ id: 'a', balance: 1_000 })] })
    expect(result.withdrawals).toEqual([{ pocketId: 'a', amount: 1_000 }])
  })
})
