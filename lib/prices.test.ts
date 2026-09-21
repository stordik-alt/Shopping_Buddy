import { describe, expect, it } from 'vitest'
import { activeDeals, comparePrices, effectivePrice, isDealActive, type PricePoint, type ProductPrice } from '@/lib/prices'

const price = (overrides: Partial<PricePoint> = {}): PricePoint => ({
  store: 'Lidl',
  regularPrice: 100,
  unit: 'ks',
  unitPrice: 100,
  recordedAt: '2026-09-19',
  ...overrides,
})

describe('effectivePrice', () => {
  it('prefers the deal price when one is set', () => {
    expect(effectivePrice(price({ regularPrice: 100, dealPrice: 80 }))).toBe(80)
  })

  it('falls back to the regular price with no deal', () => {
    expect(effectivePrice(price({ regularPrice: 100 }))).toBe(100)
  })
})

describe('isDealActive', () => {
  it('is false with no deal price at all', () => {
    expect(isDealActive(price(), '2026-09-19')).toBe(false)
  })

  it('is true for a deal with no expiry set', () => {
    expect(isDealActive(price({ dealPrice: 80 }), '2026-09-19')).toBe(true)
  })

  it('is true on the last valid day and false the day after — a promotion is not a good deal once it has actually expired', () => {
    const deal = price({ dealPrice: 80, dealValidUntil: '2026-09-26' })
    expect(isDealActive(deal, '2026-09-26')).toBe(true)
    expect(isDealActive(deal, '2026-09-27')).toBe(false)
  })
})

describe('comparePrices', () => {
  const products: ProductPrice[] = [
    {
      productName: 'Mléko',
      category: 'Potraviny',
      prices: [price({ store: 'Albert', regularPrice: 50 }), price({ store: 'Lidl', regularPrice: 40, dealPrice: 30 }), price({ store: 'Billa', regularPrice: 45 })],
    },
  ]

  it('returns null for a product with no price data, rather than a misleading empty comparison', () => {
    expect(comparePrices(products, 'Nonexistent')).toBeNull()
  })

  it('sorts stores by effective (deal-aware) price, cheapest first', () => {
    const result = comparePrices(products, 'Mléko')
    expect(result?.prices.map((p) => p.store)).toEqual(['Lidl', 'Billa', 'Albert'])
  })
})

describe('activeDeals', () => {
  const products: ProductPrice[] = [
    {
      productName: 'A',
      category: 'Potraviny',
      prices: [price({ store: 'Lidl', dealPrice: 10, dealValidUntil: '2026-09-30' }), price({ store: 'Albert' })],
    },
    { productName: 'B', category: 'Potraviny', prices: [price({ store: 'Billa', dealPrice: 5, dealValidUntil: '2026-08-01' })] },
  ]

  it('only includes prices with a currently valid deal, across all products', () => {
    const deals = activeDeals(products, '2026-09-19')
    expect(deals).toHaveLength(1)
    expect(deals[0].product.productName).toBe('A')
    expect(deals[0].price.store).toBe('Lidl')
  })

  it('excludes an expired deal even though it still has a dealPrice set', () => {
    const deals = activeDeals(products, '2026-09-19')
    expect(deals.some((d) => d.product.productName === 'B')).toBe(false)
  })
})
