import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SAMPLE_MODULUS,
  fetchDmProducts,
  mapDmCategory,
  normalizeDmProduct,
  parseCzechNumber,
  parseDmPrice,
  parseDmSitemap,
  parseDmTileInfo,
  selectSampleIds,
  type DmRawProduct,
} from '@/lib/ingestion/dm'

const TODAY = '2026-09-24'

// Fixtures mirror real tiles from products.dm.de (2026-09-24), trimmed to the fields read.
const nightGel: DmRawProduct = {
  dan: 2128184,
  gtin: 3600542456630,
  brand: { name: 'GARNIER SKIN NATURALS' },
  title: { tileHeadline: 'hydratační pleťový noční gel Hyaluronic Aloe Jelly, 50 ml' },
  price: { price: { current: { value: '199,00 Kč' } }, tileInfos: ['50 ml (39,80 Kč za 10 ml)'] },
  trackingData: { price: 199, currency: 'CZK' },
  topCategory: 'Pleť, tělo & parfémy',
}

const babyFormula: DmRawProduct = {
  dan: 2979097,
  brand: { name: 'Nutrilon' },
  title: { tileHeadline: 'pokračovací mléčná kojenecká výživa 4 Advanced..., 3 000 g' },
  price: { price: { current: { value: '1 399,00 Kč' } }, tileInfos: ['3 000 g (46,63 Kč za 100 g)'] },
  trackingData: { price: 1399, currency: 'CZK' },
  topCategory: 'Péče o dítě',
}

// Clearance: original 299 Kč, now 149 Kč.
const clearance: DmRawProduct = {
  dan: 2031479,
  brand: { name: 'Mixa' },
  title: { tileHeadline: 'Sensitive Skin Expert sérum proti nedokonalostem, 30 ml' },
  price: {
    price: { current: { value: '149,00 Kč' }, previous: { value: '299,00 Kč' } },
    tileInfos: ['30 ml (49,67 Kč za 10 ml)'],
  },
  trackingData: { price: 149, currency: 'CZK' },
  topCategory: 'Pleť, tělo & parfémy',
}

describe('parseCzechNumber / parseDmPrice', () => {
  it('parses decimal commas and space or no-break-space thousands separators', () => {
    expect(parseCzechNumber('32,25')).toBe(32.25)
    expect(parseCzechNumber('3 000')).toBe(3000)
    expect(parseCzechNumber('1 399,00')).toBe(1399)
  })

  it('returns null for non-numbers and non-positive numbers', () => {
    expect(parseCzechNumber('abc')).toBeNull()
    expect(parseCzechNumber('0')).toBeNull()
    expect(parseCzechNumber('')).toBeNull()
  })

  it('parses a price with the koruna sign and rejects anything else', () => {
    expect(parseDmPrice('129,00 Kč')).toBe(129)
    expect(parseDmPrice('1 399,00 Kč')).toBe(1399)
    expect(parseDmPrice('129,00 €')).toBeNull()
    expect(parseDmPrice(undefined)).toBeNull()
  })
})

describe('parseDmTileInfo', () => {
  it('parses package size and unit price per N units', () => {
    expect(parseDmTileInfo('400 g (32,25 Kč za 100 g)')).toEqual({ packSize: 400, packUnit: 'g', unitPriceKc: 32.25, per: 100, unit: 'g' })
    expect(parseDmTileInfo('50 ml (39,80 Kč za 10 ml)')).toEqual({ packSize: 50, packUnit: 'ml', unitPriceKc: 39.8, per: 10, unit: 'ml' })
    expect(parseDmTileInfo('72 ks (6,10 Kč za 1 ks)')).toMatchObject({ packSize: 72, unit: 'ks' })
  })

  it('handles thousands separators in the package size', () => {
    expect(parseDmTileInfo('3 000 g (46,63 Kč za 100 g)')).toMatchObject({ packSize: 3000, per: 100 })
  })

  it('keeps units it does not model so the caller can decide', () => {
    expect(parseDmTileInfo('20 PD (5,45 Kč za 1 PD)')).toMatchObject({ packUnit: 'pd', unit: 'pd' })
  })

  it('returns null for missing or unparseable text', () => {
    expect(parseDmTileInfo(undefined)).toBeNull()
    expect(parseDmTileInfo('bez ceny')).toBeNull()
  })
})

describe('parseDmSitemap / selectSampleIds', () => {
  const xml =
    '<urlset><url><loc>https://www.dm.cz/p/d/1867493/schnitzer-housky</loc></url>' +
    '<url><loc>https://www.dm.cz/p/d/320/some-product</loc></url>' +
    '<url><loc>https://www.dm.cz/store/x</loc></url></urlset>'

  it('extracts product ids from /p/d/<id>/ URLs only', () => {
    expect(parseDmSitemap(xml)).toEqual([1867493, 320])
  })

  it('samples ids divisible by the modulus, ascending, de-duplicated and capped', () => {
    const ids = [SAMPLE_MODULUS * 3, 1, SAMPLE_MODULUS, SAMPLE_MODULUS, SAMPLE_MODULUS * 2, 7]
    expect(selectSampleIds(ids, 10)).toEqual([SAMPLE_MODULUS, SAMPLE_MODULUS * 2, SAMPLE_MODULUS * 3])
    expect(selectSampleIds(ids, 2)).toEqual([SAMPLE_MODULUS, SAMPLE_MODULUS * 2])
    expect(selectSampleIds(ids, 0)).toEqual([])
  })

  it('does not depend on where an id sits in the sitemap', () => {
    const a = [SAMPLE_MODULUS, 5, SAMPLE_MODULUS * 2]
    const b = [9, SAMPLE_MODULUS * 2, 11, SAMPLE_MODULUS]
    expect(selectSampleIds(a, 10)).toEqual(selectSampleIds(b, 10))
  })
})

describe('mapDmCategory', () => {
  it('maps drugstore, baby, household and nutrition top levels', () => {
    expect(mapDmCategory({ dan: 1, topCategory: 'Líčení' })).toBe('Drogerie')
    expect(mapDmCategory({ dan: 1, topCategory: 'Vlasová kosmetika' })).toBe('Drogerie')
    expect(mapDmCategory({ dan: 1, topCategory: 'Péče o zdraví' })).toBe('Drogerie')
    expect(mapDmCategory({ dan: 1, topCategory: 'Péče o dítě' })).toBe('Děti')
    expect(mapDmCategory({ dan: 1, topCategory: 'Domácnost' })).toBe('Domácnost')
    expect(mapDmCategory({ dan: 1, topCategory: 'Výživa' })).toBe('Potraviny')
  })

  it('returns null for an unknown or missing top level', () => {
    expect(mapDmCategory({ dan: 1, topCategory: 'Elektronika' })).toBeNull()
    expect(mapDmCategory({ dan: 1 })).toBeNull()
  })
})

describe('normalizeDmProduct', () => {
  it('normalizes a product with a brand-prefixed name and the unit price in Kč/l (39,80 Kč per 10 ml = 3 980 Kč/l)', () => {
    expect(normalizeDmProduct(nightGel, TODAY)).toEqual({
      externalId: '2128184',
      name: 'GARNIER SKIN NATURALS hydratační pleťový noční gel Hyaluronic Aloe Jelly, 50 ml',
      category: 'Drogerie',
      unit: 'l',
      unitPrice: 3980,
      regularPrice: 199,
      currency: 'CZK',
      recordedAt: TODAY,
      promotionWithoutValidity: undefined,
    })
  })

  it('converts per-100-g prices to Kč/kg and reads thousands-separated numbers', () => {
    const result = normalizeDmProduct(babyFormula, TODAY)
    expect(result).toMatchObject({ category: 'Děti', unit: 'kg', unitPrice: 466.3, regularPrice: 1399 })
  })

  it('does not repeat a brand the headline already starts with', () => {
    const raw: DmRawProduct = { ...nightGel, brand: { name: 'babylove' }, title: { tileHeadline: 'babylove bio příkrm, 190 g' } }
    expect(normalizeDmProduct(raw, TODAY)?.name).toBe('babylove bio příkrm, 190 g')
  })

  it('records the original price as regular and flags a discount without inventing dates', () => {
    const result = normalizeDmProduct(clearance, TODAY)
    expect(result?.regularPrice).toBe(299)
    expect(result?.unitPrice).toBe(9967.34)
    expect(result?.promotionWithoutValidity).toBe(true)
    expect(result?.deal).toBeUndefined()
  })

  it('ignores an original price that is not above the current one', () => {
    const raw: DmRawProduct = {
      ...clearance,
      price: { ...clearance.price, price: { current: { value: '149,00 Kč' }, previous: { value: '149,00 Kč' } } },
    }
    const result = normalizeDmProduct(raw, TODAY)
    expect(result?.regularPrice).toBe(149)
    expect(result?.promotionWithoutValidity).toBeUndefined()
  })

  it('falls back to one package as 1 ks for a unit the app does not model', () => {
    const raw: DmRawProduct = { ...nightGel, price: { ...nightGel.price, tileInfos: ['20 PD (9,95 Kč za 1 PD)'] } }
    expect(normalizeDmProduct(raw, TODAY)).toMatchObject({ unit: 'ks', unitPrice: 199, regularPrice: 199 })
  })

  it('falls back to 1 ks when the tile has no unit-price text', () => {
    const raw: DmRawProduct = { ...nightGel, price: { price: nightGel.price?.price } }
    expect(normalizeDmProduct(raw, TODAY)).toMatchObject({ unit: 'ks', unitPrice: 199 })
  })

  it('rejects missing identity or price', () => {
    expect(normalizeDmProduct({ ...nightGel, dan: 0 }, TODAY)).toBeNull()
    expect(normalizeDmProduct({ ...nightGel, title: undefined }, TODAY)).toBeNull()
    expect(normalizeDmProduct({ ...nightGel, trackingData: undefined }, TODAY)).toBeNull()
    expect(normalizeDmProduct({ ...nightGel, trackingData: { price: -5, currency: 'CZK' } }, TODAY)).toBeNull()
  })

  it('rejects a currency other than CZK', () => {
    expect(normalizeDmProduct({ ...nightGel, trackingData: { price: 199, currency: 'EUR' } }, TODAY)).toBeNull()
  })

  it('rejects a displayed price that disagrees with the numeric price', () => {
    expect(normalizeDmProduct({ ...nightGel, trackingData: { price: 149, currency: 'CZK' } }, TODAY)).toBeNull()
  })

  it('rejects an unknown or missing category', () => {
    expect(normalizeDmProduct({ ...nightGel, topCategory: 'Elektronika' }, TODAY)).toBeNull()
    expect(normalizeDmProduct({ ...nightGel, topCategory: undefined }, TODAY)).toBeNull()
  })

  it('rejects a unit price that contradicts price / package size', () => {
    // 199 Kč for 50 ml is 39,80 Kč per 10 ml; a reported 10 Kč per 10 ml is far off.
    const raw: DmRawProduct = { ...nightGel, price: { ...nightGel.price, tileInfos: ['50 ml (10,00 Kč za 10 ml)'] } }
    expect(normalizeDmProduct(raw, TODAY)).toBeNull()
  })
})

describe('fetchDmProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const ids = [SAMPLE_MODULUS, SAMPLE_MODULUS * 2, SAMPLE_MODULUS * 3, SAMPLE_MODULUS * 4]
  const sitemap = `<urlset>${ids.map((id) => `<url><loc>https://www.dm.cz/p/d/${id}/x</loc></url>`).join('')}<url><loc>https://www.dm.cz/p/d/7/skipped</loc></url></urlset>`

  function stubDm(options: { failDetailFor?: number[]; failSitemap?: boolean } = {}) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/product-sitemap.xml')) {
        return options.failSitemap ? ({ ok: false, status: 503 } as Response) : ({ ok: true, status: 200, text: async () => sitemap } as Response)
      }
      if (url.includes('/tiles/')) {
        const requested = url.split('/dans/')[1].split(',').map(Number)
        const products = Object.fromEntries(requested.map((dan) => [String(dan), { dan }]))
        return { ok: true, status: 200, json: async () => ({ products }) } as Response
      }
      const dan = Number(url.split('/dan/')[1])
      if (options.failDetailFor?.includes(dan)) return { ok: false, status: 500 } as Response
      return { ok: true, status: 200, json: async () => ({ breadcrumbs: ['Líčení', 'Rtěnky'] }) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('samples ids from the sitemap, batches the tile request and adds each top-level category', async () => {
    const fetchMock = stubDm()
    const products = await fetchDmProducts(3)
    expect(products.map((p) => p.dan)).toEqual([SAMPLE_MODULUS, SAMPLE_MODULUS * 2, SAMPLE_MODULUS * 3])
    expect(products.every((p) => p.topCategory === 'Líčení')).toBe(true)
    const tileCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/tiles/'))
    expect(tileCalls).toHaveLength(1)
    expect(String(tileCalls[0][0])).toContain(`/dans/${SAMPLE_MODULUS},${SAMPLE_MODULUS * 2},${SAMPLE_MODULUS * 3}`)
  })

  it('drops a product whose category lookup fails, and logs it, when most lookups succeed', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubDm({ failDetailFor: [SAMPLE_MODULUS * 2] })
    const products = await fetchDmProducts(4)
    expect(products.map((p) => p.dan)).toEqual([SAMPLE_MODULUS, SAMPLE_MODULUS * 3, SAMPLE_MODULUS * 4])
    expect(errorLog).toHaveBeenCalledTimes(1)
  })

  it('throws when half or more of the category lookups fail, so a broken source is visible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubDm({ failDetailFor: [SAMPLE_MODULUS, SAMPLE_MODULUS * 2] })
    await expect(fetchDmProducts(4)).rejects.toThrow('category lookups failed for 2 of 4')
  })

  it('stops after a run of consecutive lookup failures instead of timing out on every remaining product', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const many = Array.from({ length: 9 }, (_, i) => SAMPLE_MODULUS * (i + 1))
    const manySitemap = `<urlset>${many.map((id) => `<url><loc>https://www.dm.cz/p/d/${id}/x</loc></url>`).join('')}</urlset>`
    const detailCalls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/product-sitemap.xml')) return { ok: true, status: 200, text: async () => manySitemap } as Response
        if (url.includes('/tiles/')) {
          const requested = url.split('/dans/')[1].split(',').map(Number)
          return { ok: true, status: 200, json: async () => ({ products: Object.fromEntries(requested.map((dan) => [String(dan), { dan }])) }) } as Response
        }
        detailCalls.push(url)
        return { ok: false, status: 500 } as Response
      }),
    )
    await expect(fetchDmProducts(9)).rejects.toThrow('5 times in a row')
    expect(detailCalls).toHaveLength(5) // the remaining four products were never requested
  })

  it('stops requesting once the deadline has passed', async () => {
    const fetchMock = stubDm()
    // Sitemap and tiles are still fetched; no category lookup starts after the deadline.
    const products = await fetchDmProducts(3, { deadline: Date.now() - 1 })
    expect(products).toEqual([])
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/detail/'))).toBe(false)
  })

  it('makes no request for a non-positive limit', async () => {
    const fetchMock = stubDm()
    expect(await fetchDmProducts(0)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the sitemap cannot be fetched', async () => {
    stubDm({ failSitemap: true })
    await expect(fetchDmProducts(3)).rejects.toThrow('DM sitemap fetch failed: HTTP 503')
  })
})
