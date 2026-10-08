import { describe, expect, it } from 'vitest'
import { convertQuantity, normalizePackage, normalizeQuantity } from './quantity-normalization'

describe('universal quantity normalization', () => {
  it('normalizes metric mass and volume', () => {
    expect(normalizeQuantity(500, 'g')).toMatchObject({ quantity: 0.5, unit: 'kg', dimension: 'mass', confidence: 1 })
    expect(normalizeQuantity(750, 'ml')).toMatchObject({ quantity: 0.75, unit: 'l', dimension: 'volume', confidence: 1 })
  })
  it('normalizes length and area for non-food goods', () => {
    expect(normalizeQuantity(25, 'cm')).toMatchObject({ quantity: 0.25, unit: 'm', dimension: 'length' })
    expect(normalizeQuantity(10000, 'cm2')).toMatchObject({ quantity: 1, unit: 'm2', dimension: 'area' })
  })
  it('rejects cross-dimension conversions', () => { expect(convertQuantity(1, 'kg', 'l')).toBeNull(); expect(convertQuantity(1, 'm', 'ks')).toBeNull() })
  it('verifies declared multipack without multiplying the total again', () => {
    expect(normalizePackage({ quantity: 1, unit: 'kg', packageCount: 2, packageUnitQuantity: 500, packageUnit: 'g' })).toMatchObject({ quantity: 1, unit: 'kg', method: 'declared_multipack', confidence: 1, packageVerified: true })
  })
  it('rejects inconsistent multipack metadata instead of guessing', () => {
    expect(normalizePackage({ quantity: 1, unit: 'kg', packageCount: 2, packageUnitQuantity: 400, packageUnit: 'g' })).toMatchObject({ quantity: 1, unit: 'kg', method: 'unknown', confidence: 0, packageVerified: false })
  })
  it('does not invent contents from a package type', () => { expect(normalizePackage({ quantity: 1, unit: 'ks' })).toMatchObject({ quantity: 1, unit: 'ks', method: 'direct_unit', packageVerified: false }) })
})