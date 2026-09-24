import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PriceComparison } from '@/components/shopping/price-comparison'
import type { ProductPrice } from '@/lib/prices'

const product = (prices: ProductPrice['prices']): ProductPrice[] => [{ productName: 'Mléko', category: 'Potraviny', prices }]
const point = (overrides: Partial<ProductPrice['prices'][number]> = {}): ProductPrice['prices'][number] => ({
  store: 'Billa',
  regularPrice: 45,
  unit: 'l',
  unitPrice: 45,
  recordedAt: '2026-09-24',
  ...overrides,
})

describe('PriceComparison old prices', () => {
  it('shows the old price with the date it was recorded and the date the change was seen', () => {
    const html = renderToStaticMarkup(
      <PriceComparison
        productName="Mléko"
        productPrices={product([
          point({
            priceHistory: [
              { price: 50, recordedAt: '2026-09-20', validUntil: '2026-09-24' },
              { price: 45, recordedAt: '2026-09-24', validUntil: null },
            ],
          }),
        ])}
      />,
    )
    expect(html).toContain('data-testid="old-price"')
    expect(html).toMatch(/Dříve\s+50,00\s+Kč/)
    expect(html).toContain('zaznamenáno 20. 9.')
    expect(html).toContain('změna 24. 9.')
    // The current price is still the headline figure.
    expect(html).toMatch(/45,00\s+Kč/)
  })

  it('omits the change date when the old price has no known end', () => {
    const html = renderToStaticMarkup(
      <PriceComparison
        productName="Mléko"
        productPrices={product([point({ priceHistory: [{ price: 50, recordedAt: '2026-09-20' }, { price: 45, recordedAt: '2026-09-24' }] })])}
      />,
    )
    expect(html).toContain('zaznamenáno 20. 9.')
    expect(html).not.toContain('změna')
  })

  it('shows no old-price line when the price has never changed', () => {
    const html = renderToStaticMarkup(
      <PriceComparison
        productName="Mléko"
        productPrices={product([point({ priceHistory: [{ price: 45, recordedAt: '2026-09-22' }, { price: 45, recordedAt: '2026-09-24' }] })])}
      />,
    )
    expect(html).not.toContain('old-price')
    expect(html).not.toContain('Dříve')
  })

  it('shows no old-price line for a product with a single observation', () => {
    const html = renderToStaticMarkup(<PriceComparison productName="Mléko" productPrices={product([point()])} />)
    expect(html).not.toContain('Dříve')
  })

  it('shows an old price per store, only where that store changed its price', () => {
    const html = renderToStaticMarkup(
      <PriceComparison
        productName="Mléko"
        productPrices={product([
          point({ store: 'Billa', regularPrice: 45, priceHistory: [{ price: 50, recordedAt: '2026-09-20', validUntil: '2026-09-24' }, { price: 45, recordedAt: '2026-09-24' }] }),
          point({ store: 'Penny', regularPrice: 40, unitPrice: 40, priceHistory: [{ price: 40, recordedAt: '2026-09-24' }] }),
        ])}
      />,
    )
    expect(html.match(/data-testid="old-price"/g)).toHaveLength(1)
  })

  it('renders nothing for an unknown product', () => {
    expect(renderToStaticMarkup(<PriceComparison productName="Neznámé" productPrices={product([point()])} />)).toBe('')
  })
})
