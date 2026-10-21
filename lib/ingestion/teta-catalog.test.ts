import { describe, expect, it } from 'vitest'
import {
  mergeTetaCatalogProducts,
  parseTetaPackageText,
  resolveTetaPackage,
  resolveTetaUnitPrice,
  tetaCatalogFromDetail,
  tetaCatalogFromListing,
  tetaCatalogFromListingPayload,
  tetaCatalogName,
  tetaPackageSignature,
} from '@/lib/ingestion/teta-catalog'
import { parseTetaDetailPayload, parseTetaListingPayload } from '@/lib/ingestion/teta-payload'
import { tetaDetailFixtureHtml, tetaListingFixtureHtml } from '@/lib/ingestion/fixtures/teta-payload-fixture'

describe('Teta package text', () => {
  it('reads a piece count as the package', () => {
    expect(parseTetaPackageText('100 ks')).toEqual({
      quantity: 100,
      unit: 'ks',
      packageCount: 100,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    })
  })

  it('normalizes a volume to litres and a weight to kilograms', () => {
    expect(parseTetaPackageText('250 ml')).toEqual({ quantity: 0.25, unit: 'l' })
    expect(parseTetaPackageText('500 g')).toEqual({ quantity: 0.5, unit: 'kg' })
    expect(parseTetaPackageText('1,5 l')).toEqual({ quantity: 1.5, unit: 'l' })
    expect(parseTetaPackageText('2,5 kg')).toEqual({ quantity: 2.5, unit: 'kg' })
  })

  it('reads a multipack as the total size with the inner size kept', () => {
    expect(parseTetaPackageText('6 x 1 l')).toEqual({
      quantity: 6,
      unit: 'l',
      packageCount: 6,
      packageUnitQuantity: 1,
      packageUnit: 'l',
    })
    expect(parseTetaPackageText('8 x 100 g')).toEqual({
      quantity: 0.8,
      unit: 'kg',
      packageCount: 8,
      packageUnitQuantity: 0.1,
      packageUnit: 'kg',
    })
  })

  it('refuses text without a quantity', () => {
    expect(parseTetaPackageText('balení')).toBeNull()
    expect(parseTetaPackageText(undefined)).toBeNull()
  })
})

describe('Teta unit price', () => {
  it('keeps a price per piece as a price per piece', () => {
    expect(resolveTetaUnitPrice(17.9, { amount: 0.18, unit: 'KS' }, null)).toEqual({
      unit: 'ks',
      unitPrice: 0.18,
    })
  })

  it('agrees with the stated package size', () => {
    const packageSize = { quantity: 100, unit: 'ks' as const }
    const resolved = resolveTetaUnitPrice(17.9, { amount: 0.18, unit: 'KS' }, packageSize)
    expect(resolved.warning).toBeUndefined()
  })

  it('flags a unit price that contradicts the package size instead of picking one', () => {
    const packageSize = { quantity: 100, unit: 'ks' as const }
    const resolved = resolveTetaUnitPrice(17.9, { amount: 0.5, unit: 'KS' }, packageSize)
    expect(resolved.warning).toBe('unit-price-disagrees-with-package')
    // The stated unit price is kept — it is what the shop shows.
    expect(resolved.unitPrice).toBe(0.5)
  })

  it('falls back to the package price for a unit the app cannot compare', () => {
    const resolved = resolveTetaUnitPrice(45.9, { amount: 4.59, unit: 'M' }, null)
    expect(resolved.unit).toBe('ks')
    expect(resolved.unitPrice).toBe(45.9)
    expect(resolved.warning).toBe('unsupported-unit-price:M')
  })

  it('uses the package size for a unit the app cannot compare', () => {
    // Teta quotes kitchen rolls per metre; the app compares per piece, and the package says how
    // many rolls there are: 59,90 Kč for 8 rolls is 7,49 Kč per roll.
    const resolved = resolveTetaUnitPrice(59.9, { amount: 0.38795, unit: 'M' }, { quantity: 8, unit: 'ks' })
    expect(resolved.unit).toBe('ks')
    expect(resolved.unitPrice).toBeCloseTo(7.49, 2)
    expect(resolved.warning).toBe('unsupported-unit-price:M')
  })

  it('reads a price per litre and a price per dose', () => {
    expect(resolveTetaUnitPrice(99.9, { amount: 1332, unit: 'LIT' }, null)).toEqual({
      unit: 'l',
      unitPrice: 1332,
    })
    expect(resolveTetaUnitPrice(399, { amount: 3.99, unit: 'PD' }, null)).toEqual({
      unit: 'dávka',
      unitPrice: 3.99,
    })
  })

  it('uses the package size to tell "per 100 g" from "per gram"', () => {
    // 250 g of a product at 50 Kč is 200 Kč/kg; a price of 20 Kč per 100 g agrees with that.
    expect(resolveTetaUnitPrice(50, { amount: 20, unit: 'G' }, { quantity: 0.25, unit: 'kg' })).toEqual({
      unit: 'kg',
      unitPrice: 200,
    })
    // A price of 0.2 Kč per gram is the same number per 100 g, scaled.
    expect(resolveTetaUnitPrice(50, { amount: 0.2, unit: 'G' }, { quantity: 0.25, unit: 'kg' })).toEqual({
      unit: 'kg',
      unitPrice: 200,
    })
  })

  it('falls back to the package price when the product states no unit price', () => {
    expect(resolveTetaUnitPrice(59.9, undefined, null)).toEqual({ unit: 'ks', unitPrice: 59.9 })
  })
})

describe('Teta catalog product', () => {
  const listing = parseTetaListingPayload(tetaListingFixtureHtml())
  const detail = parseTetaDetailPayload(tetaDetailFixtureHtml())

  it('normalizes a real listing product', () => {
    const item = listing.items.find((entry) => entry.articleNumber === '196442')
    expect(item).toBeDefined()
    const product = tetaCatalogFromListing(item!)
    expect(product).not.toBeNull()
    expect(product!.externalId).toBe('000000000196442')
    expect(product!.name).toBe('Tip Line kosmetické kapesníky 2vrstvé 100 ks')
    expect(product!.brand).toBe('Tip Line')
    // The payload holds 1790 haléře; the catalog holds 17,90 Kč.
    expect(product!.price).toBeCloseTo(17.9, 2)
    expect(product!.unit).toBe('ks')
    expect(product!.unitPrice).toBeCloseTo(0.18, 2)
    // "Hygiena" is a drogerie category.
    expect(product!.category).toBe('Drogerie')
    // Teta names the top-level taxon in upper case in the product's own taxon list ("HYGIENA"),
    // while the menu uses the slug ("hygiena"). The lookup is case-insensitive.
    expect(product!.categoryCodes[0]).toBe('HYGIENA')
  })

  it('normalizes a real product page, with the package its attributes state', () => {
    const product = tetaCatalogFromDetail(detail)
    expect(product).not.toBeNull()
    expect(product!.externalId).toBe('000000000196442')
    expect(product!.brand).toBe('Tip Line')
    expect(product!.package).toEqual({
      quantity: 100,
      unit: 'ks',
      packageCount: 100,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    })
    expect(product!.packageText).toBe('100 ks')
    expect(product!.category).toBe('Drogerie')
  })

  it('keeps the everyday price of a discounted product and scales its unit price', () => {
    const item = listing.items.find((entry) => entry.articleNumber === '151261')
    const product = tetaCatalogFromListing(item!)
    // The action price is what the shopper pays; the everyday price is the base price it
    // discounts.
    expect(product!.price).toBeCloseTo(59.9, 2)
    expect(product!.regularPrice).toBeCloseTo(69.9, 2)
    expect(product!.discountPercent).toBe(14)
    // The unit price of the everyday price follows the same ratio as the package price.
    expect(product!.regularUnitPrice).toBeCloseTo(product!.unitPrice * (69.9 / 59.9), 2)
  })

  it('refuses a product without an identity or without a price', () => {
    const item = listing.items[0]
    expect(tetaCatalogFromListing({ ...item, code: '' })).toBeNull()
    expect(tetaCatalogFromListing({ ...item, name: '   ' })).toBeNull()
    expect(tetaCatalogFromListing({ ...item, price: { ...item.price, amount: 0 } })).toBeNull()
  })

  it('reads every product of a listing page', () => {
    const products = tetaCatalogFromListingPayload(listing)
    expect(products).toHaveLength(listing.items.length)
    expect(products.every((product) => product.category !== null)).toBe(true)
  })
})

describe('Teta package attributes', () => {
  it('reads the package content and the piece count', () => {
    const facts = resolveTetaPackage([
      { code: 'OBSAH_BALENI', name: 'Obsah balení', value: '250 ml' },
      { code: 'POCET_JEDNOTEK_V_BALENI', name: 'Počet jednotek v balení', value: '2' },
    ])
    expect(facts.package).toEqual({
      quantity: 0.25,
      unit: 'l',
      packageCount: 2,
      packageUnitQuantity: 1,
      packageUnit: 'ks',
    })
    expect(facts.warnings).toEqual([])
  })

  it('flags a piece count that contradicts the stated content', () => {
    const facts = resolveTetaPackage([
      { code: 'OBSAH_BALENI', name: 'Obsah balení', value: '100 ks' },
      { code: 'POCET_JEDNOTEK_V_BALENI', name: 'Počet jednotek v balení', value: '60' },
    ])
    expect(facts.warnings).toContain('package-unit-count-disagrees')
  })

  it('builds a stable package signature', () => {
    expect(tetaPackageSignature({ quantity: 100, unit: 'ks' })).toBe('100ks')
    expect(tetaPackageSignature({ quantity: 6, unit: 'l', packageCount: 6 })).toBe('6x6l')
    expect(tetaPackageSignature(null)).toBeNull()
  })
})

describe('Teta catalog naming', () => {
  it('puts the brand in front of a name that does not start with it', () => {
    expect(tetaCatalogName('Creme', 'Nivea')).toBe('Nivea Creme')
    expect(tetaCatalogName('Nivea Creme', 'Nivea')).toBe('Nivea Creme')
    expect(tetaCatalogName('Creme', undefined)).toBe('Creme')
  })
})

describe('Teta listing and product page together', () => {
  it('keeps what each side knows', () => {
    const listing = parseTetaListingPayload(tetaListingFixtureHtml())
    const detail = parseTetaDetailPayload(tetaDetailFixtureHtml())
    const item = listing.items.find((entry) => entry.articleNumber === '196442')!
    const merged = mergeTetaCatalogProducts(tetaCatalogFromListing(item), tetaCatalogFromDetail(detail))
    expect(merged).not.toBeNull()
    // The product page knows the package, the listing does not.
    expect(merged!.package?.quantity).toBe(100)
    expect(merged!.price).toBeCloseTo(17.9, 2)
    expect(merged!.available).toBe(true)
    // The unit price is a price per piece: the product page's package makes that possible.
    expect(merged!.unit).toBe('ks')
    expect(merged!.unitPrice).toBeCloseTo(0.18, 2)
  })
})
