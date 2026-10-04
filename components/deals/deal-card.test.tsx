import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DealCard } from '@/components/deals/deal-card'
import type { DealAssessment } from '@/lib/prices'

const assessment = (overrides: Partial<DealAssessment> = {}): DealAssessment => ({
  product: { productName: 'Kuřecí prsa 500 g', category: 'Potraviny', prices: [] },
  // Regular 100 Kč, deal 80 Kč (-20 %), regular unit price 50 Kč/kg → 40 Kč/kg at the deal price.
  price: { store: 'Lidl', regularPrice: 100, dealPrice: 80, unit: 'kg', unitPrice: 50, recordedAt: '2026-09-28' },
  isBestPrice: true,
  cheapestAlternative: null,
  recentLow: null,
  ...overrides,
})

function render(a: DealAssessment) {
  return renderToStaticMarkup(<DealCard assessment={a} isOnList={false} onAddToList={() => {}} pantryItems={[]} />)
}

describe('DealCard', () => {
  it('says the saving in money and, when known, the package size', () => {
    const html = render(assessment({ price: { store: 'Lidl', regularPrice: 100, dealPrice: 80, unit: 'kg', unitPrice: 50, recordedAt: '2026-09-28', packageSize: { quantity: 0.5, unit: 'kg', label: '500 g', source: 'catalog' } as never } }))
    expect(html).toContain('Ušetříte 20,00 Kč')
    expect(html).toContain('balení 500 g')
    expect(render(assessment())).not.toContain('balení')
  })


  it('shows the unit price scaled to the deal price, not the regular one', () => {
    const html = render(assessment())
    expect(html).toContain('40,00 Kč')
    expect(html).toContain('Kč/kg')
    expect(html).not.toContain('50,00 Kč/kg') // the regular price's own unit price, not the deal's
  })

  it('says nothing about the 30-day low with no history to compare against', () => {
    const html = render(assessment({ recentLow: null }))
    expect(html).not.toContain('Nejnižší cena za posledních 30 dní')
  })

  it("'unchanged': shows the low and that the price has not changed", () => {
    const html = render(assessment({ recentLow: { low: 89.9, status: 'unchanged' } }))
    expect(html).toContain('Nejnižší cena za posledních 30 dní')
    expect(html).toContain('Cena se nezměnila')
  })

  it("'at-low': shows the low and that today's price is currently the lowest", () => {
    const html = render(assessment({ recentLow: { low: 89.9, status: 'at-low' } }))
    expect(html).toContain('Aktuálně nejnižší cena za 30 dní')
  })

  it("'above-low': shows the low and how much more today's price is", () => {
    // Effective (deal) price is 80; a low of 75 within the window means today is 5 Kč above it.
    const html = render(assessment({ recentLow: { low: 75, status: 'above-low' } }))
    expect(html).toContain('Aktuálně o 5,00 Kč vyšší')
  })
})
