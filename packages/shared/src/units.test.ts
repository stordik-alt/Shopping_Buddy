import { describe, expect, it } from 'vitest'
import { ITEM_UNITS, unitLabel } from './units'

describe('shared item units', () => {
  it('keeps the existing unit choices', () => {
    expect(ITEM_UNITS).toEqual(['ks', 'kg', 'g', 'l', 'ml', 'dávka'])
  })

  it('keeps the existing Czech dose labels', () => {
    expect([0, 1, 2, 3, 4, 5, 1.5, -1].map((quantity) => unitLabel(quantity, 'dávka')))
      .toEqual(['dávek', 'dávka', 'dávky', 'dávky', 'dávky', 'dávek', 'dávek', 'dávek'])
    expect(unitLabel(3, 'ks')).toBe('ks')
  })
})
