import { describe, expect, it } from 'vitest'
import type { PeriodConfig } from '@/lib/budget-period'
import { periodColumnsOf, periodConfigOfHousehold } from '@/lib/db/period-config'

const row = (overrides: Partial<Parameters<typeof periodConfigOfHousehold>[0]> = {}) => ({
  budgetPeriodType: 'payday',
  budgetPeriodStartDay: 1,
  budgetPeriodAnchor: null,
  budgetPeriodLengthDays: null,
  ...overrides,
})

describe('periodConfigOfHousehold', () => {
  it('reads each kind from the household columns', () => {
    expect(periodConfigOfHousehold(row({ budgetPeriodType: 'calendar' }))).toEqual({ type: 'calendar' })
    expect(periodConfigOfHousehold(row({ budgetPeriodStartDay: 15 }))).toEqual({ type: 'payday', startDay: 15 })
    expect(periodConfigOfHousehold(row({ budgetPeriodType: 'custom', budgetPeriodAnchor: '2026-01-05', budgetPeriodLengthDays: 14 }))).toEqual({
      type: 'custom',
      anchor: '2026-01-05',
      lengthDays: 14,
    })
  })

  it('fails loudly on a row the database checks should have refused', () => {
    expect(() => periodConfigOfHousehold(row({ budgetPeriodType: 'custom' }))).toThrow('Neplatné nastavení')
    expect(() => periodConfigOfHousehold(row({ budgetPeriodType: 'weekly' }))).toThrow('Neplatné nastavení')
  })
})

describe('periodColumnsOf', () => {
  it('writes every column, so no stale anchor or length survives a change of kind', () => {
    expect(periodColumnsOf({ type: 'calendar' })).toEqual({ budgetPeriodType: 'calendar', budgetPeriodStartDay: 1, budgetPeriodAnchor: null, budgetPeriodLengthDays: null })
    expect(periodColumnsOf({ type: 'payday', startDay: 15 })).toEqual({ budgetPeriodType: 'payday', budgetPeriodStartDay: 15, budgetPeriodAnchor: null, budgetPeriodLengthDays: null })
    expect(periodColumnsOf({ type: 'custom', anchor: '2026-01-05', lengthDays: 14 })).toEqual({ budgetPeriodType: 'custom', budgetPeriodAnchor: '2026-01-05', budgetPeriodLengthDays: 14 })
  })

  it('is the inverse of reading the columns back', () => {
    const configs: PeriodConfig[] = [{ type: 'calendar' }, { type: 'payday', startDay: 28 }, { type: 'custom', anchor: '2027-02-01', lengthDays: 366 }]
    for (const config of configs) {
      expect(periodConfigOfHousehold(row(periodColumnsOf(config)))).toEqual(config)
    }
  })
})
