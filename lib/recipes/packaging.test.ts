import { describe, expect, it } from 'vitest'
import { extractExplicitPackageSizes, formatPackageSize, inferPackageSize, resolveCatalogPackageSize, resolveNamedPackageSize } from '@/lib/recipes/packaging'
import type { PricePoint } from '@/lib/prices'

const price = (regularPrice: number, unitPrice: number, unit: PricePoint['unit'] = 'kg'): PricePoint => ({
  store: 'Lidl',
  regularPrice,
  unitPrice,
  unit,
  recordedAt: '2026-10-01',
})

describe('recipe package standardization', () => {
  it('derives a 1 kg package from package price and unit price', () => {
    expect(inferPackageSize(price(60, 60))).toEqual({
      quantity: 1,
      unit: 'kg',
      label: '1 kg',
      source: 'derived-from-price',
    })
  })

  it('derives a 500 g package from a kg unit price', () => {
    expect(inferPackageSize(price(30, 60))).toMatchObject({
      quantity: 0.5,
      unit: 'kg',
      label: '500 g',
    })
  })

  it('derives a 750 ml package from a litre unit price', () => {
    expect(inferPackageSize(price(90, 120, 'l'))).toMatchObject({
      quantity: 0.75,
      unit: 'l',
      label: '750 ml',
    })
  })

  it('keeps count-based products as one piece/package', () => {
    expect(inferPackageSize(price(49.9, 4.99, 'ks'))).toMatchObject({
      quantity: 1,
      unit: 'ks',
      label: '1 ks',
    })
  })

  it('prefers a matching persistent package over the derived runtime value', () => {
    expect(resolveCatalogPackageSize(
      [{ quantity: 0.25, unit: 'kg' }],
      price(39.9, 159.6, 'kg'),
    )).toMatchObject({
      quantity: 0.25,
      unit: 'kg',
      label: '250 g',
      source: 'catalog',
    })
  })

  it('does not choose a different catalog size when the current price does not match it', () => {
    expect(resolveCatalogPackageSize(
      [{ quantity: 0.5, unit: 'kg' }],
      price(39.9, 159.6, 'kg'),
    )).toBeNull()
  })

  it('extracts a multipack size from a product name', () => {
    expect(extractExplicitPackageSizes('Actimel Kids 8x 100 g')).toEqual([
      {
        quantity: 0.8,
        unit: 'kg',
        label: '800 g',
        source: 'name-extracted',
      },
    ])
  })

  it('uses an explicit piece count for a ks-priced multipack', () => {
    expect(resolveNamedPackageSize('Papírové kapesníky 10 ks', {
      regularPrice: 39.9,
      unit: 'ks',
      unitPrice: 3.99,
    })).toMatchObject({
      quantity: 10,
      unit: 'ks',
      label: '10 ks',
      source: 'name-extracted',
    })
  })

  it('accepts explicit weight when price rounding stays within tolerance', () => {
    expect(resolveNamedPackageSize('Máslo 250 g', {
      regularPrice: 39.9,
      unit: 'kg',
      unitPrice: 160,
    })).toMatchObject({
      quantity: 0.25,
      unit: 'kg',
      label: '250 g',
      source: 'name-extracted',
    })
  })

  it('rejects an explicit weight when it conflicts with the current price ratio', () => {
    expect(resolveNamedPackageSize('Máslo 250 g', {
      regularPrice: 39.9,
      unit: 'kg',
      unitPrice: 80,
    })).toBeNull()
  })

  it('formats canonical package labels', () => {
    expect(formatPackageSize(0.25, 'kg')).toBe('250 g')
    expect(formatPackageSize(1, 'l')).toBe('1 l')
  })
})
