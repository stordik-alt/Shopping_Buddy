import { describe, expect, it } from 'vitest'
import { validatePlannedCarry } from '@/lib/planned-carry-input'

const current = '2026-10-01'

describe('validatePlannedCarry', () => {
  it('accepts an amount for the running or a later period, rounded to haléře', () => {
    expect(validatePlannedCarry({ periodStart: '2026-10-01', amount: 2000 }, current)).toEqual({ periodStart: '2026-10-01', amount: 2000 })
    expect(validatePlannedCarry({ periodStart: '2026-12-01', amount: 10.456 }, current)).toEqual({ periodStart: '2026-12-01', amount: 10.46 })
  })

  it('treats blank and zero as removing the plan', () => {
    expect(validatePlannedCarry({ periodStart: current, amount: null }, current)).toEqual({ periodStart: current, amount: null })
    expect(validatePlannedCarry({ periodStart: current, amount: 0 }, current)).toEqual({ periodStart: current, amount: null })
  })

  it('refuses negative or absurd amounts', () => {
    expect('error' in validatePlannedCarry({ periodStart: current, amount: -1 }, current)).toBe(true)
    expect('error' in validatePlannedCarry({ periodStart: current, amount: Number.NaN }, current)).toBe(true)
    expect('error' in validatePlannedCarry({ periodStart: current, amount: 1e12 }, current)).toBe(true)
  })

  it('refuses a period that has ended and a malformed date', () => {
    expect('error' in validatePlannedCarry({ periodStart: '2026-09-01', amount: 100 }, current)).toBe(true)
    expect('error' in validatePlannedCarry({ periodStart: 'x', amount: 100 }, current)).toBe(true)
  })
})
