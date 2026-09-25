import { describe, expect, it, vi } from 'vitest'
import {
  albertProductKey,
  dedupeAlbertOffers,
  fetchAlbertOffers,
  mergeIngestResults,
  parseAlbertLeaflets,
  parseAlbertPackage,
  parseAlbertSpreads,
  parseAlbertUnitPrice,
  priceIsOnPage,
  validateAlbertOffer,
  type AlbertRawOffer,
  type ExtractedOffer,
  type FlyerPageCache,
  type FlyerPageExtractor,
} from '@/lib/ingestion/albert'
import type { IngestResult } from '@/lib/ingestion/types'

// Fixtures are cut from Albert's real week-39 supermarket flyer (23.–29. 9. 2026): the listing page's
// server-rendered state and the text layer of its first page, as spreads.json gives it.

const leafletJson = (id: string, fields: Record<string, string>) =>
  `"Leaflet:${id}":{"__typename":"Leaflet","id":"${id}",` +
  Object.entries(fields)
    .map(([key, value]) => `"${key}":"${value}"`)
    .join(',') +
  `,"stores":[{"__typename":"LeafletStore","localizedName":"Adamov, Nádražní"}]}`

const LISTING_HTML = `<script>window.__APOLLO_STATE__={${[
  leafletJson('3370730', {
    validityStartDateFormatted: '23.09.2026',
    validityEndDateFormatted: '29.09.2026',
    title: 'Albert - 39SM_akcni_letak',
    locationType: 'SUPERMARKET',
    viewUrl: 'https:\\u002F\\u002Fletaky.albert.cz\\u002F39sm_akcni_letak\\u002F',
    documentType: 'LEAFLET',
  }),
  leafletJson('3370747', {
    validityStartDateFormatted: '23.09.2026',
    validityEndDateFormatted: '29.09.2026',
    title: 'Albert - 39HM_akcni_letak',
    locationType: 'HYPERMARKET',
    viewUrl: 'https:\\u002F\\u002Fletaky.albert.cz\\u002F39hm_akcni_letak\\u002F',
    documentType: 'LEAFLET',
  }),
  leafletJson('3300000', {
    validityStartDateFormatted: '09.09.2026',
    validityEndDateFormatted: '15.09.2026',
    title: 'Albert - 37SM_akcni_letak',
    locationType: 'SUPERMARKET',
    viewUrl: 'https:\\u002F\\u002Fletaky.albert.cz\\u002F37sm_akcni_letak\\u002F',
    documentType: 'LEAFLET',
  }),
  leafletJson('1', { validityStartDateFormatted: 'zítra', validityEndDateFormatted: '29.09.2026', locationType: 'SUPERMARKET', viewUrl: 'https:\\u002F\\u002Fletaky.albert.cz\\u002Fx\\u002F' }),
].join(',')}}</script>`

const PAGE_TEXT =
  'Od 23. 9. do 29. 9. 2026\nwww.albert.cz\nPribináček\n\n29,90/\n\n• 125 g\n• 100 g = 15,92 Kč\n• cena za 1 ks\n21,90 Kč\n• vybrané druhy\n\n-33 %\n\n1990\nCENA ZA 1 ks\nPŘI KOUPI 3 ks\n\n' +
  '44,90/\n\n199,-/\n\nVepřová krkovice\nbez kosti – v celku\n\n-62 %\n\n74\n\n• chlazená\n• 1 kg\n\n' +
  'Monster\n\n• energetický nápoj\n• 0,5 l • 1 l = 53,80 Kč\n• vybrané druhy\n• 32,90 Kč\n\n99,90/\n\n-40 %\n\n59\n\n90\n\n' +
  'Madeta\nJihočeský\neidam 30%\n– plátky\n• 100 g\n\n16 ks\n\n31,90/\n\n-53 %\n\n14\n\n90\n\n' +
  'Gambrinus Original 10\n• světlé výčepní pivo • 0,5 l\n• 1 l = 25,80 Kč\n1290\n\nHanácká Vodka 269,-'

const TODAY = '2026-09-25'

function offer(overrides: Partial<ExtractedOffer>): ExtractedOffer {
  return {
    brand: null,
    name: 'Produkt',
    packageSize: null,
    offerPrice: null,
    regularPrice: null,
    discountPercent: null,
    unitPriceText: null,
    condition: 'none',
    selectedVariants: false,
    ownValidity: null,
    category: 'Potraviny',
    ...overrides,
  }
}

function raw(overrides: Partial<ExtractedOffer>, pageText = PAGE_TEXT): AlbertRawOffer {
  return { offer: offer(overrides), flyerId: '3370730', pageNumber: 1, pageText, validFrom: '2026-09-23', validUntil: '2026-09-29' }
}

const MADETA = { brand: 'Madeta', name: 'Jihočeský eidam 30% – plátky', packageSize: '100 g', offerPrice: 14.9, regularPrice: 31.9, discountPercent: 53 }
const GAMBRINUS = { brand: 'Gambrinus', name: 'Original 10', packageSize: '0,5 l', offerPrice: 12.9, unitPriceText: '1 l = 25,80 Kč' }

describe('parseAlbertLeaflets', () => {
  it('reads each flyer with its dates, store format and viewer URL', () => {
    const leaflets = parseAlbertLeaflets(LISTING_HTML)
    expect(leaflets.map((leaflet) => leaflet.id)).toEqual(['3370730', '3370747', '3300000'])
    expect(leaflets[0]).toEqual({
      id: '3370730',
      title: 'Albert - 39SM_akcni_letak',
      locationType: 'SUPERMARKET',
      documentType: 'LEAFLET',
      validFrom: '2026-09-23',
      validUntil: '2026-09-29',
      viewUrl: 'https://letaky.albert.cz/39sm_akcni_letak/',
    })
    expect(leaflets[1].locationType).toBe('HYPERMARKET')
  })

  it('leaves out a flyer whose dates cannot be read', () => {
    expect(parseAlbertLeaflets(LISTING_HTML).some((leaflet) => leaflet.id === '1')).toBe(false)
  })

  it('finds nothing in a page without flyers', () => {
    expect(parseAlbertLeaflets('<html></html>')).toEqual([])
  })
})

describe('parseAlbertSpreads', () => {
  it('lists pages in order with an absolute image URL and the text layer', () => {
    const pages = parseAlbertSpreads('https://letaky.albert.cz/39sm_akcni_letak/', [
      { pages: [{ number: 1, text: 'a', images: { at1600: '/resize/x/p1.jpg', at600: '/p1-small.jpg' } }] },
      { pages: [{ number: 2, text: 'b', images: { at1600: '/resize/x/p2.jpg' } }, { number: 3, images: {} }] },
    ])
    expect(pages).toEqual([
      { number: 1, text: 'a', imageUrl: 'https://letaky.albert.cz/resize/x/p1.jpg' },
      { number: 2, text: 'b', imageUrl: 'https://letaky.albert.cz/resize/x/p2.jpg' },
    ])
  })
})

describe('parseAlbertPackage', () => {
  it.each([
    ['100 g', { unit: 'kg', quantity: 0.1 }],
    ['0,5 l', { unit: 'l', quantity: 0.5 }],
    ['1 kg', { unit: 'kg', quantity: 1 }],
    ['3× 50 g', { unit: 'kg', quantity: 0.15 }],
    ['750 ml', { unit: 'l', quantity: 0.75 }],
    ['16 ks', { unit: 'ks', quantity: 16 }],
  ])('%s', (text, expected) => {
    const pack = parseAlbertPackage(text)
    expect(pack?.unit).toBe(expected.unit)
    expect(pack?.quantity).toBeCloseTo(expected.quantity)
  })

  it.each(['180–200 g', '5 bal.', 'balení', '0 g'])('rejects %s', (text) => {
    expect(parseAlbertPackage(text)).toBeNull()
  })
})

describe('parseAlbertUnitPrice', () => {
  it('turns the printed unit price into a price per kg, l or piece', () => {
    expect(parseAlbertUnitPrice('1 l = 25,80 Kč')).toEqual({ unit: 'l', unitPrice: 25.8 })
    expect(parseAlbertUnitPrice('100 g = 15,92 Kč')).toEqual({ unit: 'kg', unitPrice: 159.2 })
    expect(parseAlbertUnitPrice('1 ks = 19,97 Kč')).toEqual({ unit: 'ks', unitPrice: 19.97 })
    expect(parseAlbertUnitPrice('100 g od 64,95 Kč')).toBeNull()
  })
})

describe('priceIsOnPage', () => {
  it('finds the big price printed without a comma, a small price, and a whole-koruna price', () => {
    expect(priceIsOnPage(19.9, PAGE_TEXT)).toBe(true)
    expect(priceIsOnPage(29.9, PAGE_TEXT)).toBe(true)
    expect(priceIsOnPage(269, PAGE_TEXT)).toBe(true)
  })

  it('finds a big price the text layer split in two', () => {
    expect(priceIsOnPage(14.9, PAGE_TEXT)).toBe(true)
  })

  it('does not find a price that is not printed', () => {
    expect(priceIsOnPage(17.9, PAGE_TEXT)).toBe(false)
    expect(priceIsOnPage(9.9, '19,90')).toBe(false)
  })
})

describe('validateAlbertOffer', () => {
  it('accepts an offer the printed discount confirms, with the previous price as the regular price', () => {
    const result = validateAlbertOffer(raw(MADETA), TODAY)
    expect(result).toEqual({
      product: {
        externalId: 'v1|madeta|jihocesky eidam 30% plátky|0.1kg|'.normalize('NFD').replace(/\p{Diacritic}/gu, ''),
        name: 'Madeta Jihočeský eidam 30% – plátky 100 g',
        category: 'Potraviny',
        unit: 'kg',
        unitPrice: 319,
        regularPrice: 31.9,
        currency: 'CZK',
        recordedAt: TODAY,
        deal: { dealPrice: 14.9, unitPrice: 149, validFrom: '2026-09-23', validUntil: '2026-09-29' },
      },
    })
  })

  it('accepts an offer the printed unit price confirms, without a regular price', () => {
    const result = validateAlbertOffer(raw(GAMBRINUS), TODAY)
    expect('product' in result && result.product).toMatchObject({
      name: 'Gambrinus Original 10 0,5 l',
      unit: 'l',
      regularPrice: null,
      unitPrice: null,
      deal: { dealPrice: 12.9, unitPrice: 25.8 },
    })
  })

  it('marks an offer for selected varieties in the name and the identity', () => {
    const result = validateAlbertOffer(raw({ ...MADETA, selectedVariants: true }), TODAY)
    expect('product' in result && result.product.name).toBe('Madeta Jihočeský eidam 30% – plátky 100 g (vybrané druhy)')
    expect('product' in result && result.product.externalId.endsWith('|vybrane')).toBe(true)
  })

  it.each<[string, Partial<ExtractedOffer>, string]>([
    ['a multi-buy price', { ...MADETA, condition: 'multi_buy' }, 'condition: multi_buy'],
    ['an Albert app price', { ...MADETA, condition: 'app_only' }, 'condition: app_only'],
    ['an offer with its own validity', { ...MADETA, ownValidity: 'víkendová akce' }, 'own validity: víkendová akce'],
    ['a non-grocery offer', { ...MADETA, category: 'Ostatní' }, 'category: Ostatní'],
    ['an offer price not printed on the page', { ...MADETA, offerPrice: 17.9 }, 'offer price 17.9 not on the page'],
    ['a size range', { ...GAMBRINUS, packageSize: '180–200 g' }, 'package size not a single amount: 180–200 g'],
    ['a unit price that contradicts the price', { ...GAMBRINUS, unitPriceText: '1 l = 53,80 Kč' }, 'unit price 1 l = 53,80 Kč contradicts 12.9 / 0,5 l'],
    ['a discount that contradicts the prices', { ...MADETA, discountPercent: 33 }, 'discount -33 % contradicts 31.9 → 14.9'],
    ['a previous price not above the offer', { ...MADETA, regularPrice: 12.9 }, 'previous price 12.9 not above the offer 14.9'],
    ['a pairing nothing on the page confirms', { name: 'Jablka', packageSize: '1 kg', offerPrice: 19.9 }, 'pairing not confirmed by a printed discount or unit price'],
  ])('rejects %s', (_label, overrides, reason) => {
    expect(validateAlbertOffer(raw(overrides), TODAY)).toEqual({ rejected: reason })
  })

  it('rejects the offers of a flyer that has ended', () => {
    expect(validateAlbertOffer({ ...raw(MADETA), validUntil: '2026-09-24' }, TODAY)).toEqual({ rejected: 'flyer ended' })
  })
})

describe('albertProductKey', () => {
  it('is the same for the same offer whatever the case, diacritics or punctuation', () => {
    const pack = parseAlbertPackage('100 g')
    const a = albertProductKey({ brand: 'Madeta', name: 'Jihočeský eidam 30% – plátky', packageSize: '100 g', selectedVariants: false }, pack)
    const b = albertProductKey({ brand: 'MADETA', name: 'Jihocesky eidam 30%, plátky', packageSize: '100 g', selectedVariants: false }, pack)
    expect(a).toBe(b)
  })

  it('keeps two sizes of one product apart', () => {
    const base = { brand: 'Albert', name: 'Trvanlivé mléko 3,5%', selectedVariants: false }
    expect(albertProductKey({ ...base, packageSize: '1 l' }, parseAlbertPackage('1 l'))).not.toBe(albertProductKey({ ...base, packageSize: '0,5 l' }, parseAlbertPackage('0,5 l')))
  })
})

describe('dedupeAlbertOffers', () => {
  it('keeps the cheapest valid offer per product and every rejected one', () => {
    const cover = raw(MADETA)
    const inside = { ...raw({ ...MADETA, offerPrice: 19.9, discountPercent: 38 }), pageNumber: 2 }
    const rejected = raw({ ...MADETA, condition: 'app_only' })
    const kept = dedupeAlbertOffers([inside, cover, rejected], TODAY)
    expect(kept).toHaveLength(2)
    expect(kept).toContain(rejected)
    expect(kept).toContain(cover)
  })
})

describe('fetchAlbertOffers', () => {
  const spreads = (count: number) => [
    { pages: Array.from({ length: count }, (_, i) => ({ number: i + 1, text: PAGE_TEXT, images: { at1600: `/p${i + 1}.jpg` } })) },
  ]

  function fakeFetch(pageCount = 3) {
    return vi.fn(async (url: string) => {
      if (url === 'https://www.albert.cz/aktualni-letaky') return new Response(LISTING_HTML)
      if (url.endsWith('/spreads.json')) return new Response(JSON.stringify(spreads(pageCount)))
      return new Response('not found', { status: 404 })
    })
  }

  function memoryCache(initial: Record<string, ExtractedOffer[]> = {}) {
    const store = new Map(Object.entries(initial).map(([key, offers]) => [key, { offers }]))
    const cache: FlyerPageCache & { store: typeof store } = {
      store,
      load: async (ids) => new Map([...store].filter(([key]) => ids.includes(key.split('|')[0]))),
      save: async (leaflet, page, extraction) => {
        store.set(`${leaflet.id}|${page}`, { offers: extraction.offers })
      },
      prune: async () => {},
    }
    return cache
  }

  const extractor = (fail: number[] = []): FlyerPageExtractor & { extract: ReturnType<typeof vi.fn> } => ({
    model: 'test-model',
    extract: vi.fn(async (page) => {
      if (fail.includes(page.number)) throw new Error('model unavailable')
      return { offers: [offer({ ...MADETA, name: `Produkt ${page.number}` })], inputTokens: 100, outputTokens: 50 }
    }),
  })

  it('reads only the current flyers of the requested format, sending each page to the model once', async () => {
    const model = extractor()
    const cache = memoryCache()
    const offers = await fetchAlbertOffers('SUPERMARKET', { extractor: model, cache, fetch: fakeFetch(), today: TODAY })
    // The week-37 flyer has ended and the HM flyer is the other format.
    expect(new Set(offers.map((item) => item.flyerId))).toEqual(new Set(['3370730']))
    expect(offers).toHaveLength(3)
    expect(model.extract).toHaveBeenCalledTimes(3)
    expect(cache.store.size).toBe(3)

    // A second run reads everything from the cache.
    const again = extractor()
    expect(await fetchAlbertOffers('SUPERMARKET', { extractor: again, cache, fetch: fakeFetch(), today: TODAY })).toHaveLength(3)
    expect(again.extract).not.toHaveBeenCalled()
  })

  it('stops sending pages after maxNewPages', async () => {
    const model = extractor()
    await fetchAlbertOffers('SUPERMARKET', { extractor: model, cache: memoryCache(), fetch: fakeFetch(10), today: TODAY, maxNewPages: 2 })
    expect(model.extract).toHaveBeenCalledTimes(2)
  })

  it('leaves a failed page for the next run and keeps the others', async () => {
    const cache = memoryCache()
    const offers = await fetchAlbertOffers('SUPERMARKET', { extractor: extractor([2]), cache, fetch: fakeFetch(), today: TODAY })
    expect(offers.map((item) => item.pageNumber).sort()).toEqual([1, 3])
    expect(cache.store.has('3370730|2')).toBe(false)
  })

  it('fails when no page at all could be read', async () => {
    await expect(fetchAlbertOffers('SUPERMARKET', { extractor: extractor([1, 2, 3]), cache: memoryCache(), fetch: fakeFetch(), today: TODAY })).rejects.toThrow(
      'Albert flyer pages failed',
    )
  })

  it('fails when the listing has no flyers', async () => {
    const fetch = vi.fn(async () => new Response('<html></html>'))
    await expect(fetchAlbertOffers('SUPERMARKET', { extractor: extractor(), cache: memoryCache(), fetch, today: TODAY })).rejects.toThrow('has no flyers')
  })

  it('skips cached offers that no longer fit the schema', async () => {
    const cache = memoryCache()
    cache.store.set('3370730|1', { offers: [{ wrong: true }] as unknown as ExtractedOffer[] })
    const offers = await fetchAlbertOffers('SUPERMARKET', { extractor: extractor(), cache, fetch: fakeFetch(1), today: TODAY })
    expect(offers).toEqual([])
  })
})

describe('mergeIngestResults', () => {
  it('adds up two runs', () => {
    const base: IngestResult = { processed: 1, recorded: 1, newProducts: 1, deals: 1, promotionsWithoutValidity: 0, skipped: 1, unchanged: 0, priceChanges: 0, truncated: false, errors: ['a'] }
    expect(mergeIngestResults(base, { ...base, truncated: true, errors: ['b'] })).toEqual({
      ...base,
      processed: 2,
      recorded: 2,
      newProducts: 2,
      deals: 2,
      skipped: 2,
      truncated: true,
      errors: ['a', 'b'],
    })
  })
})
