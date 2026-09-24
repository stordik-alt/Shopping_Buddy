import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRohlikCatalog,
  normalizeRohlikProduct,
  parseRohlikPackage,
  ROHLIK_GROCERY_CATEGORY_IDS,
  rohlikConnector,
  type RohlikRawProduct,
  type RohlikSale,
} from '@/lib/ingestion/rohlik'

const TODAY = '2026-09-24'
const czk = (amount: number) => ({ amount, currency: 'CZK' })

// Fixtures mirror real records from rohlik.cz's product and price endpoints (2026-09-24), trimmed to
// the fields the connector reads.
const yogurt: RohlikRawProduct = {
  id: 1406908,
  name: 'Miil Krémový jogurt bílý 3,7 % tuku',
  unit: 'kg',
  textualAmount: '150 g',
  archived: false,
  weightedItem: false,
  price: czk(7.9),
  pricePerUnit: czk(52.67),
  sales: [],
}

const publicSale = (overrides: Partial<RohlikSale> = {}): RohlikSale => ({
  type: 'sale',
  active: true,
  silent: false,
  welcomePrice: false,
  triggerAmount: 1,
  bundleId: null,
  price: czk(16.9),
  pricePerUnit: czk(16.9),
  originalPrice: czk(24.9),
  originalPricePerUnit: null,
  validTill: '2026-09-28T23:59:00+02:00',
  ...overrides,
})

const cucumber: RohlikRawProduct = {
  id: 1294559,
  name: 'Okurka hadovka (cca 300 g)',
  unit: 'ks',
  textualAmount: '1 ks',
  archived: false,
  weightedItem: false,
  price: czk(24.9),
  pricePerUnit: czk(24.9),
  sales: [publicSale()],
}

const banana: RohlikRawProduct = {
  id: 1349777,
  name: 'Banán 1 ks',
  unit: 'kg',
  textualAmount: 'cca 150 g',
  archived: false,
  weightedItem: true,
  price: czk(6.18),
  pricePerUnit: czk(39.9),
  sales: [],
}

describe('parseRohlikPackage', () => {
  it('converts plain sizes to the base of their unit family', () => {
    expect(parseRohlikPackage('150 g')).toEqual({ unit: 'kg', quantity: 0.15 })
    expect(parseRohlikPackage('1,5 l')).toEqual({ unit: 'l', quantity: 1.5 })
    expect(parseRohlikPackage('500 ml')).toEqual({ unit: 'l', quantity: 0.5 })
    expect(parseRohlikPackage('2 kg')).toEqual({ unit: 'kg', quantity: 2 })
    expect(parseRohlikPackage('3 ks')).toEqual({ unit: 'ks', quantity: 3 })
  })

  it('does not treat an estimate or an unknown unit as a package size', () => {
    expect(parseRohlikPackage('cca 120 g')).toBeNull()
    expect(parseRohlikPackage('1 kytice')).toBeNull()
    expect(parseRohlikPackage('6 x 1,5 l')).toBeNull()
    expect(parseRohlikPackage(null)).toBeNull()
    expect(parseRohlikPackage('0 g')).toBeNull()
  })
})

describe('normalizeRohlikProduct', () => {
  it('normalizes a fixed-package product with its package price and per-kg unit price', () => {
    expect(normalizeRohlikProduct(yogurt, TODAY)).toEqual({
      externalId: '1406908',
      name: 'Miil Krémový jogurt bílý 3,7 % tuku',
      category: 'Potraviny',
      unit: 'kg',
      unitPrice: 52.67,
      regularPrice: 7.9,
      currency: 'CZK',
      recordedAt: TODAY,
    })
  })

  it('records a weighed item at its per-kg price, not the one-piece estimate', () => {
    const result = normalizeRohlikProduct(banana, TODAY)
    expect(result).toMatchObject({ unit: 'kg', regularPrice: 39.9, unitPrice: 39.9 })
  })

  it('refuses a weighed item that is not priced per kg', () => {
    expect(normalizeRohlikProduct({ ...banana, unit: 'l' }, TODAY)).toBeNull()
  })

  it('keeps the regular price and adds a deal for a public promotion with an end date', () => {
    const result = normalizeRohlikProduct(cucumber, TODAY)
    expect(result).toMatchObject({ regularPrice: 24.9, unit: 'ks' })
    // A piece-priced item: 24,90 Kč/ks regular scales to 16,90 Kč/ks at the offer price.
    expect(result?.deal).toEqual({ dealPrice: 16.9, unitPrice: 16.9, validFrom: TODAY, validUntil: '2026-09-28' })
    expect(result?.promotionWithoutValidity).toBeUndefined()
  })

  it('quotes a weighed item\'s deal per kg like its regular price', () => {
    const sale = publicSale({ price: czk(4.2), pricePerUnit: czk(27.9), originalPrice: czk(6.18), originalPricePerUnit: czk(39.9) })
    const deal = normalizeRohlikProduct({ ...banana, sales: [sale] }, TODAY)?.deal
    expect(deal?.dealPrice).toBe(27.9)
    expect(deal?.unitPrice).toBe(27.9)
  })

  it('takes the lowest of several valid promotions', () => {
    const cheaper = publicSale({ price: czk(14.9), pricePerUnit: czk(14.9), type: 'longtermAction' })
    expect(normalizeRohlikProduct({ ...cucumber, sales: [publicSale(), cheaper] }, TODAY)?.deal?.dealPrice).toBe(14.9)
  })

  it('never turns a members-only, multipack, silent, inactive or bundle price into a deal', () => {
    const notDeals: RohlikSale[] = [
      publicSale({ type: 'premium', welcomePrice: true }), // Rohlík Premium members
      publicSale({ type: 'multipack', triggerAmount: 3 }),
      publicSale({ type: 'groupDiscount', triggerAmount: 4, bundleId: 12, active: false }),
      publicSale({ silent: true }),
      publicSale({ active: false }),
    ]
    for (const sale of notDeals) {
      const result = normalizeRohlikProduct({ ...cucumber, sales: [sale] }, TODAY)
      expect(result?.deal).toBeUndefined()
      expect(result?.regularPrice).toBe(24.9)
    }
  })

  it('ignores a promotion that is not cheaper than the regular price or whose original price disagrees', () => {
    expect(normalizeRohlikProduct({ ...cucumber, sales: [publicSale({ price: czk(24.9) })] }, TODAY)?.deal).toBeUndefined()
    expect(normalizeRohlikProduct({ ...cucumber, sales: [publicSale({ originalPrice: czk(39.9) })] }, TODAY)?.deal).toBeUndefined()
  })

  it('ignores an expired promotion and flags one with no end date instead of inventing a window', () => {
    expect(normalizeRohlikProduct({ ...cucumber, sales: [publicSale({ validTill: '2026-09-20T23:59:00+02:00' })] }, TODAY)?.deal).toBeUndefined()
    const undated = normalizeRohlikProduct({ ...cucumber, sales: [publicSale({ validTill: null })] }, TODAY)
    expect(undated?.deal).toBeUndefined()
    expect(undated?.promotionWithoutValidity).toBe(true)
  })

  it('rejects unusable records', () => {
    expect(normalizeRohlikProduct({ ...yogurt, archived: true }, TODAY)).toBeNull()
    expect(normalizeRohlikProduct({ ...yogurt, name: '  ' }, TODAY)).toBeNull()
    expect(normalizeRohlikProduct({ ...yogurt, price: czk(0) }, TODAY)).toBeNull()
    expect(normalizeRohlikProduct({ ...yogurt, price: { amount: 7.9, currency: 'EUR' } }, TODAY)).toBeNull()
    expect(normalizeRohlikProduct({ ...yogurt, unit: 'kytice', textualAmount: '1 kytice' }, TODAY)).toBeNull()
  })

  it('rejects a package size that disagrees with the unit price', () => {
    // 19,90 Kč for 350 g is 56,86 Kč/kg; the source says 59,71 (5 % off) — real record from the site.
    const inconsistent: RohlikRawProduct = { ...yogurt, name: 'Agro Jesenice Zelenina s kukuřicí', textualAmount: '350 g', price: czk(19.9), pricePerUnit: czk(59.71) }
    expect(normalizeRohlikProduct(inconsistent, TODAY)).toBeNull()
  })

  it('accepts a unit price that only differs by the source rounding it', () => {
    expect(normalizeRohlikProduct({ ...yogurt, price: czk(9.9), pricePerUnit: czk(66) }, TODAY)).not.toBeNull()
  })
})

describe('rohlikConnector', () => {
  it('is the online-only Rohlík source', () => {
    expect(rohlikConnector.source).toBe('rohlik')
    expect(rohlikConnector.chain).toBe('Rohlík')
    expect(rohlikConnector.rawId(yogurt)).toBe('1406908')
  })
})

describe('fetchRohlikCatalog', () => {
  afterEach(() => vi.unstubAllGlobals())

  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

  /** Category N lists ids N*10+1..N*10+3 plus a shared id 999 (listed under every category). */
  function stubSite(options: { missingPriceFor?: number[] } = {}) {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url)
        const category = /categories\/normal\/(\d+)\/products/.exec(url)
        if (category) {
          // 300101000 -> 101, 300102000 -> 102, ...: a different block of ids per category.
          const n = Math.floor(Number(category[1]) / 1000) % 1000
          const size = Number(/size=(\d+)/.exec(url)?.[1] ?? 4)
          return json({ productIds: [n * 10 + 1, n * 10 + 2, n * 10 + 3, 999].slice(0, size) })
        }
        const ids = [...url.matchAll(/products=(\d+)/g)].map((match) => Number(match[1]))
        if (url.includes('/products/prices')) {
          return json(ids.filter((id) => !options.missingPriceFor?.includes(id)).map((id) => ({ productId: id, price: czk(10), pricePerUnit: czk(10), sales: [] })))
        }
        return json(ids.map((id) => ({ id, name: `Produkt ${id}`, unit: 'ks', textualAmount: '1 ks', archived: false, weightedItem: false })))
      }),
    )
    return calls
  }

  it('spreads the batch over the food categories and keeps a product listed twice only once', async () => {
    stubSite()
    const products = await fetchRohlikCatalog(1000, { pauseMs: 0 })
    const ids = products.map((product) => product.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id === 999)).toHaveLength(1)
    expect(ids).toHaveLength(ROHLIK_GROCERY_CATEGORY_IDS.length * 3 + 1)
  })

  it('caps the result at the limit and reads details and prices in batches', async () => {
    const calls = stubSite()
    const products = await fetchRohlikCatalog(7, { pauseMs: 0 })
    expect(products).toHaveLength(7)
    expect(calls.filter((url) => url.includes('/api/v1/products?'))).toHaveLength(1)
    expect(calls.filter((url) => url.includes('/products/prices'))).toHaveLength(1)
  })

  it('drops an id the price endpoint did not return instead of failing the batch', async () => {
    stubSite({ missingPriceFor: [1] })
    const products = await fetchRohlikCatalog(5, { pauseMs: 0 })
    expect(products.map((product) => product.id)).not.toContain(1)
    expect(products.length).toBeGreaterThan(0)
  })

  it('stops asking once the run is out of time and returns what it has', async () => {
    const calls = stubSite()
    const products = await fetchRohlikCatalog(100, { pauseMs: 0, deadline: Date.now() - 1 })
    expect(products).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('reports a failing source clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 503 }))))
    await expect(fetchRohlikCatalog(10, { pauseMs: 0 })).rejects.toThrow('Rohlik category')
  })

  it('does nothing for a non-positive limit', async () => {
    const calls = stubSite()
    expect(await fetchRohlikCatalog(0)).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
