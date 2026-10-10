import { describe, expect, it } from 'vitest'
import {
  CALENDAR_PERIOD,
  isCalendarMonth,
  monthlyStartDay,
  nextPeriodStartFor,
  periodConfigError,
  periodConfigKey,
  periodDayFor,
  periodDaysLeftFor,
  periodEndFor,
  periodLengthFor,
  parsePeriodConfig,
  periodStartFor,
  previousPeriodStartFor,
  toPeriodConfig,
  type PeriodConfig,
} from '@/lib/budget-period'

const payday15: PeriodConfig = { type: 'payday', startDay: 15 }
const every14: PeriodConfig = { type: 'custom', anchor: '2026-01-05', lengthDays: 14 }

describe('calendar and payday periods', () => {
  it('calendar is the calendar month', () => {
    expect(periodStartFor(CALENDAR_PERIOD, '2026-10-20')).toBe('2026-10-01')
    expect(periodEndFor(CALENDAR_PERIOD, '2026-10-01')).toBe('2026-10-31')
    expect(periodEndFor(CALENDAR_PERIOD, '2026-02-01')).toBe('2026-02-28')
  })

  it('payday 15 runs 15th to 14th of the next month', () => {
    expect(periodStartFor(payday15, '2026-10-20')).toBe('2026-10-15')
    expect(periodStartFor(payday15, '2026-10-14')).toBe('2026-09-15')
    expect(periodEndFor(payday15, '2026-10-15')).toBe('2026-11-14')
  })

  it('rolls over the year', () => {
    expect(periodStartFor(payday15, '2027-01-03')).toBe('2026-12-15')
    expect(nextPeriodStartFor(payday15, '2026-12-15')).toBe('2027-01-15')
  })

  it('keeps every day of two years inside exactly one period that contains it', () => {
    for (const config of [CALENDAR_PERIOD, payday15, { type: 'payday', startDay: 28 } as PeriodConfig, every14]) {
      for (let d = Date.UTC(2026, 0, 1); d < Date.UTC(2028, 0, 1); d += 86_400_000) {
        const date = new Date(d).toISOString().slice(0, 10)
        const start = periodStartFor(config, date)
        expect(start <= date && date <= periodEndFor(config, start)).toBe(true)
        expect(periodStartFor(config, nextPeriodStartFor(config, start))).toBe(nextPeriodStartFor(config, start))
        expect(periodStartFor(config, previousPeriodStartFor(config, date))).toBe(previousPeriodStartFor(config, date))
        expect(periodDayFor(config, date)).toBeLessThanOrEqual(periodLengthFor(config, start))
      }
    }
  })
})

describe('parsePeriodConfig', () => {
  it('accepts each kind and drops extra fields', () => {
    expect(parsePeriodConfig({ type: 'calendar', evil: 1 })).toEqual({ config: { type: 'calendar' } })
    expect(parsePeriodConfig({ type: 'payday', startDay: 15 })).toEqual({ config: payday15 })
    expect(parsePeriodConfig({ type: 'custom', anchor: '2026-01-05', lengthDays: 14, x: 'y' })).toEqual({ config: every14 })
  })

  it('rejects malformed input and invalid values', () => {
    for (const bad of [null, undefined, 'payday', 5, {}, { type: 'weekly' }, { type: 'payday' }, { type: 'payday', startDay: '15' }, { type: 'payday', startDay: 29 }, { type: 'custom', anchor: '2026-01-05' }, { type: 'custom', anchor: '2026-13-40', lengthDays: 14 }, { type: 'custom', anchor: '2026-01-05', lengthDays: 3 }]) {
      expect(parsePeriodConfig(bad)).toHaveProperty('error')
    }
  })
})

describe('PeriodInput shorthand', () => {
  it('treats a bare number as payday N and tells the calendar month apart', () => {
    expect(toPeriodConfig(15)).toEqual({ type: 'payday', startDay: 15 })
    expect(isCalendarMonth(1)).toBe(true)
    expect(isCalendarMonth(CALENDAR_PERIOD)).toBe(true)
    expect(isCalendarMonth(15)).toBe(false)
    expect(isCalendarMonth(every14)).toBe(false)
  })

  it('gives each kind its own key', () => {
    expect(new Set([periodConfigKey(CALENDAR_PERIOD), periodConfigKey(15), periodConfigKey(every14)]).size).toBe(3)
    expect(periodConfigKey(15)).toBe(periodConfigKey(payday15))
  })
})

describe('custom periods', () => {
  it('starts on the anchor and repeats every lengthDays', () => {
    expect(periodStartFor(every14, '2026-01-05')).toBe('2026-01-05')
    expect(periodStartFor(every14, '2026-01-18')).toBe('2026-01-05')
    expect(periodStartFor(every14, '2026-01-19')).toBe('2026-01-19')
    expect(periodEndFor(every14, '2026-01-05')).toBe('2026-01-18')
    expect(periodLengthFor(every14, '2026-01-05')).toBe(14)
  })

  it('also slices dates before the anchor', () => {
    expect(periodStartFor(every14, '2026-01-04')).toBe('2025-12-22')
    expect(previousPeriodStartFor(every14, '2026-01-05')).toBe('2025-12-22')
  })

  it('counts days and days left, today included', () => {
    expect(periodDayFor(every14, '2026-01-05')).toBe(1)
    expect(periodDaysLeftFor(every14, '2026-01-05')).toBe(14)
    expect(periodDaysLeftFor(every14, '2026-01-18')).toBe(1)
  })

  it('works with a 30-day period across a year boundary', () => {
    const every30: PeriodConfig = { type: 'custom', anchor: '2026-12-10', lengthDays: 30 }
    expect(periodStartFor(every30, '2027-01-08')).toBe('2026-12-10')
    expect(periodStartFor(every30, '2027-01-09')).toBe('2027-01-09')
  })
})

describe('periodConfigError / monthlyStartDay', () => {
  it('accepts valid configs', () => {
    expect(periodConfigError(CALENDAR_PERIOD)).toBeNull()
    expect(periodConfigError(payday15)).toBeNull()
    expect(periodConfigError(every14)).toBeNull()
  })

  it('rejects a payday outside 1–28', () => {
    expect(periodConfigError({ type: 'payday', startDay: 0 })).not.toBeNull()
    expect(periodConfigError({ type: 'payday', startDay: 29 })).not.toBeNull()
    expect(periodConfigError({ type: 'payday', startDay: 1.5 })).not.toBeNull()
  })

  it('rejects bad custom anchors and lengths', () => {
    expect(periodConfigError({ type: 'custom', anchor: '2026-02-31', lengthDays: 14 })).not.toBeNull()
    expect(periodConfigError({ type: 'custom', anchor: 'nonsense', lengthDays: 14 })).not.toBeNull()
    expect(periodConfigError({ type: 'custom', anchor: '2026-01-05', lengthDays: 6 })).not.toBeNull()
    expect(periodConfigError({ type: 'custom', anchor: '2026-01-05', lengthDays: 367 })).not.toBeNull()
    expect(periodConfigError({ type: 'custom', anchor: '2026-01-05', lengthDays: 14.5 })).not.toBeNull()
  })

  it('exposes the month start day only for month-based kinds', () => {
    expect(monthlyStartDay(CALENDAR_PERIOD)).toBe(1)
    expect(monthlyStartDay(payday15)).toBe(15)
    expect(monthlyStartDay(every14)).toBeNull()
  })
})
