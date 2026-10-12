import { describe, expect, it } from 'vitest'
import { isNearMinimum, restockQuantity, restockSuggestions, stockOfType, validateStockLevels, type RestockCandidate, type StockLevel } from '@/lib/pantry-restock'
import type { PantryItem } from '@/lib/types'

const level = (over: Partial<StockLevel> = {}): StockLevel => ({ id: 'l1', productTypeKey: 'maslo', typeName: 'Máslo', minQuantity: 2, maxQuantity: 6, unit: 'ks', ...over })
const item = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'i1', name: 'Máslo', category: 'Potraviny', location: 'Lednice', quantity: 1, unit: 'ks', addedAt: '2026-10-01T00:00:00.000Z', productTypeKey: 'maslo', ...over,
})
const candidate = (over: Partial<RestockCandidate> = {}): RestockCandidate => ({
  productId: 'p1', productName: 'Máslo 250 g', productTypeKey: 'maslo', storeId: 's-lidl', chain: 'Lidl', dealPrice: 40, unit: 'kg', unitPrice: 160, regularPrice: 55, validUntil: '2026-10-20', ...over,
})

describe('validateStockLevels', () => {
  it('accepts 0 <= min < max and refuses the rest', () => {
    expect(validateStockLevels(0, 3)).toBeNull()
    expect(validateStockLevels(null, null)).toMatch(/Vyplňte/)
    expect(validateStockLevels(2, null)).toMatch(/Vyplňte/)
    expect(validateStockLevels(-1, 3)).toMatch(/záporné/)
    expect(validateStockLevels(3, 3)).toMatch(/větší/)
    expect(validateStockLevels(Number.NaN, 3)).not.toBeNull()
  })
})

describe('stockOfType', () => {
  it('sums every pantry row of the type, whatever the product', () => {
    const rows = [item({ id: 'a', quantity: 1 }), item({ id: 'b', name: 'Tatra máslo', quantity: 2 }), item({ id: 'c', productTypeKey: 'mleko', quantity: 9 })]
    expect(stockOfType(level(), rows)).toBe(3)
  })
  it('converts units and counts pieces of known size, and leaves out what cannot be told', () => {
    const kgLevel = level({ unit: 'kg', minQuantity: 1, maxQuantity: 3 })
    const rows = [
      item({ id: 'a', unit: 'g', quantity: 500 }),
      item({ id: 'b', unit: 'ks', quantity: 2, unitQuantity: 0.25, unitUnit: 'kg' }),
      item({ id: 'c', unit: 'ks', quantity: 4 }),
    ]
    expect(stockOfType(kgLevel, rows)).toBe(1)
  })
})

describe('isNearMinimum / restockQuantity', () => {
  it('is near from 25 % above the minimum', () => {
    expect(isNearMinimum(level(), 2.5)).toBe(true)
    expect(isNearMinimum(level(), 2.6)).toBe(false)
  })
  it('restocks up to the maximum, in whole pieces for ks', () => {
    expect(restockQuantity(level(), 1)).toBe(5)
    expect(restockQuantity(level(), 1.5)).toBe(5)
    expect(restockQuantity(level({ unit: 'kg', minQuantity: 1, maxQuantity: 3 }), 0.4)).toBe(2.6)
    expect(restockQuantity(level(), 9)).toBe(0)
  })
})

describe('restockSuggestions', () => {
  const chains = new Set(['s-lidl', 's-albert'])

  it('suggests the cheapest interesting promotion of a preferred chain, by unit price', () => {
    const result = restockSuggestions([level()], [item()], [candidate(), candidate({ productId: 'p2', productName: 'Tatra máslo', storeId: 's-albert', chain: 'Albert', dealPrice: 45, unitPrice: 150, regularPrice: 60 })], chains)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ levelId: 'l1', typeName: 'Máslo', quantity: 1, buyQuantity: 5, offer: { chain: 'Albert', productName: 'Tatra máslo' } })
    expect(result[0].offer.discount).toBeCloseTo(0.25)
  })

  it('is about the type, not the product the household usually buys', () => {
    const cheaperOther = candidate({ productId: 'other', productName: 'Jiné máslo', unitPrice: 120, dealPrice: 30, regularPrice: 50 })
    expect(restockSuggestions([level()], [item({ productId: 'usual' })], [candidate({ productId: 'usual' }), cheaperOther], null)[0].offer.productId).toBe('other')
  })

  it('ignores chains that are not preferred, weak discounts, other types and types that are not low', () => {
    expect(restockSuggestions([level()], [item()], [candidate({ storeId: 's-penny', chain: 'Penny' })], chains)).toEqual([])
    expect(restockSuggestions([level()], [item()], [candidate({ dealPrice: 52 })], chains)).toEqual([])
    expect(restockSuggestions([level()], [item()], [candidate({ productTypeKey: 'mleko' })], chains)).toEqual([])
    expect(restockSuggestions([level()], [item({ quantity: 5 })], [candidate()], chains)).toEqual([])
  })

  it('keeps an offers-only promotion without inventing a discount', () => {
    expect(restockSuggestions([level()], [item()], [candidate({ regularPrice: null })], null)[0].offer.discount).toBeNull()
  })

  it('lists the most depleted type first', () => {
    const butter = level()
    const milk = level({ id: 'l2', productTypeKey: 'mleko', typeName: 'Mléko' })
    const rows = [item({ quantity: 0 }), item({ id: 'm', productTypeKey: 'mleko', quantity: 2 })]
    expect(restockSuggestions([milk, butter], rows, [candidate(), candidate({ productTypeKey: 'mleko', productId: 'pm' })], null).map((s) => s.typeName)).toEqual(['Máslo', 'Mléko'])
  })
})
