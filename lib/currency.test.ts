import { describe, expect, it } from 'vitest'
import { normalizeCurrency } from '@/lib/currency'

describe('normalizeCurrency', () => {
  it('turns what a Czech receipt prints into CZK', () => {
    for (const printed of ['Kč', 'KČ', 'kč', 'Kc', 'KC', 'Kč.', ' Kč ', 'K č', 'czk', 'CZK', 'Czk']) expect(normalizeCurrency(printed), printed).toBe('CZK')
  })
  it('accepts a three-letter code in any case and a few common signs', () => {
    expect(normalizeCurrency('eur')).toBe('EUR')
    expect(normalizeCurrency('€')).toBe('EUR')
    expect(normalizeCurrency('$')).toBe('USD')
    expect(normalizeCurrency('zł')).toBe('PLN')
  })
  it('does not guess: empty, unknown or non-text becomes null', () => {
    for (const value of [null, undefined, '', '   ', 'korun', 'CZ', 'CZKK', 'K', 42, {}]) expect(normalizeCurrency(value), String(value)).toBeNull()
  })
  it('composes a decomposed č (c + combining caron) the same as the precomposed one', () => {
    expect(normalizeCurrency('Kč')).toBe('CZK')
  })
})
