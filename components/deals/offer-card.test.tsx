import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OfferCard } from '@/components/deals/offer-card'
import type { StandaloneOffer } from '@/lib/offers'

// An offer of a retailer that publishes only its current offers: no regular price, so no discount and
// no comparison — but the product is one the app has, so it can go on the shopping list.
const offer: StandaloneOffer = {
  productName: 'Máslo 250 g',
  category: 'Potraviny',
  store: 'Penny',
  storeId: 'penny',
  dealPrice: 39.9,
  unit: 'kg',
  unitPrice: 159.6,
  validUntil: '2026-10-13',
}

describe('OfferCard', () => {
  it('shows the offer price and the offer\'s own unit price, and invents no discount', () => {
    const html = renderToStaticMarkup(<OfferCard offer={offer} isOnList={false} onAddToList={() => {}} />)
    expect(html).toContain('39,90 Kč')
    expect(html).toContain('159,60 Kč/kg')
    expect(html).toContain('akce do 13. 10.')
    expect(html).toContain('Penny')
    expect(html).not.toContain('%')
  })

  it('offers to put the product on the shopping list like any other', () => {
    const html = renderToStaticMarkup(<OfferCard offer={offer} isOnList={false} onAddToList={() => {}} />)
    expect(html).toContain('Na seznam')
    expect(html).toContain('Přidat Máslo 250 g na nákupní seznam')
  })

  it('says the product is already on the list instead', () => {
    const html = renderToStaticMarkup(<OfferCard offer={offer} isOnList onAddToList={() => {}} />)
    expect(html).toContain('Na seznamu')
    expect(html).not.toContain('Přidat')
  })

  it('leaves the action out where there is nothing to add (Domů shows only what is already listed)', () => {
    const html = renderToStaticMarkup(<OfferCard offer={offer} />)
    expect(html).not.toContain('Na seznam')
  })
})
