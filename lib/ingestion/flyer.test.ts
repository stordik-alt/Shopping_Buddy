import { describe, expect, it } from 'vitest'
import { displayCase, parseFlyerUnitPrice, unitPriceAfterName, unitPricesOnPage, validateFlyerOffer, type ExtractedOffer, type FlyerRawOffer } from '@/lib/ingestion/flyer'

// The shared flyer rules as Penny prints its offers (Albert's are covered in albert.test.ts).
// Text cut from Penny's week-39 flyer, page 3.
const PAGE_TEXT = '< Nejnižší cena za posledních 30 dní 8,90 11,90/ 25% ŠKVARKOVÝ PAGÁČ* ze zmrazeného polotovaru | 65 g 100 g 13,69 Kč 249,-'

function raw(offer: Partial<ExtractedOffer>): FlyerRawOffer {
  return {
    offer: {
      brand: null,
      name: 'ŠKVARKOVÝ PAGÁČ',
      packageSize: '65 g',
      offerPrice: 8.9,
      regularPrice: 11.9,
      discountPercent: 25,
      unitPriceText: '100 g 13,69 Kč',
      condition: 'none',
      selectedVariants: false,
      ownValidity: null,
      category: 'Potraviny',
      ...offer,
    },
    flyerId: '23_09_2026_cz',
    pageNumber: 3,
    pageText: PAGE_TEXT,
    validFrom: '2026-09-23',
    validUntil: '2026-09-29',
  }
}

describe('parseFlyerUnitPrice', () => {
  it('reads a unit price printed without "=" (Penny)', () => {
    expect(parseFlyerUnitPrice('100 g 9,89 Kč')).toEqual({ unit: 'kg', unitPrice: 98.9 })
    expect(parseFlyerUnitPrice('1 kg 47,80 Kč')).toEqual({ unit: 'kg', unitPrice: 47.8 })
  })

  it('does not read two unit prices for two sizes as one', () => {
    expect(parseFlyerUnitPrice('1 kg 177,67/188,12 Kč')).toBeNull()
  })
})

describe('displayCase', () => {
  it('writes a name printed in capitals the way the catalog does', () => {
    expect(displayCase('ŠKVARKOVÝ PAGÁČ')).toBe('Škvarkový pagáč')
    expect(displayCase('PERLA')).toBe('Perla')
  })

  it('keeps a name with any lower-case letter as printed', () => {
    expect(displayCase('Jihočeský eidam 30%')).toBe('Jihočeský eidam 30%')
    expect(displayCase('Lindt PREMIUM')).toBe('Lindt PREMIUM')
    expect(displayCase('7')).toBe('7')
  })
})

describe('validateFlyerOffer on a Penny offer', () => {
  it('accepts an offer the page confirms, named the catalog way', () => {
    const result = validateFlyerOffer(raw({}), '2026-09-26')
    expect('product' in result && result.product).toMatchObject({
      name: 'Škvarkový pagáč 65 g',
      regularPrice: 11.9,
      deal: { dealPrice: 8.9, unitPrice: 136.92, validFrom: '2026-09-23', validUntil: '2026-09-29' },
    })
    // The identity ignores case, so a later all-caps or mixed-case reading is the same product.
    expect('product' in result && result.product.externalId).toBe('v1||skvarkovy pagac|0.065kg|')
  })

  it('rejects a price the page does not print', () => {
    expect(validateFlyerOffer(raw({ offerPrice: 7.9 }), '2026-09-26')).toEqual({ rejected: 'offer price 7.9 not on the page' })
  })

  it('rejects a "price when buying the pack" offer', () => {
    expect(validateFlyerOffer(raw({ condition: 'multi_buy' }), '2026-09-26')).toEqual({ rejected: 'condition: multi_buy' })
  })
})

describe('unitPricesOnPage', () => {
  it('finds every unit price printed on a page, with or without "="', () => {
    expect(unitPricesOnPage('ŠKVARKOVÝ PAGÁČ | 65 g 100 g 10,62 Kč CROISSANT | 5x 48 g 1 kg 166,25 Kč Monster 0,5 l • 1 l = 53,80 Kč')).toEqual([
      { unit: 'kg', unitPrice: 106.2 },
      { unit: 'kg', unitPrice: 166.25 },
      { unit: 'l', unitPrice: 53.8 },
    ])
  })

  it('leaves out two prices for two sizes', () => {
    expect(unitPricesOnPage('MEDOVNÍK 900/850 g 1 kg 177,67/188,12 Kč')).toEqual([])
  })
})

describe('validateFlyerOffer with unitPriceOnPage (Penny)', () => {
  it('rejects an offer whose own unit price is not printed on the page, even with a matching discount', () => {
    // The trial run's case: 9,90 Kč (dříve 12,90, -23 %) paired with a 190 g cheese — 52 Kč/kg, not on the page.
    const text = '9,90 12,90/ 23% POLOOŠTĚPEK 190 g 100 g 21,00 Kč'
    const offer = raw({ name: 'POLOOŠTĚPEK', packageSize: '190 g', offerPrice: 9.9, regularPrice: 12.9, discountPercent: 23, unitPriceText: null })
    expect(validateFlyerOffer({ ...offer, pageText: text }, '2026-09-26', { unitPriceOnPage: true })).toEqual({ rejected: 'unit price 52.11 Kč/kg is not the 210 Kč/kg printed with the name' })
    // Without the option (Albert) the discount alone still confirms it.
    expect('product' in validateFlyerOffer({ ...offer, pageText: text }, '2026-09-26')).toBe(true)
  })

  it('rejects a price that fits another product of the same size (prices swapped between two 150 g products)', () => {
    // The trial run's second case: 59,90 Kč / 150 g = 39,93 Kč per 100 g is printed on the page — for the cheese, not the dessert.
    const text = '59,90 79,90/ 25% 12,90 16,90/ 24% DEZERT ZE ZAKYSANÉ SMETANY 150 g 100 g 8,60 Kč TYLŽSKÝ SÝR PLÁTKY 150 g 100 g 39,93 Kč'
    const dessert = raw({ name: 'DEZERT ZE ZAKYSANÉ SMETANY', packageSize: '150 g', offerPrice: 59.9, regularPrice: 79.9, discountPercent: 25, unitPriceText: null })
    expect(validateFlyerOffer({ ...dessert, pageText: text }, '2026-09-26', { unitPriceOnPage: true })).toEqual({
      rejected: 'unit price 399.33 Kč/kg is not the 86 Kč/kg printed with the name',
    })
    const cheese = raw({ name: 'Tylžský sýr plátky', packageSize: '150 g', offerPrice: 59.9, regularPrice: 79.9, discountPercent: 25, unitPriceText: null })
    expect('product' in validateFlyerOffer({ ...cheese, pageText: text }, '2026-09-26', { unitPriceOnPage: true })).toBe(true)
  })

  it('rejects a name the page does not print', () => {
    expect(validateFlyerOffer(raw({ name: 'Něco jiného' }), '2026-09-26', { unitPriceOnPage: true })).toEqual({ rejected: 'no unit price printed after the name on the page' })
  })

  it('accepts an offer whose unit price the page prints', () => {
    expect('product' in validateFlyerOffer(raw({}), '2026-09-26', { unitPriceOnPage: true })).toBe(true)
  })

  it('rejects an offer without a package size, which cannot be checked', () => {
    expect(validateFlyerOffer(raw({ packageSize: null }), '2026-09-26', { unitPriceOnPage: true })).toEqual({ rejected: 'no package size to check against the unit prices on the page' })
  })
})

describe('unitPriceAfterName', () => {
  const text = 'ŠKVARKOVÝ PAGÁČ* ze zmrazeného polotovaru | 65 g 100 g 10,62 Kč KAPSIČKA* s jablečno-vanilkovou příchutí | 75 g 100 g 11,87 Kč'

  it('is the first unit price after the name, found whatever the case and accents', () => {
    expect(unitPriceAfterName(text, 'Kapsička')).toEqual({ unit: 'kg', unitPrice: 118.7 })
    expect(unitPriceAfterName(text, 'Skvarkovy pagac')).toEqual({ unit: 'kg', unitPrice: 106.2 })
  })

  it('is null when the name is not printed, or only inside another word', () => {
    expect(unitPriceAfterName(text, 'Croissant')).toBeNull()
    expect(unitPriceAfterName(text, 'pagá')).toBeNull()
  })
})

describe('the display name', () => {
  it('drops the footnote star, which the identity ignores anyway', () => {
    const result = validateFlyerOffer(raw({ name: 'ŠKVARKOVÝ PAGÁČ*' }), '2026-09-26')
    expect('product' in result && result.product.name).toBe('Škvarkový pagáč 65 g')
    expect('product' in result && result.product.externalId).toBe('v1||skvarkovy pagac|0.065kg|')
  })
})
