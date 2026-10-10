import { describe, expect, it } from 'vitest'
import { expectedCarry, projectOutlook, type OutlookPeriodInput } from '@/lib/budget-outlook'

const period = (start: string, over: Partial<OutlookPeriodInput> = {}): OutlookPeriodInput => ({
  periodStart: start,
  plannedIncome: 0,
  receivedIncome: 0,
  plannedExpenses: 0,
  commitments: 0,
  plannedTransfers: 0,
  plannedCarry: null,
  budget: 0,
  ...over,
})

describe('expectedCarry (docs/15 §14)', () => {
  it('carries only what was set aside, never more than the period ends with', () => {
    expect(expectedCarry(1500, 2000)).toBe(1500)
    expect(expectedCarry(3000, 2000)).toBe(2000)
  })

  it('carries nothing from a surplus nobody assigned', () => {
    expect(expectedCarry(1500, null)).toBe(0)
    expect(expectedCarry(1500, 0)).toBe(0)
  })

  it('carries a shortfall whole, whatever was planned', () => {
    expect(expectedCarry(-800, 2000)).toBe(-800)
    expect(expectedCarry(-800, null)).toBe(-800)
  })
})

describe('projectOutlook', () => {
  it('takes the running period from the actual balance and the rest of its budget', () => {
    const [now] = projectOutlook({
      actualNow: 10_000,
      spentNow: 12_000,
      periods: [period('2026-10-01', { plannedIncome: 5_000, budget: 20_000, plannedTransfers: 500 })],
    })
    // 10 000 + 5 000 − (20 000 − 12 000 still budgeted) − 500
    expect(now).toMatchObject({ opening: 10_000, income: 5_000, spending: 8_000, predicted: 6_500, carryOut: 0 })
  })

  it('lets known payments and planned expenses win over a smaller budget', () => {
    const [now] = projectOutlook({
      actualNow: 1_000,
      spentNow: 0,
      periods: [period('2026-10-01', { budget: 5_000, commitments: 4_000, plannedExpenses: 3_000 })],
    })
    expect(now.spending).toBe(7_000)
    expect(now.predicted).toBe(-6_000)
    expect(now.carryOut).toBe(-6_000)
  })

  it('hands the planned carry to the next period as its opening', () => {
    const [now, next] = projectOutlook({
      actualNow: 4_000,
      spentNow: 0,
      periods: [
        period('2026-10-01', { budget: 1_000, plannedCarry: 2_000 }),
        period('2026-11-01', { plannedIncome: 38_000, budget: 30_000 }),
      ],
    })
    expect(now.carryOut).toBe(2_000)
    expect(next.opening).toBe(2_000)
    expect(next.predicted).toBe(10_000)
    // Nobody assigned the 10 000: it is not carried on.
    expect(next.carryOut).toBe(0)
  })

  it('counts incomes already received in a later period as known income', () => {
    const [, next] = projectOutlook({
      actualNow: 0,
      spentNow: 0,
      periods: [period('2026-10-01'), period('2026-11-01', { plannedIncome: 1_000, receivedIncome: 500 })],
    })
    expect(next.income).toBe(1_500)
  })

  it('passes a shortfall on as a negative opening', () => {
    const [, next] = projectOutlook({
      actualNow: 0,
      spentNow: 0,
      periods: [period('2026-10-01', { budget: 300 }), period('2026-11-01', { plannedIncome: 1_000, budget: 500 })],
    })
    expect(next.opening).toBe(-300)
    expect(next.predicted).toBe(200)
  })

  it('returns nothing for no periods', () => {
    expect(projectOutlook({ actualNow: 0, spentNow: 0, periods: [] })).toEqual([])
  })
})
