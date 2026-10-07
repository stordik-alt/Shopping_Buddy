import { describe, expect, it } from 'vitest'
import { resolveInventoryPackage } from '@/lib/inventory-packaging'

describe('resolveInventoryPackage', () => {
  it('expands a count multipack such as 30 eggs to individual pieces', () => {
    expect(resolveInventoryPackage('Vejce z podestýlky 30 ks', [{
      quantity: 30,
      unit: 'ks',
      packageCount: 30,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    }])).toMatchObject({
      packageCount: 30,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    })
  })

  it('keeps the inner bottle size for a volume multipack', () => {
    expect(resolveInventoryPackage('Veseta perlivá voda 6x1,5l', [{
      quantity: 9,
      unit: 'l',
      packageCount: 6,
      packageUnitQuantity: 1.5,
      packageUnit: 'l',
    }])).toMatchObject({
      packageCount: 6,
      packageUnitQuantity: 1.5,
      packageUnit: 'l',
    })
  })

  it('supports named 3-piece and 4-piece multipacks', () => {
    expect(resolveInventoryPackage('Sedlčanský Hermelín na gril 3 ks', [{
      quantity: 3,
      unit: 'ks',
      packageCount: 3,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    }])?.packageCount).toBe(3)

    expect(resolveInventoryPackage('Sedlčanský Hermelín na gril 4 ks', [{
      quantity: 4,
      unit: 'ks',
      packageCount: 4,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    }])?.packageCount).toBe(4)
  })

  it('does not guess when multiple package variants could match', () => {
    expect(resolveInventoryPackage('Tyčinky 6 ks', [
      { quantity: 6, unit: 'ks', packageCount: 6, packageUnitQuantity: 1, packageUnit: 'ks' },
      { quantity: 6, unit: 'ks', packageCount: 12, packageUnitQuantity: 1, packageUnit: 'ks' },
    ])).toBeNull()
  })
})
