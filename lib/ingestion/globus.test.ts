import { describe, expect, it } from 'vitest'
import {
  dedupeGlobusOffers,
  globusPackage,
  mapGlobusCategory,
  normalizeGlobusOffer,
  parseGlobusPageHashes,
  parseGlobusUnitPrice,
  type GlobusRawOffer,
} from '@/lib/ingestion/globus'

const TODAY = '2026-09-25'
// Shaped like the real records (Globus flyer 39_26, 2026-09-25).
const coffee: GlobusRawOffer = {
  EAN: '4061445363286',
  vanr: '1230184003',
  Name: 'Tchibo Barista Káva',
  subname: 'zrnková',
  productGroupCode: '6271111',
  quantity: 1,
  quantityUnit: 'kg',
  saleFrom: '2026-09-23',
  saleTo: '2026-10-12',
  price: 449.9,
  originalPrice: 799.9,
  crossed: true,
  unitPrice: '449,90 Kč za 1 kg',
}
const beer: GlobusRawOffer = {
  EAN: '8594404115115',
  Name: 'Pilsner Urquell',
  productGroupCode: '8004211',
  quantity: 0.5,
  quantityUnit: 'l',
  saleFrom: '2026-09-23',
  saleTo: '2026-10-12',
  price: 28.9,
  crossed: false,
  unitPrice: '57,80 Kč za 1 l',
}

describe('normalizeGlobusOffer', () => {
  it('records the struck-through regular price and the dated offer', () => {
    expect(normalizeGlobusOffer(coffee, TODAY)).toEqual({
      externalId: '4061445363286',
      name: 'Tchibo Barista Káva zrnková 1 kg',
      category: 'Potraviny',
      unit: 'kg',
      unitPrice: 799.9,
      regularPrice: 799.9,
      currency: 'CZK',
      recordedAt: TODAY,
      deal: { dealPrice: 449.9, unitPrice: 449.9, validFrom: '2026-09-23', validUntil: '2026-10-12' },
    })
  })

  it('stores only the deal when the flyer states no regular price', () => {
    const product = normalizeGlobusOffer(beer, TODAY)!
    expect(product).toMatchObject({ name: 'Pilsner Urquell 0,5 l', unit: 'l', regularPrice: null, unitPrice: null })
    expect(product.deal).toEqual({ dealPrice: 28.9, unitPrice: 57.8, validFrom: '2026-09-23', validUntil: '2026-10-12' })
  })

  it('works out the unit price from the package when the flyer prints none, or per piece without a size', () => {
    expect(normalizeGlobusOffer({ ...beer, unitPrice: undefined }, TODAY)!.deal!.unitPrice).toBe(57.8)
    const croissant = normalizeGlobusOffer({ EAN: '2000000000017', Name: 'Croissant', productGroupCode: null, saleFrom: '2026-09-23', saleTo: '2026-09-29', price: 9.9 }, TODAY)!
    expect(croissant).toMatchObject({ unit: 'ks', category: 'Potraviny', deal: { unitPrice: 9.9 } })
  })

  it('rejects an offer whose printed unit price contradicts its package', () => {
    expect(normalizeGlobusOffer({ ...beer, unitPrice: '99,00 Kč za 1 l' }, TODAY)).toBeNull()
  })

  it('rejects a piece priced per kilo — which of the two the price is for is unknowable', () => {
    expect(normalizeGlobusOffer({ EAN: '107200', Name: 'Avokádo', productGroupCode: 'null', quantity: 1, quantityUnit: 'ks', saleFrom: '2026-09-23', saleTo: '2026-09-29', price: 29.9, unitPrice: '29,90 Kč za 1 kg' }, TODAY)).toBeNull()
  })

  it("takes the fresh counter, identified by Globus's internal code", () => {
    const grapes = normalizeGlobusOffer({ EAN: '107107', Name: 'Hrozny bílé', productGroupCode: 'null', quantity: 500, quantityUnit: 'g', saleFrom: '2026-09-23', saleTo: '2026-09-29', price: 24.9, originalPrice: 49.9, unitPrice: '4,98 Kč za 100 g' }, TODAY)!
    expect(grapes).toMatchObject({ externalId: '107107', name: 'Hrozny bílé 500 g', category: 'Potraviny', unit: 'kg', regularPrice: 49.9, unitPrice: 99.8 })
    expect(grapes.deal).toMatchObject({ dealPrice: 24.9, unitPrice: 49.8 })
  })

  it('prices household goods per roll or dose, as the flyer does', () => {
    const paper = normalizeGlobusOffer({ EAN: '8590000000011', Name: 'Toaletní papír', productGroupCode: '6511111', quantity: 2, quantityUnit: 'role', saleFrom: '2026-09-23', saleTo: '2026-09-29', price: 24.9, unitPrice: '12,45 Kč za 1 roli' }, TODAY)!
    expect(paper).toMatchObject({ category: 'Domácnost', unit: 'ks', name: 'Toaletní papír 2 role', deal: { unitPrice: 12.45 } })
  })

  it('rejects an ended offer, an inverted window, an offer dearer than the regular price, and non-food', () => {
    expect(normalizeGlobusOffer({ ...coffee, saleFrom: '2026-09-01', saleTo: '2026-09-08' }, TODAY)).toBeNull()
    expect(normalizeGlobusOffer({ ...coffee, saleFrom: '2026-10-12', saleTo: '2026-09-23' }, TODAY)).toBeNull()
    expect(normalizeGlobusOffer({ ...coffee, originalPrice: 400 }, TODAY)).toBeNull()
    expect(normalizeGlobusOffer({ ...coffee, productGroupCode: '7012345', Name: 'Ponožky' }, TODAY)).toBeNull()
  })

  it('needs a barcode, a name and a positive price', () => {
    expect(normalizeGlobusOffer({ ...coffee, EAN: '' }, TODAY)).toBeNull()
    expect(normalizeGlobusOffer({ ...coffee, EAN: 'ABC123' }, TODAY)).toBeNull()
    expect(normalizeGlobusOffer({ ...coffee, Name: ' ', subname: '' }, TODAY)).toBeNull()
    expect(normalizeGlobusOffer({ ...coffee, price: 0 }, TODAY)).toBeNull()
  })

  it('ignores the members-only club price', () => {
    expect(normalizeGlobusOffer({ ...beer, clubPrice: 19.9 }, TODAY)!.deal!.dealPrice).toBe(28.9)
  })

  it('keeps an announced offer that starts later, with its own dates', () => {
    expect(normalizeGlobusOffer({ ...beer, saleFrom: '2026-09-30', saleTo: '2026-10-06' }, TODAY)!.deal).toMatchObject({ validFrom: '2026-09-30' })
  })
})

describe('mapGlobusCategory', () => {
  it('takes food and household departments and leaves the rest out', () => {
    expect(mapGlobusCategory('6271111')).toBe('Potraviny')
    expect(mapGlobusCategory(null)).toBe('Potraviny') // fresh counter
    expect(mapGlobusCategory('null')).toBe('Potraviny') // …as the source actually writes it
    expect(mapGlobusCategory('6512345')).toBe('Domácnost')
    expect(mapGlobusCategory('7012345')).toBeNull() // textiles
    expect(mapGlobusCategory('6912345')).toBeNull() // appliances
  })
})

describe('parseGlobusUnitPrice / globusPackage', () => {
  it('reads the printed unit price in any of the flyer\'s units', () => {
    expect(parseGlobusUnitPrice('449,90 Kč za 1 kg')).toEqual({ unit: 'kg', unitPrice: 449.9 })
    expect(parseGlobusUnitPrice('12,90 Kč za 100 g')).toEqual({ unit: 'kg', unitPrice: 129 })
    expect(parseGlobusUnitPrice('1 299,00 Kč za 1 l')).toEqual({ unit: 'l', unitPrice: 1299 })
    expect(parseGlobusUnitPrice('12,45 Kč za 1 roli')).toEqual({ unit: 'ks', unitPrice: 12.45 })
    expect(parseGlobusUnitPrice('3,50 Kč za 1 balení')).toBeNull()
    expect(parseGlobusUnitPrice(undefined)).toBeNull()
  })

  it('converts package sizes to kg, l or pieces', () => {
    expect(globusPackage(250, 'g')).toEqual({ unit: 'kg', quantity: 0.25 })
    expect(globusPackage(0.75, 'l')).toEqual({ unit: 'l', quantity: 0.75 })
    expect(globusPackage(40, 'dávka')).toEqual({ unit: 'ks', quantity: 40 })
    expect(globusPackage(3, 'balení')).toBeNull()
  })
})

describe('parseGlobusPageHashes / dedupeGlobusOffers', () => {
  it('finds each flyer page once, not its image sizes', () => {
    const html = 'x action-offers.globus.cz/02eb28682980a238b39e913ff210b2b8-770 y action-offers.globus.cz/02eb28682980a238b39e913ff210b2b8 z action-offers.globus.cz/031ebc43ea9e4f3e85622d11971ae14b-1218'
    expect(parseGlobusPageHashes(html)).toEqual(['02eb28682980a238b39e913ff210b2b8', '031ebc43ea9e4f3e85622d11971ae14b'])
  })

  it('keeps one offer per barcode and window, the cheaper', () => {
    const kept = dedupeGlobusOffers([coffee, { ...coffee, price: 429.9 }, { ...coffee, saleFrom: '2026-10-13', saleTo: '2026-10-19' }])
    expect(kept.map((offer) => [offer.price, offer.saleFrom])).toEqual([[429.9, '2026-09-23'], [449.9, '2026-10-13']])
  })
})
