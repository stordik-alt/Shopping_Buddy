import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchKosikCatalog,
  fetchKosikCategorySlugs,
  KOSIK_GROCERY_TOP_LEVEL_IDS,
  kosikConnector,
  normalizeKosikProduct,
  parseKosikPromotionEnd,
  type KosikRawProduct,
} from '@/lib/ingestion/kosik'

const TODAY = '2026-09-24'

// Fixtures mirror real records from kosik.cz's product endpoint (2026-09-24), trimmed to the fields
// the connector reads.
const butter: KosikRawProduct = {
  id: 18147,
  name: 'Dr. Halíř Máslo (82%), 125 g',
  price: 29.9,
  recommendedPrice: 29.9,
  percentageDiscount: 0,
  productQuantity: { prefix: '', value: 125, unit: 'g' },
  pricePerUnit: { price: 239.2, unit: 'kg' },
  actionLabel: null,
}

// Regular 89,90 Kč, on offer for 54,90 Kč; the printed unit price (274,50 Kč/kg) is for the offer price.
const hermelin: KosikRawProduct = {
  id: 85357,
  name: 'Sedlčanský Sedlčanský Hermelín Duopack 2x100g',
  price: 54.9,
  recommendedPrice: 89.9,
  percentageDiscount: 38,
  productQuantity: { prefix: '', value: 200, unit: 'g' },
  pricePerUnit: { price: 274.5, unit: 'kg' },
  actionLabel: 'Akce platí do 29. 9.',
}

const pepper: KosikRawProduct = {
  id: 700001,
  name: 'Paprika zelená, 1 ks',
  price: 15.386,
  recommendedPrice: 15.386,
  percentageDiscount: 0,
  productQuantity: { prefix: 'cca', value: 140, unit: 'g' },
  pricePerUnit: { price: 109.9, unit: 'kg' },
  actionLabel: null,
}

const cucumber: KosikRawProduct = {
  id: 700002,
  name: 'Okurka hadovka, 1 ks',
  price: 17.9,
  recommendedPrice: 17.9,
  percentageDiscount: 0,
  productQuantity: null,
  pricePerUnit: { price: 17.9, unit: 'ks' },
  actionLabel: null,
}

describe('parseKosikPromotionEnd', () => {
  it('reads the end date of a promotion label', () => {
    expect(parseKosikPromotionEnd('Akce platí do 29. 9.', TODAY)).toBe('2026-09-29')
    expect(parseKosikPromotionEnd('Akce platí do 24. 9.', TODAY)).toBe('2026-09-24') // ends today: still valid today
  })

  it('rolls into next year around New Year', () => {
    expect(parseKosikPromotionEnd('Akce platí do 3. 1.', '2026-12-30')).toBe('2027-01-03')
  })

  it('does not treat a best-before clearance as a promotion window', () => {
    expect(parseKosikPromotionEnd('Spotřebujte do 26. 9.', TODAY)).toBeNull()
    expect(parseKosikPromotionEnd(null, TODAY)).toBeNull()
    expect(parseKosikPromotionEnd('', TODAY)).toBeNull()
  })

  it('rejects an impossible or implausibly distant date instead of guessing', () => {
    expect(parseKosikPromotionEnd('Akce platí do 31. 2.', TODAY)).toBeNull()
    expect(parseKosikPromotionEnd('Akce platí do 30. 4.', TODAY)).toBeNull() // next April: over the limit
  })
})

describe('normalizeKosikProduct', () => {
  it('normalizes a fixed-package product', () => {
    expect(normalizeKosikProduct(butter, TODAY)).toEqual({
      externalId: '18147',
      name: 'Dr. Halíř Máslo (82%), 125 g',
      category: 'Potraviny',
      unit: 'kg',
      unitPrice: 239.2,
      regularPrice: 29.9,
      currency: 'CZK',
      recordedAt: TODAY,
    })
  })

  it('records the regular price and unit price, and adds a deal, for a dated promotion', () => {
    const result = normalizeKosikProduct(hermelin, TODAY)
    // The printed 274,50 Kč/kg is for the offer price; at the regular price it is 449,50 Kč/kg
    // (= 89,90 Kč / 0,2 kg), which is what is recorded as the regular unit price.
    expect(result).toMatchObject({ regularPrice: 89.9, unit: 'kg' })
    expect(result?.unitPrice).toBeCloseTo((274.5 * 89.9) / 54.9, 1)
    expect(result?.deal).toEqual({ dealPrice: 54.9, validFrom: TODAY, validUntil: '2026-09-29' })
  })

  it('records a weighed item at its per-kg price, not the one-piece estimate', () => {
    expect(normalizeKosikProduct(pepper, TODAY)).toMatchObject({ unit: 'kg', regularPrice: 109.9, unitPrice: 109.9 })
  })

  it("quotes a weighed item's deal per kg like its regular price", () => {
    const onOffer: KosikRawProduct = { ...pepper, price: 10.7702, recommendedPrice: 15.386, percentageDiscount: 30, pricePerUnit: { price: 76.93, unit: 'kg' }, actionLabel: 'Akce platí do 29. 9.' }
    const result = normalizeKosikProduct(onOffer, TODAY)
    expect(result?.deal?.dealPrice).toBe(76.93)
    expect(result?.regularPrice).toBeCloseTo(109.9, 1)
  })

  it('accepts a piece-priced product with no stated package size', () => {
    expect(normalizeKosikProduct(cucumber, TODAY)).toMatchObject({ unit: 'ks', regularPrice: 17.9, unitPrice: 17.9 })
  })

  it('counts a discount without a dated promotion label instead of inventing a window', () => {
    const clearance = normalizeKosikProduct({ ...hermelin, actionLabel: 'Spotřebujte do 26. 9.' }, TODAY)
    expect(clearance?.deal).toBeUndefined()
    expect(clearance?.promotionWithoutValidity).toBe(true)
    expect(clearance?.regularPrice).toBe(89.9)
  })

  it('records no deal when there is no discount', () => {
    const result = normalizeKosikProduct(butter, TODAY)
    expect(result?.deal).toBeUndefined()
    expect(result?.promotionWithoutValidity).toBeUndefined()
  })

  it('rejects unusable records', () => {
    expect(normalizeKosikProduct({ ...butter, name: ' ' }, TODAY)).toBeNull()
    expect(normalizeKosikProduct({ ...butter, price: 0 }, TODAY)).toBeNull()
    expect(normalizeKosikProduct({ ...butter, pricePerUnit: null }, TODAY)).toBeNull()
    expect(normalizeKosikProduct({ ...butter, pricePerUnit: { price: 239.2, unit: 'm' } }, TODAY)).toBeNull()
    expect(normalizeKosikProduct({ ...pepper, pricePerUnit: { price: 109.9, unit: 'l' } }, TODAY)).toBeNull()
  })

  it('rejects a package size that disagrees with the unit price (e.g. a price per drained weight)', () => {
    // Real record: 39,90 Kč for 400 g is 99,75 Kč/kg, the site prints 166,25 (per drained weight).
    const canned: KosikRawProduct = { ...butter, name: 'Giana Rajčata loupaná krájená', price: 39.9, recommendedPrice: 39.9, productQuantity: { prefix: '', value: 400, unit: 'g' }, pricePerUnit: { price: 166.25, unit: 'kg' } }
    expect(normalizeKosikProduct(canned, TODAY)).toBeNull()
  })

  it('accepts a unit price that only differs by the source rounding it', () => {
    expect(normalizeKosikProduct({ ...butter, pricePerUnit: { price: 239.19999999999996, unit: 'kg' } }, TODAY)).not.toBeNull()
  })
})

describe('kosikConnector', () => {
  it('is the online-only Košík source', () => {
    expect(kosikConnector.source).toBe('kosik')
    expect(kosikConnector.chain).toBe('Košík')
    expect(kosikConnector.rawId(butter)).toBe('18147')
  })
})

describe('fetching', () => {
  afterEach(() => vi.unstubAllGlobals())

  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  const apiProduct = (id: number) => ({ id, name: `Produkt ${id}`, price: 10, recommendedPrice: 10, percentageDiscount: 0, productQuantity: { prefix: '', value: 100, unit: 'g' }, pricePerUnit: { price: 100, unit: 'kg' }, actionLabel: null })

  /** A menu with two food top-levels (2 sub-categories each) and one non-food; every category lists ids `<subId>0..2` plus 999. */
  function stubSite() {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url)
        if (url.includes('/api/front/menu/main')) {
          return json({
            categories: [
              { id: 1026, subCategories: [{ id: 11, url: '/c11-a' }, { id: 12, url: '/c12-b' }] },
              { id: 985, subCategories: [{ id: 21, url: '/c21-c' }, { id: 22, url: '/c22-d' }] },
              { id: 1455, subCategories: [{ id: 31, url: '/c31-drogerie' }] }, // not food
            ],
          })
        }
        const sub = Number(/slug=c(\d+)-/.exec(url)?.[1])
        return json({ products: { items: [sub * 10, sub * 10 + 1, sub * 10 + 2, 999].map(apiProduct) } })
      }),
    )
    return calls
  }

  it('lists sub-categories round-robin across the food top-levels and skips non-food', async () => {
    stubSite()
    expect(await fetchKosikCategorySlugs()).toEqual(['c11-a', 'c21-c', 'c12-b', 'c22-d'])
  })

  it('reads every category once, keeps a product listed twice only once and asks for at most 30', async () => {
    const calls = stubSite()
    const products = await fetchKosikCatalog(1000, { pauseMs: 0 })
    const ids = products.map((product) => product.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id === 999)).toHaveLength(1)
    expect(ids).toHaveLength(4 * 3 + 1)
    const categoryCalls = calls.filter((url) => url.includes('/products/flexible'))
    expect(categoryCalls).toHaveLength(4)
    for (const url of categoryCalls) expect(url).toContain('limit=30')
  })

  it('stops once the limit is reached', async () => {
    const calls = stubSite()
    const products = await fetchKosikCatalog(5, { pauseMs: 0 })
    expect(products).toHaveLength(5)
    expect(calls.filter((url) => url.includes('/products/flexible')).length).toBeLessThan(4)
  })

  it('stops asking once the run is out of time', async () => {
    const calls = stubSite()
    const products = await fetchKosikCatalog(100, { pauseMs: 0, deadline: Date.now() - 1 })
    expect(products).toEqual([])
    expect(calls.filter((url) => url.includes('/products/flexible'))).toHaveLength(0)
  })

  it('reports a failing source clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 503 }))))
    await expect(fetchKosikCatalog(10, { pauseMs: 0 })).rejects.toThrow('Kosik menu')
  })

  it('rejects a category response that is not a flat product list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.includes('/menu/main') ? json({ categories: [{ id: 1026, subCategories: [{ id: 11, url: '/c11-a' }] }] }) : json({ products: null }))),
    )
    await expect(fetchKosikCatalog(10, { pauseMs: 0 })).rejects.toThrow('unexpected response shape')
  })

  it('does nothing for a non-positive limit', async () => {
    const calls = stubSite()
    expect(await fetchKosikCatalog(0)).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('covers the eight food top-levels', () => {
    expect(KOSIK_GROCERY_TOP_LEVEL_IDS).toHaveLength(8)
  })
})
