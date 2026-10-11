import { describe, expect, it } from 'vitest'
import { isNearMinimum, restockQuantity, restockSuggestions, validateStockLevels, type RestockCandidate } from '@/lib/pantry-restock'
import type { PantryItem } from '@/lib/types'

const item = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'i1', name: 'Máslo', category: 'Potraviny', location: 'Lednice', quantity: 1, unit: 'ks', addedAt: '2026-10-01T00:00:00.000Z',
  productTypeKey: 'maslo', minQuantity: 2, maxQuantity: 6, ...over,
})
const candidate = (over: Partial<RestockCandidate> = {}): RestockCandidate => ({
  productId: 'p1', productName: 'Máslo 250 g', productTypeKey: 'maslo', storeId: 's-lidl', chain: 'Lidl', dealPrice: 40, unit: 'kg', unitPrice: 160, regularPrice: 55, validUntil: '2026-10-20', ...over,
})

describe('validateStockLevels', () => {
  it('accepts both empty or 0 <= min < max and refuses the rest', () => {
    expect(validateStockLevels(null, null)).toBeNull()
    expect(validateStockLevels(0, 3)).toBeNull()
    expect(validateStockLevels(2, null)).toMatch(/obojí/)
    expect(validateStockLevels(-1, 3)).toMatch(/záporné/)
    expect(validateStockLevels(3, 3)).toMatch(/větší/)
    expect(validateStockLevels(Number.NaN, 3)).not.toBeNull()
  })
})

describe('isNearMinimum / restockQuantity', () => {
  it('is near from 25 % above the minimum, never without levels or when not tracked', () => {
    expect(isNearMinimum(item({ quantity: 2.5 }))).toBe(true)
    expect(isNearMinimum(item({ quantity: 2.6 }))).toBe(false)
    expect(isNearMinimum(item({ minQuantity: null, maxQuantity: null, quantity: 0 }))).toBe(false)
    expect(isNearMinimum(item({ quantity: 0, tracking: 'off' }))).toBe(false)
  })
  it('restocks up to the maximum, in whole pieces for ks', () => {
    expect(restockQuantity(item({ quantity: 1 }))).toBe(5)
    expect(restockQuantity(item({ quantity: 1.5 }))).toBe(5)
    expect(restockQuantity(item({ unit: 'kg', quantity: 0.4, minQuantity: 1, maxQuantity: 3 }))).toBe(2.6)
    expect(restockQuantity(item({ quantity: 9 }))).toBe(0)
  })
})

describe('restockSuggestions', () => {
  const chains = new Set(['s-lidl', 's-albert'])

  it('suggests the cheapest interesting promotion of a preferred chain, by unit price', () => {
    const result = restockSuggestions([item()], [candidate(), candidate({ storeId: 's-albert', chain: 'Albert', dealPrice: 45, unitPrice: 150, regularPrice: 60 })], chains)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ itemId: 'i1', buyQuantity: 5, offer: { chain: 'Albert' } })
    expect(result[0].offer.discount).toBeCloseTo(0.25)
  })

  it('ignores chains that are not preferred, weak discounts and rows that are not low', () => {
    expect(restockSuggestions([item()], [candidate({ storeId: 's-penny', chain: 'Penny' })], chains)).toEqual([])
    expect(restockSuggestions([item()], [candidate({ dealPrice: 52 })], chains)).toEqual([])
    expect(restockSuggestions([item({ quantity: 5 })], [candidate()], chains)).toEqual([])
  })

  it('keeps an offers-only promotion without inventing a discount, and matches a concrete product', () => {
    const offer = candidate({ regularPrice: null, productTypeKey: null, productId: 'pX' })
    expect(restockSuggestions([item({ productTypeKey: null, productId: 'pX' })], [offer], null)[0].offer.discount).toBeNull()
    expect(restockSuggestions([item({ productTypeKey: null })], [offer], null)).toEqual([])
  })

  it('lists the most depleted row first', () => {
    const low = item({ id: 'a', name: 'Rýže', quantity: 2 })
    const empty = item({ id: 'b', name: 'Máslo', quantity: 0 })
    expect(restockSuggestions([low, empty], [candidate()], null).map((s) => s.itemId)).toEqual(['b', 'a'])
  })
})
