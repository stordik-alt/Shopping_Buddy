import { describe, expect, it } from 'vitest'
import { validateIncomeInput, validateReceivedDate } from '@/lib/income-input'

const TODAY = '2026-10-10'
const base = { amount: 38_000, description: ' Výplata ', date: '2026-10-10', status: 'actual' }

describe('validateIncomeInput', () => {
  it('accepts a received income and trims/rounds it', () => {
    expect(validateIncomeInput({ ...base, amount: 100.456 }, TODAY)).toEqual({
      income: { amount: 100.46, description: 'Výplata', date: '2026-10-10', status: 'actual' },
    })
  })

  it('allows a planned income in the future', () => {
    expect('income' in validateIncomeInput({ ...base, status: 'planned', date: '2026-11-15' }, TODAY)).toBe(true)
  })

  it('rejects a received income dated in the future', () => {
    expect(validateIncomeInput({ ...base, date: '2026-11-15' }, TODAY)).toHaveProperty('error')
  })

  it('rejects non-positive, non-finite and too large amounts', () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 100_000_000]) {
      expect(validateIncomeInput({ ...base, amount }, TODAY)).toHaveProperty('error')
    }
  })

  it('rejects an unknown status and impossible or ancient dates', () => {
    expect(validateIncomeInput({ ...base, status: 'maybe' }, TODAY)).toHaveProperty('error')
    expect(validateIncomeInput({ ...base, date: '2026-02-31' }, TODAY)).toHaveProperty('error')
    expect(validateIncomeInput({ ...base, date: '1999-12-31' }, TODAY)).toHaveProperty('error')
  })
})

describe('validateReceivedDate', () => {
  it('accepts today and the past, rejects the future and bad dates', () => {
    expect(validateReceivedDate('2026-10-10', TODAY)).toBeNull()
    expect(validateReceivedDate('2026-10-09', TODAY)).toBeNull()
    expect(validateReceivedDate('2026-10-11', TODAY)).not.toBeNull()
    expect(validateReceivedDate('nonsense', TODAY)).not.toBeNull()
  })
})
