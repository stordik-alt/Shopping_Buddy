import { describe, expect, it } from 'vitest'
import {
  activeDeals,
  assessDealQuality,
  cheapestPossibleTotal,
  compareStoreTotals,
  comparePrices,
  dealDiscount,
  dealSaving,
  bestDealByName,
  dealEffectiveUnitPrice,
  dealsForList,
  effectivePrice,
  isDealActive,
  previousPrice,
  RECENT_LOW_WINDOW_DAYS,
  recentPriceLow,
  suggestsStockingUp,
  type DealAssessment,
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

describe('recentPriceLow', () => {
  const today = '2026-09-19'

  it('is null with no recorded observation in the window to compare against', () => {
    expect(recentPriceLow(price({ regularPrice: 40 }), today)).toBeNull()
  })

  it('ignores an observation older than the window, even if it would otherwise be relevant', () => {
    const current = price({ regularPrice: 40, priceHistory: [{ price: 25, recordedAt: '2026-08-01' }] }) // 49 days before "today"
    expect(recentPriceLow(current, today)).toBeNull()
  })

  it("'unchanged': every observation in the window costs the same as today", () => {
    const current = price({ regularPrice: 40, priceHistory: [{ price: 40, recordedAt: '2026-09-05' }, { price: 40, recordedAt: '2026-09-12' }] })
    expect(recentPriceLow(current, today)).toEqual({ low: 40, status: 'unchanged' })
  })

  it("'at-low': today's (deal) price is the window's lowest, and the price did change within it", () => {
    const current = price({ regularPrice: 30, dealPrice: 25, priceHistory: [{ price: 40, recordedAt: '2026-09-01' }, { price: 30, recordedAt: '2026-09-10' }] })
    expect(recentPriceLow(current, today)).toEqual({ low: 25, status: 'at-low' })
  })

  it("'above-low': a cheaper price was recorded within the window than today's", () => {
    const current = price({ regularPrice: 89.9, priceHistory: [{ price: 84.9, recordedAt: '2026-09-05' }] })
    expect(recentPriceLow(current, today)).toEqual({ low: 84.9, status: 'above-low' })
  })

  it('includes an observation on the window boundary and on "today" itself', () => {
    const boundary = new Date(Date.parse(`${today}T00:00:00Z`) - RECENT_LOW_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
    const current = price({ regularPrice: 40, priceHistory: [{ price: 20, recordedAt: boundary }, { price: 40, recordedAt: today }] })
    expect(recentPriceLow(current, today)).toEqual({ low: 20, status: 'above-low' })
  })
})

describe('previousPrice', () => {
  it('is null when the price has never changed, however often it was observed', () => {
    const current = price({
      regularPrice: 50,
      recordedAt: '2026-09-24',
      priceHistory: [
        { price: 50, recordedAt: '2026-09-22' },
        { price: 50, recordedAt: '2026-09-23' },
        { price: 50, recordedAt: '2026-09-24' },
      ],
    })
    expect(previousPrice(current)).toBeNull()
  })

  it('is null without any history', () => {
    expect(previousPrice(price())).toBeNull()
  })

  it('returns the old price with the date it was seen and the date it ended', () => {
    const current = price({
      regularPrice: 45,
      recordedAt: '2026-09-24',
      priceHistory: [
        { price: 50, recordedAt: '2026-09-20', validUntil: '2026-09-24' },
        { price: 45, recordedAt: '2026-09-24', validUntil: null },
      ],
    })
    expect(previousPrice(current)).toEqual({ price: 50, recordedAt: '2026-09-20', validUntil: '2026-09-24' })
  })

  it('returns the price before the LAST change, skipping repeated observations of an old price', () => {
    const current = price({
      regularPrice: 45,
      recordedAt: '2026-09-24',
      priceHistory: [
        { price: 60, recordedAt: '2026-09-10', validUntil: '2026-09-15' },
        { price: 50, recordedAt: '2026-09-15', validUntil: '2026-09-24' },
        { price: 50, recordedAt: '2026-09-20' },
        { price: 45, recordedAt: '2026-09-24' },
      ],
    })
    // The most recent old observation is the second 50 (20 Sep); the change is what matters.
    expect(previousPrice(current)).toMatchObject({ price: 50, recordedAt: '2026-09-20' })
  })

  it('ignores observations on or after the current date and reports no end date when none is known', () => {
    const current = price({
      regularPrice: 45,
      recordedAt: '2026-09-24',
      priceHistory: [
        { price: 50, recordedAt: '2026-09-20' },
        { price: 99, recordedAt: '2026-09-25' },
      ],
    })
    expect(previousPrice(current)).toEqual({ price: 50, recordedAt: '2026-09-20', validUntil: null })
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

  it('includes the last 30 days\' lowest recorded price alongside the deal', () => {
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
            priceHistory: [{ price: 30, recordedAt: '2026-09-05' }],
          }),
        ],
      },
    ]
    const [assessment] = assessDealQuality(products, '2026-09-19')
    expect(assessment.recentLow).toEqual({ low: 20, status: 'at-low' })
  })
})

const dealAssessment = (overrides: Partial<DealAssessment> = {}): DealAssessment => ({
  product: { productName: 'Rýže', category: 'Potraviny', prices: [] },
  price: price(),
  isBestPrice: true,
  cheapestAlternative: null,
  recentLow: null,
  ...overrides,
})

describe('suggestsStockingUp', () => {
  it('suggests stocking up on a best-price deal when the household has none in stock', () => {
    expect(suggestsStockingUp(dealAssessment({ isBestPrice: true }), 0, true)).toBe(true)
  })

  it('still suggests it when down to the last one', () => {
    expect(suggestsStockingUp(dealAssessment({ isBestPrice: true }), 1, true)).toBe(true)
  })

  it('does not suggest it once the household already has a couple on hand — not price alone', () => {
    expect(suggestsStockingUp(dealAssessment({ isBestPrice: true }), 2, true)).toBe(false)
  })

  it('does not suggest it for a product the household does not keep at all (never in the pantry, never bought)', () => {
    expect(suggestsStockingUp(dealAssessment({ isBestPrice: true }), 0, false)).toBe(false)
  })

  it('does not suggest it for a deal that is not actually the best price, no matter how low stock is', () => {
    expect(suggestsStockingUp(dealAssessment({ isBestPrice: false }), 0, true)).toBe(false)
  })
})

const item = (overrides: Partial<ShoppingListItemForPricing> = {}): ShoppingListItemForPricing => ({
  name: 'Mléko',
  price: 999, // deliberately implausible so tests fail loudly if a catalog price is wrongly ignored in favor of this fallback
  quantity: 1,
  unit: 'ks',
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
    // Mléko: 2 ks at the catalog deal price = 30*2 = 60; Chleba and unknown item use the per-unit fallback.
    expect(lidl.total).toBe(60 + 25 + 15)
    expect(lidl.itemsPriced).toBe(1)
    expect(lidl.itemsFallback).toBe(2)

    const albert = totals.find((t) => t.store === 'Albert')!
    // Mléko (50*2=100) + Chleba (20*1=20) both via catalog, unknown item still falls back (15*1)
    expect(albert.total).toBe(100 + 20 + 15)
    expect(albert.itemsPriced).toBe(2)
    expect(albert.itemsFallback).toBe(1)
  })

  it('uses the item\'s assigned store and stored price even without a catalog name match', () => {
    const assignedItems = [
      item({ name: 'Okurka salátová hadovka 1 ks', price: 25.8, quantity: 2, store: 'Albert' }),
      item({ name: 'Kuře bez drobů 1 kg', price: 99.8, quantity: 3, store: 'Albert' }),
      item({ name: 'Kuřecí prsní řízky 1 kg', price: 259.8, quantity: 1, store: 'Albert' }),
    ]
    const totals = compareStoreTotals(assignedItems, [])
    expect(totals).toEqual([
      { store: 'Albert', total: 25.8 * 2 + 99.8 * 3 + 259.8, itemsPriced: 3, itemsFallback: 0 },
    ])
  })

  it('ignores done items entirely', () => {
    const withoutDone = compareStoreTotals(items.filter((i) => !i.done), products)
    const withDone = compareStoreTotals(items, products)
    expect(withDone).toEqual(withoutDone)
  })

  it('returns no candidate stores when there is no catalog price data at all', () => {
    expect(compareStoreTotals(items, [])).toEqual([])
  })

  it('keeps all supplied store candidates when only one product has a catalog price', () => {
    const singleProduct = [{ productName: 'Mléko', category: 'Potraviny' as const, prices: [price({ store: 'Lidl', regularPrice: 30 })] }]
    const totals = compareStoreTotals(
      [item({ name: 'Mléko', price: 30 }), item({ name: 'Chleba', price: 25 })],
      singleProduct,
      ['Lidl', 'Albert', 'Billa'],
    )
    expect(totals.map((entry) => entry.store)).toEqual(['Albert', 'Billa', 'Lidl'])
    expect(totals.every((entry) => entry.itemsPriced + entry.itemsFallback === 2)).toBe(true)
  })
})

describe('cheapestPossibleTotal', () => {
  const products: ProductPrice[] = [
    { productName: 'Mléko', category: 'Potraviny', prices: [price({ store: 'Lidl', regularPrice: 40, dealPrice: 30 }), price({ store: 'Albert', regularPrice: 50 })] },
    { productName: 'Chleba', category: 'Potraviny', prices: [price({ store: 'Albert', regularPrice: 20 })] },
  ]
  const items = [item({ name: 'Mléko', quantity: 2 }), item({ name: 'Chleba', price: 25, quantity: 1 }), item({ name: 'Nezname zbozi', price: 15, quantity: 1 })]

  it('picks the cheapest known store per item, ignoring the single-trip constraint', () => {
    // Mléko: min(30, 50) * 2 = 60; Chleba: 20 * 1 = 20; unknown item falls back to 15 * 1.
    expect(cheapestPossibleTotal(items, products)).toBe(60 + 20 + 15)
  })

  it('is never more than the cheapest single-store total, since it is a theoretical floor', () => {
    const totals = compareStoreTotals(items, products)
    expect(cheapestPossibleTotal(items, products)).toBeLessThanOrEqual(totals[0].total)
  })
})

describe('dealDiscount', () => {
  it('is the fraction off the regular price, and 0 without a deal or a regular price', () => {
    expect(dealDiscount(price({ regularPrice: 40, dealPrice: 30 }))).toBeCloseTo(0.25)
    expect(dealDiscount(price({ regularPrice: 40 }))).toBe(0)
    expect(dealDiscount(price({ regularPrice: 0, dealPrice: 5 }))).toBe(0)
  })
})

describe('bestDealByName', () => {
  const deal = (productName: string, store: string, dealPrice: number) => ({ product: { productName, category: 'Potraviny' as const, prices: [] }, price: price({ store: store as never, regularPrice: 50, dealPrice }) })

  it('keeps the cheapest running deal per product, matching names case-insensitively', () => {
    const best = bestDealByName([deal('Mléko', 'Lidl', 22), deal('mléko ', 'Penny', 19.9), deal('Máslo', 'Albert', 39)])
    expect(best.get('mléko')?.price.store).toBe('Penny')
    expect(best.get('máslo')?.price.dealPrice).toBe(39)
    expect(best.size).toBe(2)
  })
})

describe('dealSaving', () => {
  it('is the amount off the regular price per package, never negative', () => {
    expect(dealSaving(price({ regularPrice: 39.9, dealPrice: 29.9 }))).toBe(10)
    expect(dealSaving(price({ regularPrice: 40 }))).toBe(0)
    expect(dealSaving(price({ regularPrice: 20, dealPrice: 25 }))).toBe(0)
    expect(dealSaving(price({ regularPrice: 10.1, dealPrice: 9.99 }))).toBe(0.11)
  })
})

describe('dealEffectiveUnitPrice', () => {
  it('scales the unit price down by the same fraction the deal price is off the regular one', () => {
    expect(dealEffectiveUnitPrice(price({ regularPrice: 100, dealPrice: 80, unitPrice: 50 }))).toBeCloseTo(40)
  })

  it('is the plain unit price with no active deal', () => {
    expect(dealEffectiveUnitPrice(price({ regularPrice: 100, unitPrice: 50 }))).toBe(50)
  })

  it('falls back to the plain unit price rather than dividing by zero with no regular price', () => {
    expect(dealEffectiveUnitPrice(price({ regularPrice: 0, dealPrice: 5, unitPrice: 50 }))).toBe(50)
  })
})

describe('dealsForList', () => {
  const deal = (productName: string, regularPrice: number, dealPrice: number) => ({
    product: { productName, category: 'Potraviny' as const, prices: [] },
    price: price({ regularPrice, dealPrice }),
  })
  const deals = [deal('Máslo', 50, 45), deal('Mléko', 30, 20), deal('Chléb', 40, 20), deal('Káva', 200, 150), deal('Banány', 30, 27)]

  it("puts the deals for listed products first, in the list's order", () => {
    const { onList } = dealsForList(deals, ['banány', '  MLÉKO ', 'Rohlíky'])
    expect(onList.map((d) => d.product.productName)).toEqual(['Banány', 'Mléko'])
  })

  it('orders the rest by discount, biggest first, then by name', () => {
    const { others } = dealsForList(deals, ['Banány', 'Mléko'])
    // Chléb 50 %, Káva 25 %, Máslo 10 %.
    expect(others.map((d) => d.product.productName)).toEqual(['Chléb', 'Káva', 'Máslo'])
  })

  it('has nothing on the list when the list is empty, and keeps every deal', () => {
    const { onList, others } = dealsForList(deals, [])
    expect(onList).toEqual([])
    expect(others).toHaveLength(deals.length)
  })
})
