import { describe, expect, it } from 'vitest'
import { EMPTY_STORE_SELECTION, type StoreSelection } from '@/lib/nearby-stores'
import { nearbyOffers, offerUnitPriceLabel, shortOfferDate, type StandaloneOffer } from '@/lib/offers'

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
