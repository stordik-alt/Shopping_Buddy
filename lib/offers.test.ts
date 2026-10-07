import { describe, expect, it } from 'vitest'
import { EMPTY_STORE_SELECTION, type StoreSelection } from '@/lib/nearby-stores'
import { bestOfferByName, cheaperPromotion, offersForProduct, offerBeatsKnownPrices, nearbyOffers, offerUnitPriceLabel, shortOfferDate, type StandaloneOffer } from '@/lib/offers'
import type { ProductPrice } from '@/lib/prices'

const offer = (store: string, storeId: string, productName: string): StandaloneOffer => ({
  productName,
  category: 'Potraviny',
  store,
  storeId,
  dealPrice: 10,
  unit: null,
  unitPrice: null,
  validUntil: '2026-09-29',
})

const offers = [offer('Penny', 'penny', 'Pivo'), offer('Lidl', 'lidl', 'Žížalky'), offer('Penny', 'penny', 'Okurka')]

describe('nearbyOffers', () => {
  it('shows every offer when no stores are chosen, ordered by store then product', () => {
    expect(nearbyOffers(offers, EMPTY_STORE_SELECTION).map((o) => `${o.store}:${o.productName}`)).toEqual(['Lidl:Žížalky', 'Penny:Okurka', 'Penny:Pivo'])
  })

  it('keeps only offers of the chosen chains', () => {
    const selection: StoreSelection = { ...EMPTY_STORE_SELECTION, chainIds: ['penny'] }
    expect(nearbyOffers(offers, selection).map((o) => o.productName)).toEqual(['Okurka', 'Pivo'])
  })

  it('does not reorder or change the input list', () => {
    const input = [...offers]
    nearbyOffers(input, EMPTY_STORE_SELECTION)
    expect(input).toEqual(offers)
  })
})

describe('shortOfferDate', () => {
  it('prints day and month without leading zeros', () => {
    expect(shortOfferDate('2026-09-29')).toBe('29. 9.')
    expect(shortOfferDate('2027-01-03')).toBe('3. 1.')
  })
})

describe('offerUnitPriceLabel', () => {
  it('prints the unit price with its unit', () => {
    expect(offerUnitPriceLabel({ unit: 'kg', unitPrice: 169 })).toBe('169,00 Kč/kg')
    expect(offerUnitPriceLabel({ unit: 'ks', unitPrice: 15.9 })).toBe('15,90 Kč/ks')
  })

  it('brings per-gram and per-millilitre prices to a comparable kg / l', () => {
    expect(offerUnitPriceLabel({ unit: 'g', unitPrice: 0.169 })).toBe('169,00 Kč/kg')
    expect(offerUnitPriceLabel({ unit: 'ml', unitPrice: 0.05 })).toBe('50,00 Kč/l')
  })

  it('says nothing for an offer stored without a unit price, rather than inventing one', () => {
    expect(offerUnitPriceLabel({ unit: null, unitPrice: null })).toBeNull()
  })
})

// What a shopping-list item shows when the app has no regular price for its product (2026-10-07):
// the offer is a price the chain runs today, so the row and the item's detail state it as it is.
describe('offersForProduct', () => {
  const priced = (overrides: Partial<StandaloneOffer>): StandaloneOffer => ({ ...offer('Penny', 'penny', 'Máslo'), ...overrides })

  it('returns the product\'s offers cheapest first, matching case and surrounding spaces', () => {
    const all = [priced({ store: 'Penny', storeId: 'penny', dealPrice: 39.9 }), priced({ store: 'Albert', storeId: 'albert', dealPrice: 35 }), priced({ productName: 'Mléko' })]
    expect(offersForProduct(all, '  máslo ').map((entry) => `${entry.store}:${entry.dealPrice}`)).toEqual(['Albert:35', 'Penny:39.9'])
  })

  it('returns nothing for a product without an offer', () => {
    expect(offersForProduct(offers, 'Neznámé')).toEqual([])
  })
})

describe('bestOfferByName', () => {
  it('keeps the cheapest offer per product name, keyed case- and whitespace-insensitively', () => {
    const best = bestOfferByName([
      { ...offer('Penny', 'penny', 'Máslo'), dealPrice: 39.9 },
      { ...offer('Albert', 'albert', 'Máslo'), dealPrice: 35 },
      { ...offer('Lidl', 'lidl', 'Mléko'), dealPrice: 19.9 },
    ])
    expect(best.get('máslo')?.store).toBe('Albert')
    expect(best.get('mléko')?.store).toBe('Lidl')
    expect(best.get('neznámé')).toBeUndefined()
  })
})

describe('cheaperPromotion', () => {
  const deal = { store: 'Lidl', price: 30, validUntil: '2026-09-30' }
  const penny = { store: 'Penny', price: 25, validUntil: '2026-10-13' }

  it('shows the cheaper of a deal and an offer, either way round', () => {
    expect(cheaperPromotion(deal, penny)).toEqual(penny)
    expect(cheaperPromotion({ ...deal, price: 20 }, penny)).toEqual({ ...deal, price: 20 })
  })

  it('shows whichever exists alone, and nothing when neither does', () => {
    expect(cheaperPromotion(deal, null)).toEqual(deal)
    expect(cheaperPromotion(null, penny)).toEqual(penny)
    expect(cheaperPromotion(null, null)).toBeNull()
  })
})

describe('offerBeatsKnownPrices', () => {
  const product = (prices: ProductPrice['prices']): ProductPrice[] => [{ productName: 'Máslo', category: 'Potraviny', prices }]
  const point = (regularPrice: number, dealPrice?: number): ProductPrice['prices'][number] => ({
    store: 'Lidl',
    regularPrice,
    ...(dealPrice != null ? { dealPrice } : {}),
    unit: 'ks',
    unitPrice: regularPrice,
    recordedAt: '2026-10-07',
  })

  it('is true when nothing is known about the product: an offer-only chain\'s price is the only one', () => {
    expect(offerBeatsKnownPrices({ ...offer('Penny', 'penny', 'Máslo'), dealPrice: 39.9 }, [])).toBe(true)
  })

  it('compares with the price a shopper pays today, promotion included', () => {
    const offer39 = { ...offer('Penny', 'penny', 'Máslo'), dealPrice: 39.9 }
    expect(offerBeatsKnownPrices(offer39, product([point(45)]))).toBe(true)
    expect(offerBeatsKnownPrices(offer39, product([point(45, 35)]))).toBe(false)
    expect(offerBeatsKnownPrices({ ...offer39, dealPrice: 35 }, product([point(45, 35)]))).toBe(true)
  })
})
