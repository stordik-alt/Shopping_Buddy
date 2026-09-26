import { describe, expect, it } from 'vitest'
import { formatDecimalInput, parseDecimalInput } from '@/lib/decimal-input'

describe('parseDecimalInput', () => {
  it('reads a decimal comma or point, and thousands spaces', () => {
    expect(parseDecimalInput('0,5')).toBe(0.5)
    expect(parseDecimalInput('0.5')).toBe(0.5)
    expect(parseDecimalInput(',5')).toBe(0.5)
    expect(parseDecimalInput(' 12 ')).toBe(12)
    expect(parseDecimalInput('1 250,75')).toBe(1250.75)
  })

  it('is null while the text is not a number yet — the field keeps it instead of snapping back', () => {
    // Regression 2026-09-26: clearing the quantity to type "0,5" put 1 back at once.
    expect(parseDecimalInput('')).toBeNull()
    expect(parseDecimalInput('0,')).toBeNull()
    expect(parseDecimalInput(',')).toBeNull()
    expect(parseDecimalInput('1,2,3')).toBeNull()
    expect(parseDecimalInput('-1')).toBeNull()
    expect(parseDecimalInput('abc')).toBeNull()
  })

  it('limits the decimal places', () => {
    expect(parseDecimalInput('0,125')).toBe(0.125)
    expect(parseDecimalInput('0,1255')).toBeNull()
    expect(parseDecimalInput('12,999', 2)).toBeNull()
    expect(parseDecimalInput('12,99', 2)).toBe(12.99)
  })
})

describe('formatDecimalInput', () => {
  it('shows a decimal comma without trailing zeros', () => {
    expect(formatDecimalInput(0.5)).toBe('0,5')
    expect(formatDecimalInput(12)).toBe('12')
    expect(formatDecimalInput(1.25)).toBe('1,25')
    expect(formatDecimalInput(0.1 + 0.2)).toBe('0,3')
  })
})
