import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BILLA_GROCERY_CATEGORY_SLUGS,
  fetchBillaProducts,
  mapBillaCategory,
  normalizeBillaProduct,
  toNormalizedUnitPrice,
  type BillaRawProduct,
} from '@/lib/ingestion/billa'

const TODAY = '2026-09-24'

const foodPath = [[{ name: 'Cukrovinky' }, { name: 'Čokolády' }]]

// Fixtures mirror real records from billa.cz's product-discovery API (2026-09-24), trimmed to the
// fields the connector reads.
const packagedChocolate: BillaRawProduct = {
  sku: '82-351525',
  name: 'ORION Studentská pečeť Mléčná Pistácie 225g',
  amount: '225',
  volumeLabelShort: 'g',
  parentCategories: foodPath,
  price: { baseUnitShort: 'kg', basePriceFactor: '1', regular: { value: 12990, perStandardizedQuantity: 57733 } },
}

// Regular price 29,90 only from 2 pieces; standard (single-piece) price 56,90.
const promoHermelin: BillaRawProduct = {
  sku: '82-204154',
  name: 'Král Sýrů Hermelín originál 120g',
  amount: '120',
  volumeLabelShort: 'g',
  parentCategories: [[{ name: 'Chlazené, mléčné a rostlinné výrobky' }, { name: 'Sýry' }]],
  price: {
    baseUnitShort: 'kg',
    basePriceFactor: '1',
    standard: { value: 5690, perStandardizedQuantity: 47417 },
    regular: { value: 2990, perStandardizedQuantity: 24917 },
  },
}

// Sold by weight: the price is per kg (249 Kč), the unit price is per 100 g (24,90 Kč).
const cheeseByWeight: BillaRawProduct = {
  sku: '82-351101',
  name: 'Billa Císařská niva plísňový sýr 45 %',
  amount: '1000',
  volumeLabelShort: 'g',
  weightArticle: true,
  parentCategories: [[{ name: 'Chlazené, mléčné a rostlinné výrobky' }, { name: 'Sýry' }]],
  price: {
    baseUnitShort: 'g',
    basePriceFactor: '100',
    standard: { value: 27900, perStandardizedQuantity: 2790 },
    regular: { value: 24900, perStandardizedQuantity: 2490 },
  },
}

// Approximate-weight piece: 85,41 Kč is only the estimate for one ~855 g piece; 99,90 Kč/kg is exact.
const chickenPiece: BillaRawProduct = {
  sku: '82-318746',
  name: 'Farmářské kuře z Údlic, Kuřecí čtvrtě zadní',
  amount: '1',
  volumeLabelShort: 'kg',
  weightPieceArticle: true,
  parentCategories: [[{ name: 'Maso a ryby' }]],
  price: { baseUnitShort: 'kg', basePriceFactor: '1', regular: { value: 8541, perStandardizedQuantity: 9990 } },
}

describe('toNormalizedUnitPrice', () => {
  it('keeps kg / l / ks prices as they are', () => {
    expect(toNormalizedUnitPrice('kg', '1', 57733)).toEqual({ unit: 'kg', unitPrice: 577.33 })
    expect(toNormalizedUnitPrice('l', '1', 3490)).toEqual({ unit: 'l', unitPrice: 34.9 })
    expect(toNormalizedUnitPrice('ks', '1', 519)).toEqual({ unit: 'ks', unitPrice: 5.19 })
  })

  it('scales a per-100-g price to Kč/kg and a per-100-ml price to Kč/l', () => {
    expect(toNormalizedUnitPrice('g', '100', 2490)).toEqual({ unit: 'kg', unitPrice: 249 })
    expect(toNormalizedUnitPrice('ml', '100', 1250)).toEqual({ unit: 'l', unitPrice: 125 })
  })

  it('returns null for an unknown unit or a missing / non-positive price', () => {
    expect(toNormalizedUnitPrice('m', '1', 500)).toBeNull()
    expect(toNormalizedUnitPrice('kg', '1', undefined)).toBeNull()
    expect(toNormalizedUnitPrice('kg', '1', 0)).toBeNull()
    expect(toNormalizedUnitPrice('kg', '0', 500)).toBeNull()
  })
})

describe('mapBillaCategory', () => {
  it('maps food top-level categories to Potraviny', () => {
    expect(mapBillaCategory(packagedChocolate)).toBe('Potraviny')
  })

  it('treats a product as food if any of its category paths is food', () => {
    const raw: BillaRawProduct = { sku: '1', parentCategories: [[{ name: 'Domácnost' }], [{ name: 'Nápoje' }]] }
    expect(mapBillaCategory(raw)).toBe('Potraviny')
  })

  it('maps non-food top-level categories and defaults to Ostatní', () => {
    expect(mapBillaCategory({ sku: '1', parentCategories: [[{ name: 'Drogerie a kosmetika' }]] })).toBe('Drogerie')
    expect(mapBillaCategory({ sku: '1', parentCategories: [[{ name: 'Péče o dítě' }]] })).toBe('Děti')
    expect(mapBillaCategory({ sku: '1', parentCategories: [[{ name: 'Mazlíčci' }]] })).toBe('Ostatní')
    expect(mapBillaCategory({ sku: '1' })).toBe('Ostatní')
  })
})

describe('normalizeBillaProduct', () => {
  it('normalizes a packaged product with price and unit price in Kč', () => {
    expect(normalizeBillaProduct(packagedChocolate, TODAY)).toEqual({
      externalId: '82-351525',
      name: 'ORION Studentská pečeť Mléčná Pistácie 225g',
      category: 'Potraviny',
      unit: 'kg',
      unitPrice: 577.33,
      regularPrice: 129.9,
      currency: 'CZK',
      recordedAt: TODAY,
      promotionWithoutValidity: undefined,
    })
  })

  it('records the standard price as the regular price and flags the promotion without inventing dates', () => {
    const result = normalizeBillaProduct(promoHermelin, TODAY)
    expect(result?.regularPrice).toBe(56.9)
    expect(result?.unitPrice).toBe(474.17)
    expect(result?.promotionWithoutValidity).toBe(true)
    expect(result?.deal).toBeUndefined()
  })

  it('does not flag a product as promoted when the current price is not below the standard price', () => {
    const raw: BillaRawProduct = {
      ...packagedChocolate,
      price: {
        baseUnitShort: 'kg',
        basePriceFactor: '1',
        standard: { value: 12990, perStandardizedQuantity: 57733 },
        regular: { value: 12990, perStandardizedQuantity: 57733 },
      },
    }
    expect(normalizeBillaProduct(raw, TODAY)?.promotionWithoutValidity).toBeUndefined()
  })

  it('treats the price of a weight-sold product as its per-kg unit price', () => {
    const result = normalizeBillaProduct(cheeseByWeight, TODAY)
    expect(result?.unit).toBe('kg')
    expect(result?.regularPrice).toBe(279)
    expect(result?.unitPrice).toBe(279)
    expect(result?.promotionWithoutValidity).toBe(true)
  })

  it('uses the exact per-kg price, not the estimated piece price, for approximate-weight items', () => {
    const result = normalizeBillaProduct(chickenPiece, TODAY)
    expect(result?.unit).toBe('kg')
    expect(result?.regularPrice).toBe(99.9)
    expect(result?.unitPrice).toBe(99.9)
  })

  it('rejects records without a sku, a name, or a positive price', () => {
    expect(normalizeBillaProduct({ ...packagedChocolate, sku: ' ' }, TODAY)).toBeNull()
    expect(normalizeBillaProduct({ ...packagedChocolate, name: undefined }, TODAY)).toBeNull()
    expect(normalizeBillaProduct({ ...packagedChocolate, price: undefined }, TODAY)).toBeNull()
    expect(
      normalizeBillaProduct({ ...packagedChocolate, price: { baseUnitShort: 'kg', regular: { value: -100, perStandardizedQuantity: 57733 } } }, TODAY),
    ).toBeNull()
  })

  it('rejects non-food products', () => {
    expect(normalizeBillaProduct({ ...packagedChocolate, parentCategories: [[{ name: 'Domácnost' }]] }, TODAY)).toBeNull()
  })

  it('rejects a unit price that contradicts price / package size', () => {
    // 129,90 Kč for 225 g is ~577 Kč/kg; a reported 100 Kč/kg means one of the fields is wrong.
    const raw: BillaRawProduct = {
      ...packagedChocolate,
      price: { baseUnitShort: 'kg', basePriceFactor: '1', regular: { value: 12990, perStandardizedQuantity: 10000 } },
    }
    expect(normalizeBillaProduct(raw, TODAY)).toBeNull()
  })

  it('rejects a weight-sold product whose per-kg price and unit price disagree', () => {
    const raw: BillaRawProduct = {
      ...cheeseByWeight,
      price: { baseUnitShort: 'g', basePriceFactor: '100', regular: { value: 24900, perStandardizedQuantity: 5000 } },
    }
    expect(normalizeBillaProduct(raw, TODAY)).toBeNull()
  })

  it('rejects an approximate-weight item whose unit price is not per kg', () => {
    const raw: BillaRawProduct = {
      ...chickenPiece,
      price: { baseUnitShort: 'ks', basePriceFactor: '1', regular: { value: 8541, perStandardizedQuantity: 8541 } },
    }
    expect(normalizeBillaProduct(raw, TODAY)).toBeNull()
  })
})

describe('fetchBillaProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetch(handler: (url: string) => { ok: boolean; status?: number; body?: unknown }) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const { ok, status = 200, body } = handler(String(input))
      return { ok, status, json: async () => body } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('spreads the batch over every grocery category and de-duplicates by sku', async () => {
    const fetchMock = stubFetch((url) => {
      const slug = /categories\/([^/]+)\/products/.exec(url)?.[1] ?? ''
      // Every category also lists one shared product, which must be kept only once.
      return { ok: true, body: { results: [{ sku: `own-${slug}` }, { sku: 'shared' }] } }
    })
    const products = await fetchBillaProducts(18)
    expect(fetchMock).toHaveBeenCalledTimes(BILLA_GROCERY_CATEGORY_SLUGS.length)
    expect(new Set(products.map((p) => p.sku)).size).toBe(products.length)
    expect(products.filter((p) => p.sku === 'shared')).toHaveLength(1)
    expect(products.length).toBe(BILLA_GROCERY_CATEGORY_SLUGS.length + 1)
    // Two products per category requested for a limit of 18 over 9 categories.
    expect(String(fetchMock.mock.calls[0][0])).toContain('pageSize=2')
  })

  it('walks the whole listing for a part and keeps only that part of the SKUs', async () => {
    const fetchMock = stubFetch((url) => {
      const slug = /categories\/([^/]+)\/products/.exec(url)?.[1] ?? ''
      const page = Number(/page=(\d+)/.exec(url)?.[1])
      // 60 products per category: a full page of 50, then a short page of 10 ends it.
      const all = Array.from({ length: 60 }, (_, i) => ({ sku: `${slug}-${i}` }))
      return { ok: true, body: { results: all.slice(page * 50, (page + 1) * 50) } }
    })
    const parts = [0, 1, 2].map((index) => ({ index, count: 3 }))
    const perPart = []
    for (const part of parts) perPart.push((await fetchBillaProducts(1_000_000, { part })).map((p) => p.sku))
    expect(fetchMock).toHaveBeenCalledTimes(3 * BILLA_GROCERY_CATEGORY_SLUGS.length * 2)
    // Together the parts are the whole catalog, each SKU in exactly one of them.
    const all = perPart.flat()
    expect(all).toHaveLength(BILLA_GROCERY_CATEGORY_SLUGS.length * 60)
    expect(new Set(all).size).toBe(all.length)
  })

  it('pages through a category when the limit needs more than one page', async () => {
    const pages: number[] = []
    // Every page is full (50), so every category is asked for a second page.
    const fetchMock = stubFetch((url) => {
      pages.push(Number(/page=(\d+)/.exec(url)?.[1]))
      const slug = /categories\/([^/]+)\/products/.exec(url)?.[1]
      const page = Number(/page=(\d+)/.exec(url)?.[1])
      return { ok: true, body: { results: Array.from({ length: 50 }, (_, i) => ({ sku: `${slug}-${page}-${i}` })) } }
    })
    // 540 over 9 categories = 60 each -> page size 50, two pages.
    const products = await fetchBillaProducts(540)
    expect(fetchMock).toHaveBeenCalledTimes(BILLA_GROCERY_CATEGORY_SLUGS.length * 2)
    expect(new Set(pages)).toEqual(new Set([0, 1]))
    expect(String(fetchMock.mock.calls[0][0])).toContain('pageSize=50')
    expect(products).toHaveLength(540)
  })

  it('stops paging a category as soon as a page comes back short', async () => {
    const fetchMock = stubFetch(() => ({ ok: true, body: { results: [{ sku: 'only' }] } }))
    await fetchBillaProducts(540)
    // One request per category: each returned fewer than a full page, so there is no second page.
    expect(fetchMock).toHaveBeenCalledTimes(BILLA_GROCERY_CATEGORY_SLUGS.length)
  })

  it('caps the result at the requested limit', async () => {
    stubFetch(() => ({ ok: true, body: { results: [{ sku: 'a' }, { sku: 'b' }, { sku: 'c' }] } }))
    const products = await fetchBillaProducts(2)
    expect(products).toHaveLength(2)
  })

  it('makes no request for a non-positive limit', async () => {
    const fetchMock = stubFetch(() => ({ ok: true, body: { results: [] } }))
    expect(await fetchBillaProducts(0)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops asking once the deadline has passed and returns what it already has', async () => {
    let calls = 0
    const fetchMock = stubFetch(() => ({ ok: true, body: { results: [{ sku: `p${(calls += 1)}` }] } }))
    // Deadline passes after the first category has been fetched.
    const deadline = Date.now() + 1000
    const realNow = Date.now
    let reads = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (reads++ < 1 ? realNow() : deadline + 1))
    const products = await fetchBillaProducts(18, { deadline })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(products.map((p) => p.sku)).toEqual(['p1'])
    vi.restoreAllMocks()
  })

  it('throws on an HTTP error so the caller can isolate the failing source', async () => {
    stubFetch(() => ({ ok: false, status: 503 }))
    await expect(fetchBillaProducts(10)).rejects.toThrow('HTTP 503')
  })

  it('throws on an unexpected response shape', async () => {
    stubFetch(() => ({ ok: true, body: { unexpected: true } }))
    await expect(fetchBillaProducts(10)).rejects.toThrow('unexpected response shape')
  })
})
