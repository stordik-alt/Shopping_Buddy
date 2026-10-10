import { describe, expect, it } from 'vitest'
import { buildPeriodHistory } from '@/lib/budget-history'
import type { ClosedPeriodResult, PeriodMoney } from '@/lib/budget-closing'

const payday15 = { type: 'payday', startDay: 15 } as const

// Money by period start, for periods 15th → 14th.
const money: Record<string, PeriodMoney> = {
  '2026-08-15': { received: 38_000, expenses: 36_000, transfers: 0 },
  '2026-09-15': { received: 38_000, expenses: 31_200, transfers: 2_000 },
}
const moneyOf = (start: string): PeriodMoney => money[start] ?? { received: 0, expenses: 0, transfers: 0 }

describe('buildPeriodHistory', () => {
  it('lists past periods newest first, cut by the household period (payday), not the calendar month', () => {
    const rows = buildPeriodHistory({ config: payday15, currentStart: '2026-10-15', earliest: '2026-08-20', closed: [], moneyOf, budgetOf: () => 40_000 })
    expect(rows.map((row) => [row.periodStart, row.periodEnd])).toEqual([
      ['2026-09-15', '2026-10-15'],
      ['2026-08-15', '2026-09-15'],
    ])
    expect(rows[0]).toMatchObject({ budget: 40_000, received: 38_000, expenses: 31_200, saved: 2_000, result: 4_800, closed: false, carryOut: null })
  })

  it('shows a shortfall as a negative result and a closed period with its carry', () => {
    const closed: ClosedPeriodResult[] = [{ periodStart: '2026-08-15', periodEnd: '2026-09-15', kept: 0, closingTransfers: 0, carryIn: 0, result: 2_000, carry: 2_000 }]
    const rows = buildPeriodHistory({ config: payday15, currentStart: '2026-10-15', earliest: '2026-08-20', closed, moneyOf: (start) => (start === '2026-09-15' ? { received: 1_000, expenses: 4_000, transfers: 0 } : moneyOf(start)), budgetOf: () => 0 })
    // The September period received the 2 000 carried from August: 1 000 + 2 000 − 4 000.
    expect(rows[0]).toMatchObject({ carryIn: 2_000, result: -1_000 })
    expect(rows[1]).toMatchObject({ closed: true, carryOut: 2_000 })
  })

  it('counts the moves made while closing as saved', () => {
    const closed: ClosedPeriodResult[] = [{ periodStart: '2026-08-15', periodEnd: '2026-09-15', kept: 0, closingTransfers: 1_500, carryIn: 0, result: 2_000, carry: 500 }]
    const rows = buildPeriodHistory({ config: payday15, currentStart: '2026-09-15', earliest: '2026-08-20', closed, moneyOf, budgetOf: () => 0 })
    expect(rows[0].saved).toBe(1_500)
  })

  it('skips empty periods, stops at the first record and respects the limit', () => {
    expect(buildPeriodHistory({ config: payday15, currentStart: '2026-10-15', earliest: null, closed: [], moneyOf, budgetOf: () => 0 })).toEqual([])
    const rows = buildPeriodHistory({ config: payday15, currentStart: '2026-10-15', earliest: '2025-01-01', closed: [], moneyOf, budgetOf: () => 0, limit: 1 })
    expect(rows).toHaveLength(1)
    // 2026-07-15 and earlier hold nothing, so they are not listed even though the limit would allow them.
    expect(buildPeriodHistory({ config: payday15, currentStart: '2026-10-15', earliest: '2025-01-01', closed: [], moneyOf, budgetOf: () => 0 }).map((row) => row.periodStart)).toEqual(['2026-09-15', '2026-08-15'])
  })
})
