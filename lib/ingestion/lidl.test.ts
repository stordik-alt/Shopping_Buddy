import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchLidlProducts,
  mapLidlCategory,
  normalizeLidlProduct,
  parseLidlBasePrice,
  parseLidlPackaging,
  parseLidlSitemap,
  selectGroceryErpNumbers,
  type LidlRawProduct,
} from '@/lib/ingestion/lidl'

const TODAY = '2026-09-23'

describe('parseLidlPackaging', () => {
  it('parses a volume packaging string', () => {
    expect(parseLidlPackaging('750 ml')).toEqual({ quantity: 750, unit: 'ml' })
  })

  it('parses a count packaging string', () => {
    expect(parseLidlPackaging('10 ks')).toEqual({ quantity: 10, unit: 'ks' })
  })

  it('returns null for missing or unparseable text', () => {
    expect(parseLidlPackaging(null)).toBeNull()
    expect(parseLidlPackaging(undefined)).toBeNull()
    expect(parseLidlPackaging('assorted sizes')).toBeNull()
  })
})

describe('parseLidlBasePrice', () => {
  it('parses a volume-based unit price', () => {
    expect(parseLidlBasePrice('1 l = 49,86 Kč')).toEqual({ unit: 'l', unitPrice: 49.86 })
  })

  it('parses a count-based unit price with a leading quantity prefix', () => {
    expect(parseLidlBasePrice('10 ks, 1 ks = 6,99 Kč')).toEqual({ unit: 'ks', unitPrice: 6.99 })
  })

  it('returns null for missing or unparseable text', () => {
    expect(parseLidlBasePrice(null)).toBeNull()
    expect(parseLidlBasePrice('no price here')).toBeNull()
  })
})

describe('mapLidlCategory', () => {
  it('maps a grocery category path to Potraviny', () => {
    const raw: LidlRawProduct = { erpNumber: '1', keyfacts: { wonCategoryPrimary: 'Světy potřeb/Potraviny a blízké potraviny/Ovoce a zelenina/Ovoce' } }
    expect(mapLidlCategory(raw)).toBe('Potraviny')
  })

  it('maps the plain top-level "Food" category value to Potraviny', () => {
    const raw: LidlRawProduct = { erpNumber: '1b', category: 'Food' }
    expect(mapLidlCategory(raw)).toBe('Potraviny')
  })

  it('maps a home/garden category path to Domácnost', () => {
    const raw: LidlRawProduct = { erpNumber: '2', category: 'Kategorie/Dům a zahrada/Autoservis/Aku a elektrické nástroje' }
    expect(mapLidlCategory(raw)).toBe('Domácnost')
  })

  it('defaults to Ostatní when nothing matches, rather than guessing', () => {
    const raw: LidlRawProduct = { erpNumber: '3', category: 'Something entirely unrecognized' }
    expect(mapLidlCategory(raw)).toBe('Ostatní')
  })
})

describe('parseLidlSitemap', () => {
  it('extracts erpNumber/slug pairs from sitemap XML', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.lidl.cz/p/pilos-balkansky-syr/p10000187</loc></url>
      <url><loc>https://www.lidl.cz/p/banany/p10054878</loc></url>
    </urlset>`
    expect(parseLidlSitemap(xml)).toEqual([
      { slug: 'pilos-balkansky-syr', erpNumber: '10000187' },
      { slug: 'banany', erpNumber: '10054878' },
    ])
  })

  it('returns an empty array for sitemap XML with no matching entries', () => {
    expect(parseLidlSitemap('<urlset></urlset>')).toEqual([])
  })
})

describe('selectGroceryErpNumbers', () => {
  it('filters to grocery-keyword slugs only, up to the given limit', () => {
    const entries = [
      { slug: 'mleko-plnotucne', erpNumber: '1' },
      { slug: 'sannwald-kazetova-prikryvka', erpNumber: '2' },
      { slug: 'banany', erpNumber: '3' },
    ]
    expect(selectGroceryErpNumbers(entries, 10)).toEqual(['1', '3'])
  })

  it('respects the limit even when more matches exist', () => {
    const entries = [
      { slug: 'mleko-a', erpNumber: '1' },
      { slug: 'mleko-b', erpNumber: '2' },
      { slug: 'mleko-c', erpNumber: '3' },
    ]
    expect(selectGroceryErpNumbers(entries, 2)).toEqual(['1', '2'])
  })

  it('does not match a keyword hidden inside an unrelated longer word (real false positives found in a pilot run)', () => {
    const entries = [
      { slug: 'pergart-petrolejovy-ohrivac-big-red', erpNumber: '1' }, // "olej" inside "petrolejovy"
      { slug: 'gsw-mlekovar-1-5-l', erpNumber: '2' }, // "mleko" inside "mlekovar"
      { slug: 'playshoes-detska-nepromokava-bunda', erpNumber: '3' }, // "kava" inside "nepromokava"
    ]
    expect(selectGroceryErpNumbers(entries, 10)).toEqual([])
  })

  it('excludes a kitchen-gadget slug even when it contains an exact grocery keyword token (also found in a real pilot run)', () => {
    const entries = [
      { slug: 'livarno-home-regal-na-vino', erpNumber: '1' }, // a wine RACK, not wine
      { slug: 'silvercrest-strojek-na-testoviny', erpNumber: '2' }, // a pasta MAKER, not pasta
      { slug: 'vino-cervene', erpNumber: '3' }, // real wine — no accessory word present, should still match
    ]
    expect(selectGroceryErpNumbers(entries, 10)).toEqual(['3'])
  })
})

describe('normalizeLidlProduct', () => {
  it('normalizes a real-shaped product with an already-computed base price', () => {
    const raw: LidlRawProduct = {
      erpNumber: '10048234',
      fullTitle: 'Mléko plnotučné',
      keyfacts: { wonCategoryPrimary: 'Světy potřeb/Potraviny a blízké potraviny/Sýry, mléčné výrobky a vejce/Mléko a smetana' },
      price: { price: 34.9, oldPrice: 0, currencyCode: 'CZK', packaging: { text: '750 ml' }, basePrice: { text: '1 l = 49,86 Kč' } },
    }
    expect(normalizeLidlProduct(raw, TODAY)).toEqual({
      externalId: '10048234',
      name: 'Mléko plnotučné',
      category: 'Potraviny',
      unit: 'l',
      unitPrice: 49.86,
      regularPrice: 34.9,
      currency: 'CZK',
      recordedAt: TODAY,
      deal: undefined,
    })
  })

  it('derives a unit price from packaging when no basePrice text is given', () => {
    const raw: LidlRawProduct = {
      erpNumber: '2',
      fullTitle: 'Test Cheese',
      category: 'Food',
      price: { price: 100, currencyCode: 'CZK', packaging: { text: '4 kg' } },
    }
    const result = normalizeLidlProduct(raw, TODAY)
    expect(result?.unit).toBe('kg')
    expect(result?.unitPrice).toBe(25)
  })

  it('falls back to treating the item as 1 ks when neither basePrice nor packaging is present', () => {
    const raw: LidlRawProduct = { erpNumber: '3', fullTitle: 'Mystery Item', category: 'Food', price: { price: 59.9, currencyCode: 'CZK' } }
    const result = normalizeLidlProduct(raw, TODAY)
    expect(result?.unit).toBe('ks')
    expect(result?.unitPrice).toBe(59.9)
  })

  it('rejects a product with no numeric price, e.g. weight-priced produce sold by scale in-store', () => {
    const raw: LidlRawProduct = { erpNumber: '4', fullTitle: 'Banány', price: { currencyCode: 'CZK' } }
    expect(normalizeLidlProduct(raw, TODAY)).toBeNull()
  })

  it('rejects a non-positive price rather than recording it', () => {
    const raw: LidlRawProduct = { erpNumber: '5', fullTitle: 'Free Item', price: { price: 0, currencyCode: 'CZK' } }
    expect(normalizeLidlProduct(raw, TODAY)).toBeNull()
  })

  it('rejects a non-CZK currency', () => {
    const raw: LidlRawProduct = { erpNumber: '6', fullTitle: 'Import', price: { price: 5, currencyCode: 'EUR' } }
    expect(normalizeLidlProduct(raw, TODAY)).toBeNull()
  })

  it('rejects a product with no name at all', () => {
    const raw: LidlRawProduct = { erpNumber: '7', price: { price: 10, currencyCode: 'CZK' } }
    expect(normalizeLidlProduct(raw, TODAY)).toBeNull()
  })

  it('extracts a real active discount as a deal, using oldPrice as the regular price', () => {
    const raw: LidlRawProduct = {
      erpNumber: '100391807',
      fullTitle: 'Kuřecí prsa v akci',
      category: 'Food',
      price: {
        price: 999,
        oldPrice: 2499,
        currencyCode: 'CZK',
        discount: { startDate: '2026-09-13T22:00Z', endDate: '2026-09-27T21:59:59Z' },
      },
    }
    const result = normalizeLidlProduct(raw, TODAY)
    expect(result?.regularPrice).toBe(2499)
    // Priced per package here (no base price text), so 999 Kč/ks at the offer price and 2 499 Kč/ks regular.
    expect(result?.deal).toEqual({ dealPrice: 999, unitPrice: 999, validFrom: '2026-09-13', validUntil: '2026-09-27' })
    expect(result?.unitPrice).toBe(2499)
  })

  it("keeps Lidl's printed unit price on the deal and scales it up for the regular price", () => {
    const raw: LidlRawProduct = {
      erpNumber: '100391808',
      fullTitle: 'Olivový olej v akci',
      category: 'Food',
      price: {
        price: 100,
        oldPrice: 125,
        currencyCode: 'CZK',
        // Lidl prints the unit price of the price it shows now, i.e. the offer price.
        basePrice: { text: '1 l = 200,00 Kč' },
        discount: { startDate: '2026-09-13T22:00Z', endDate: '2026-09-27T21:59:59Z' },
      },
    }
    const result = normalizeLidlProduct(raw, TODAY)
    expect(result).toMatchObject({ unit: 'l', regularPrice: 125, unitPrice: 250 })
    expect(result?.deal).toMatchObject({ dealPrice: 100, unitPrice: 200 })
  })

  it('does not treat an oldPrice of 0 (no real discount) as a deal', () => {
    const raw: LidlRawProduct = { erpNumber: '8', fullTitle: 'No Deal Item', category: 'Food', price: { price: 34.9, oldPrice: 0, currencyCode: 'CZK' } }
    const result = normalizeLidlProduct(raw, TODAY)
    expect(result?.deal).toBeUndefined()
    expect(result?.regularPrice).toBe(34.9)
  })

  it('rejects a discount window that ends before it starts, rather than guessing which date is wrong', () => {
    const raw: LidlRawProduct = {
      erpNumber: '9',
      fullTitle: 'Inconsistent Deal',
      category: 'Food',
      price: { price: 10, oldPrice: 20, currencyCode: 'CZK', discount: { startDate: '2026-09-27', endDate: '2026-09-13' } },
    }
    expect(normalizeLidlProduct(raw, TODAY)).toBeNull()
  })

  it('rejects a product that resolves to a non-Potraviny category, even with a valid price (a kitchen gadget, not a grocery item)', () => {
    const raw: LidlRawProduct = {
      erpNumber: '10',
      fullTitle: 'LIVARNO HOME Regál na víno',
      category: 'Kategorie/Dům a zahrada/Nábytek',
      price: { price: 369.9, currencyCode: 'CZK' },
    }
    expect(normalizeLidlProduct(raw, TODAY)).toBeNull()
  })
})

describe('fetchLidlProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes no request once the deadline has passed', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchLidlProducts(['1', '2', '3'], { deadline: Date.now() - 1 })).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches every batch when there is no deadline', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ erpNumber: 'x' }] }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    const erpNumbers = Array.from({ length: 45 }, (_, i) => String(i))
    const products = await fetchLidlProducts(erpNumbers)
    expect(fetchMock).toHaveBeenCalledTimes(3) // 20 + 20 + 5
    expect(products).toHaveLength(3)
  })
})
