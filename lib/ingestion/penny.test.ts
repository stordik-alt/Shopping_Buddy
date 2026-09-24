import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPennyProducts, mapPennyCategory, normalizePennyProduct, type PennyRawProduct } from '@/lib/ingestion/penny'

const TODAY = '2026-09-24'

// Fixtures mirror real records from penny.cz's product-discovery API (2026-09-24), trimmed to the
// fields the connector reads.
const window = { validityStart: '2026-09-23', validityEnd: '2026-09-29' }
const dairyPath = [[{ name: 'CHLAZENÉ VÝROBKY' }], [{ name: 'VŠECHNY AKCE' }]]

// Offer 16,90 Kč, regular (standard) 19,90 Kč, 100 g.
const edam: PennyRawProduct = {
  sku: '88-209439',
  name: 'Sýr Edam 45% Milkeria',
  amount: '100',
  volumeLabelShort: 'g',
  parentCategories: dairyPath,
  price: {
    baseUnitShort: 'g',
    basePriceFactor: '100',
    crossed: 1990,
    standard: { value: 1990, perStandardizedQuantity: 1990 },
    regular: { value: 1690, perStandardizedQuantity: 1690 },
    ...window,
  },
}

// Only an offer price: no standard, no crossed-out price.
const kofola: PennyRawProduct = {
  sku: '88-210198',
  name: 'Kofola Original PET',
  amount: '1',
  volumeLabelShort: 'l',
  parentCategories: [[{ name: 'VŠECHNY AKCE' }], [{ name: 'NÁPOJE' }]],
  price: { baseUnitShort: 'l', basePriceFactor: '1', regular: { value: 1590, perStandardizedQuantity: 1590 }, ...window },
}

// Crossed-out price only (no `standard`): 99,90 -> 59,90 Kč.
const crossedOnly: PennyRawProduct = {
  ...kofola,
  sku: 'crossed',
  price: { baseUnitShort: 'l', basePriceFactor: '1', crossed: 9990, regular: { value: 5990, perStandardizedQuantity: 5990 }, ...window },
}

describe('mapPennyCategory', () => {
  it('maps food categories to Potraviny, ignoring the all-offers collection', () => {
    expect(mapPennyCategory(edam)).toBe('Potraviny')
    expect(mapPennyCategory(kofola)).toBe('Potraviny')
  })

  it('maps drugstore goods to Drogerie and pet food to Ostatní', () => {
    expect(mapPennyCategory({ sku: '1', parentCategories: [[{ name: 'DROGERIE' }], [{ name: 'VŠECHNY AKCE' }]] })).toBe('Drogerie')
    expect(mapPennyCategory({ sku: '1', parentCategories: [[{ name: 'PRO ZVÍŘATA' }]] })).toBe('Ostatní')
    expect(mapPennyCategory({ sku: '1' })).toBe('Ostatní')
  })
})

describe('normalizePennyProduct', () => {
  it('records the standard price as regular and the offer as a dated deal', () => {
    expect(normalizePennyProduct(edam, TODAY)).toEqual({
      externalId: '88-209439',
      name: 'Sýr Edam 45% Milkeria',
      category: 'Potraviny',
      unit: 'kg',
      unitPrice: 199,
      regularPrice: 19.9,
      currency: 'CZK',
      recordedAt: TODAY,
      deal: { dealPrice: 16.9, validFrom: '2026-09-23', validUntil: '2026-09-29' },
    })
  })

  it('keeps the deal but records no regular price when the source states none', () => {
    const result = normalizePennyProduct(kofola, TODAY)
    expect(result?.regularPrice).toBeNull()
    expect(result?.unitPrice).toBeNull()
    expect(result?.deal).toEqual({ dealPrice: 15.9, validFrom: '2026-09-23', validUntil: '2026-09-29' })
  })

  it('uses the crossed-out price as the regular price, scaling the unit price by the same ratio', () => {
    const result = normalizePennyProduct(crossedOnly, TODAY)
    expect(result?.regularPrice).toBe(99.9)
    expect(result?.unitPrice).toBe(99.9)
    expect(result?.deal?.dealPrice).toBe(59.9)
  })

  it('ignores a crossed-out price that is not above the offer price', () => {
    const raw: PennyRawProduct = { ...crossedOnly, price: { ...crossedOnly.price, crossed: 5990 } }
    expect(normalizePennyProduct(raw, TODAY)?.regularPrice).toBeNull()
  })

  it('stores no deal for an offer that already ended', () => {
    const raw: PennyRawProduct = { ...edam, price: { ...edam.price, validityStart: '2026-09-10', validityEnd: '2026-09-16' } }
    const result = normalizePennyProduct(raw, TODAY)
    expect(result?.deal).toBeUndefined()
    expect(result?.regularPrice).toBe(19.9)
  })

  it('flags an offer without dates instead of inventing a window', () => {
    const raw: PennyRawProduct = { ...edam, price: { ...edam.price, validityStart: undefined, validityEnd: undefined } }
    const result = normalizePennyProduct(raw, TODAY)
    expect(result?.deal).toBeUndefined()
    expect(result?.promotionWithoutValidity).toBe(true)
  })

  it('rejects an offer window that ends before it starts', () => {
    const raw: PennyRawProduct = { ...edam, price: { ...edam.price, validityStart: '2026-09-29', validityEnd: '2026-09-23' } }
    expect(normalizePennyProduct(raw, TODAY)).toBeNull()
  })

  it('rejects an offer dearer than the stated regular price', () => {
    const raw: PennyRawProduct = { ...edam, price: { ...edam.price, regular: { value: 2490, perStandardizedQuantity: 2490 } } }
    expect(normalizePennyProduct(raw, TODAY)).toBeNull()
  })

  it('rejects missing identity or price, and non-food products', () => {
    expect(normalizePennyProduct({ ...edam, sku: '' }, TODAY)).toBeNull()
    expect(normalizePennyProduct({ ...edam, name: undefined }, TODAY)).toBeNull()
    expect(normalizePennyProduct({ ...edam, price: undefined }, TODAY)).toBeNull()
    expect(normalizePennyProduct({ ...edam, parentCategories: [[{ name: 'DROGERIE' }]] }, TODAY)).toBeNull()
  })

  it('rejects a unit price that contradicts price / package size', () => {
    // 16,90 Kč for 100 g is 169 Kč/kg; a reported 20 Kč per 100 g (200 Kč/kg) is beyond tolerance.
    const raw: PennyRawProduct = {
      ...edam,
      price: { ...edam.price, standard: undefined, crossed: undefined, regular: { value: 1690, perStandardizedQuantity: 2000 } },
    }
    expect(normalizePennyProduct(raw, TODAY)).toBeNull()
  })

  it('rejects weight-sold products, whose price semantics are unverified at Penny', () => {
    expect(normalizePennyProduct({ ...edam, weightArticle: true }, TODAY)).toBeNull()
    expect(normalizePennyProduct({ ...edam, weightPieceArticle: true }, TODAY)).toBeNull()
  })
})

describe('fetchPennyProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubPages(pages: { sku: string }[][], total: number) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const page = Number(/page=(\d+)/.exec(String(input))?.[1] ?? 0)
      return { ok: true, status: 200, json: async () => ({ results: pages[page] ?? [], total }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('stops once the limit is filled and calls the offers category', async () => {
    const fetchMock = stubPages([[{ sku: 'a' }, { sku: 'b' }], [{ sku: 'c' }]], 3)
    const products = await fetchPennyProducts(2)
    expect(products.map((p) => p.sku)).toEqual(['a', 'b'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('penny.cz/api/product-discovery/categories/vsechny-akce-99000000/products')
  })

  it('keeps fetching fixed-size pages until the reported total and de-duplicates by sku', async () => {
    // limit 4 -> page size 4; total 5 needs a second page (the stub ignores the size it is asked for).
    const fetchMock = stubPages(
      [[{ sku: 'a' }, { sku: 'b' }, { sku: 'c' }], [{ sku: 'c' }, { sku: 'd' }]],
      5,
    )
    const products = await fetchPennyProducts(4)
    expect(products.map((p) => p.sku)).toEqual(['a', 'b', 'c', 'd'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('page=1')
  })

  it('stops on an empty page even if the reported total is larger', async () => {
    const fetchMock = stubPages([[]], 999)
    expect(await fetchPennyProducts(10)).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('makes no request for a non-positive limit', async () => {
    const fetchMock = stubPages([], 0)
    expect(await fetchPennyProducts(0)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on an HTTP error so the caller can isolate the failing source', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 }) as Response))
    await expect(fetchPennyProducts(10)).rejects.toThrow('Penny category')
  })
})
