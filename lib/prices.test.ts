import { describe, expect, it } from 'vitest'
import {
  activeDeals,
  assessDealQuality,
  cheapestPossibleTotal,
  compareStoreTotals,
  comparePrices,
  effectivePrice,
  isDealActive,
  isHistoricLow,
  type PricePoint,
  type ProductPrice,
  type ShoppingListItemForPricing,
} from '@/lib/prices'

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

describe('isHistoricLow', () => {
  it('is false with no recorded history to compare against', () => {
    expect(isHistoricLow(price({ regularPrice: 40 }))).toBe(false)
  })

  it('is true when the current effective price matches or beats every prior observation', () => {
    const current = price({
      regularPrice: 30,
      dealPrice: 25,
      recordedAt: '2026-09-19',
      priceHistory: [
        { price: 40, recordedAt: '2026-08-01' },
        { price: 35, recordedAt: '2026-09-01' },
      ],
    })
    expect(isHistoricLow(current)).toBe(true)
  })

  it('is false when a prior observation was cheaper', () => {
    const current = price({
      regularPrice: 40,
      recordedAt: '2026-09-19',
      priceHistory: [
        { price: 40, recordedAt: '2026-08-01' },
        { price: 25, recordedAt: '2026-09-01' },
      ],
    })
    expect(isHistoricLow(current)).toBe(false)
  })

  it('ignores observations recorded on or after the current one, so it never compares against itself', () => {
    const current = price({ regularPrice: 40, recordedAt: '2026-09-19', priceHistory: [{ price: 40, recordedAt: '2026-09-19' }] })
    expect(isHistoricLow(current)).toBe(false)
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

describe('assessDealQuality', () => {
  it('flags a deal as not the best price when another store is cheaper even without any deal at all', () => {
    const products: ProductPrice[] = [
      {
        productName: 'A',
        category: 'Potraviny',
        prices: [price({ store: 'Lidl', regularPrice: 60, dealPrice: 30, dealValidUntil: '2026-09-30' }), price({ store: 'Albert', regularPrice: 25 })],
      },
    ]
    const [assessment] = assessDealQuality(products, '2026-09-19')
    expect(assessment.isBestPrice).toBe(false)
    expect(assessment.cheapestAlternative).toEqual({ store: 'Albert', price: 25 })
  })

  it('confirms a deal as the best price when no other store beats it', () => {
    const products: ProductPrice[] = [
      {
        productName: 'B',
        category: 'Potraviny',
        prices: [price({ store: 'Lidl', regularPrice: 40, dealPrice: 20, dealValidUntil: '2026-09-30' }), price({ store: 'Albert', regularPrice: 40 })],
      },
    ]
    const [assessment] = assessDealQuality(products, '2026-09-19')
    expect(assessment.isBestPrice).toBe(true)
    expect(assessment.cheapestAlternative).toBeNull()
  })

  it('treats a tie with another store\'s price as still being the best price', () => {
    const products: ProductPrice[] = [
      {
        productName: 'C',
        category: 'Potraviny',
        prices: [price({ store: 'Lidl', regularPrice: 30, dealPrice: 15, dealValidUntil: '2026-09-30' }), price({ store: 'Billa', regularPrice: 30, dealPrice: 15, dealValidUntil: '2026-09-30' })],
      },
    ]
    const assessments = assessDealQuality(products, '2026-09-19')
    expect(assessments.every((a) => a.isBestPrice)).toBe(true)
  })

  it('only assesses currently active deals, same as activeDeals', () => {
    const products: ProductPrice[] = [
      { productName: 'D', category: 'Potraviny', prices: [price({ store: 'Lidl', dealPrice: 5, dealValidUntil: '2026-08-01' }), price({ store: 'Albert' })] },
    ]
    expect(assessDealQuality(products, '2026-09-19')).toHaveLength(0)
  })

  it('flags a deal that is also a genuine historic low', () => {
    const products: ProductPrice[] = [
      {
        productName: 'E',
        category: 'Potraviny',
        prices: [
          price({
            store: 'Lidl',
            regularPrice: 40,
            dealPrice: 20,
            dealValidUntil: '2026-09-30',
            priceHistory: [{ price: 30, recordedAt: '2026-08-01' }],
          }),
        ],
      },
    ]
    const [assessment] = assessDealQuality(products, '2026-09-19')
    expect(assessment.isHistoricLow).toBe(true)
  })
})

const item = (overrides: Partial<ShoppingListItemForPricing> = {}): ShoppingListItemForPricing => ({
  name: 'Mléko',
  price: 999, // deliberately implausible so tests fail loudly if a catalog price is wrongly ignored in favor of this fallback
  quantity: 1,
  done: false,
  ...overrides,
})

describe('compareStoreTotals', () => {
  const products: ProductPrice[] = [
    { productName: 'Mléko', category: 'Potraviny', prices: [price({ store: 'Lidl', regularPrice: 40, dealPrice: 30 }), price({ store: 'Albert', regularPrice: 50 })] },
    { productName: 'Chleba', category: 'Potraviny', prices: [price({ store: 'Albert', regularPrice: 20 })] },
  ]
  const items = [
    item({ name: 'Mléko', quantity: 2 }),
    item({ name: 'Chleba', price: 25, quantity: 1 }),
    item({ name: 'Nezname zbozi', price: 15, quantity: 1 }), // no catalog entry at all
    item({ name: 'Mléko', quantity: 99, done: true }), // must be excluded entirely
  ]

  it('sorts candidate stores by total, cheapest first', () => {
    const totals = compareStoreTotals(items, products)
    expect(totals.map((t) => t.store)).toEqual(['Lidl', 'Albert'])
  })

  it('uses the real catalog price where available and the item\'s own price as a fallback where not, per store', () => {
    const totals = compareStoreTotals(items, products)
    const lidl = totals.find((t) => t.store === 'Lidl')!
    // Mléko via catalog deal price (30*2=60) + Chleba unavailable at Lidl, falls back to 25*1 + unknown item falls back to 15*1
    expect(lidl.total).toBe(60 + 25 + 15)
    expect(lidl.itemsPriced).toBe(1)
    expect(lidl.itemsFallback).toBe(2)

    const albert = totals.find((t) => t.store === 'Albert')!
    // Mléko (50*2=100) + Chleba (20*1=20) both via catalog, unknown item still falls back (15*1)
    expect(albert.total).toBe(100 + 20 + 15)
    expect(albert.itemsPriced).toBe(2)
    expect(albert.itemsFallback).toBe(1)
  })

  it('ignores done items entirely', () => {
    const withoutDone = compareStoreTotals(items.filter((i) => !i.done), products)
    const withDone = compareStoreTotals(items, products)
    expect(withDone).toEqual(withoutDone)
  })

  it('returns no candidate stores when there is no catalog price data at all', () => {
    expect(compareStoreTotals(items, [])).toEqual([])
  })
})

describe('cheapestPossibleTotal', () => {
  const products: ProductPrice[] = [
    { productName: 'Mléko', category: 'Potraviny', prices: [price({ store: 'Lidl', regularPrice: 40, dealPrice: 30 }), price({ store: 'Albert', regularPrice: 50 })] },
    { productName: 'Chleba', category: 'Potraviny', prices: [price({ store: 'Albert', regularPrice: 20 })] },
  ]
  const items = [item({ name: 'Mléko', quantity: 2 }), item({ name: 'Chleba', price: 25, quantity: 1 }), item({ name: 'Nezname zbozi', price: 15, quantity: 1 })]

  it('picks the cheapest known store per item, ignoring the single-trip constraint', () => {
    // Mléko: min(30, 50) * 2 = 60; Chleba: 20 * 1 = 20 (its only known price); unknown item falls back to 15 * 1
    expect(cheapestPossibleTotal(items, products)).toBe(60 + 20 + 15)
  })

  it('is never more than the cheapest single-store total, since it is a theoretical floor', () => {
    const totals = compareStoreTotals(items, products)
    expect(cheapestPossibleTotal(items, products)).toBeLessThanOrEqual(totals[0].total)
  })
})
