import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RestockCard } from '@/components/dashboard/restock-card'
import { StockLevelsSettings } from '@/components/household/stock-levels-settings'
import type { RestockSuggestion } from '@/lib/pantry-restock'

const suggestion: RestockSuggestion = {
  levelId: 'l1', productTypeKey: 'maslo', typeName: 'Máslo', quantity: 1, unit: 'ks', minQuantity: 2, maxQuantity: 6, buyQuantity: 5,
  offer: { productId: 'p1', productName: 'Tatra máslo 250 g', productTypeKey: 'maslo', storeId: 's', chain: 'Albert', dealPrice: 45, unit: 'kg', unitPrice: 150, regularPrice: 60, validUntil: '2026-10-20', discount: 0.25 },
}

describe('RestockCard', () => {
  it('names the type, the cheapest variant and the amount to buy', () => {
    const html = renderToStaticMarkup(<RestockCard suggestions={[suggestion]} dismissed={[]} onDismiss={() => {}} listItemNames={[]} onAddToList={() => {}} />)
    expect(html).toContain('Máslo')
    expect(html).toContain('Nejlevnější: Tatra máslo 250 g')
    expect(html).toContain('Na seznam · 5 ks')
  })

  it('offers to hide the list and to refuse a suggestion', () => {
    const html = renderToStaticMarkup(<RestockCard suggestions={[suggestion]} dismissed={[]} onDismiss={() => {}} listItemNames={[]} onAddToList={() => {}} />)
    expect(html).toContain('Skrýt návrhy na doplnění zásob')
    expect(html).toContain('Odmítnout návrh: Máslo')
  })

  it("hides an offer the household refused, but not another one of the same type", () => {
    const refused = ['maslo:p1:2026-10-20']
    expect(renderToStaticMarkup(<RestockCard suggestions={[suggestion]} dismissed={refused} onDismiss={() => {}} listItemNames={[]} onAddToList={() => {}} />)).toBe('')
    const other = { ...suggestion, offer: { ...suggestion.offer, validUntil: '2026-10-27' } }
    expect(renderToStaticMarkup(<RestockCard suggestions={[other]} dismissed={refused} onDismiss={() => {}} listItemNames={[]} onAddToList={() => {}} />)).toContain('Máslo')
  })

  it('marks a variant already on the list', () => {
    const html = renderToStaticMarkup(<RestockCard suggestions={[suggestion]} dismissed={[]} onDismiss={() => {}} listItemNames={['tatra máslo 250 g']} onAddToList={() => {}} />)
    expect(html).toContain('Na seznamu')
  })
})

describe('StockLevelsSettings', () => {
  it('lists the watched types with their levels', () => {
    const html = renderToStaticMarkup(
      <StockLevelsSettings levels={[{ id: 'l1', productTypeKey: 'maslo', typeName: 'Máslo', minQuantity: 2, maxQuantity: 6, unit: 'ks' }]} onSave={async () => {}} onRemove={async () => {}} />,
    )
    expect(html).toContain('Hlídané zásoby')
    expect(html).toContain('Hlídáno druhů zboží: 1')
  })
})
