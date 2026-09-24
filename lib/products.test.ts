import { describe, expect, it } from 'vitest'
import { distinctProductName, matchProductByName, resolveProductForSku, type ProductCatalogEntry } from '@/lib/products'

const catalog: ProductCatalogEntry[] = [
  { id: '1', name: 'Mléko polotučné', category: 'Potraviny', defaultUnit: 'ks', defaultLocation: null },
  { id: '2', name: 'Toaletní papír', category: 'Drogerie', defaultUnit: 'ks', defaultLocation: 'Domácnost' },
]

describe('matchProductByName', () => {
  it('matches an exact name', () => {
    expect(matchProductByName(catalog, 'Mléko polotučné')).toEqual(catalog[0])
  })

  it('matches regardless of case', () => {
    expect(matchProductByName(catalog, 'mléko polotučné')).toEqual(catalog[0])
  })

  it('matches with surrounding whitespace trimmed', () => {
    expect(matchProductByName(catalog, '  Toaletní papír  ')).toEqual(catalog[1])
  })

  it('returns null for a name not in the catalog, rather than a near/fuzzy guess', () => {
    expect(matchProductByName(catalog, 'Mléko')).toBeNull()
    expect(matchProductByName(catalog, 'Mleko polotucne')).toBeNull()
  })

  it('returns null against an empty catalog', () => {
    expect(matchProductByName([], 'Mléko polotučné')).toBeNull()
  })
})

describe('distinctProductName', () => {
  it('appends the SKU, trimming the name', () => {
    expect(distinctProductName('  Tyčinka Corny Big ', '88-277335')).toBe('Tyčinka Corny Big (88-277335)')
  })
})

describe('resolveProductForSku', () => {
  const none = new Set<string>()

  it('attaches to a product of the same name that this source has not linked (cross-store or household name)', () => {
    expect(resolveProductForSku(catalog, 'Mléko polotučné', 'sku-1', none)).toEqual({ match: catalog[0], name: 'Mléko polotučné' })
    // Linked only to some other source's SKU is the same thing from this source's point of view.
    expect(resolveProductForSku(catalog, 'mléko polotučné', 'sku-1', new Set(['2']))).toMatchObject({ match: catalog[0] })
  })

  it('returns no match and the original name for a new name', () => {
    expect(resolveProductForSku(catalog, 'Něco nového', 'sku-1', none)).toEqual({ match: null, name: 'Něco nového' })
  })

  it('does not merge two SKUs of the same source: the second gets its own product name', () => {
    // Product 1 is already linked to another SKU of this source.
    expect(resolveProductForSku(catalog, 'Mléko polotučné', 'sku-2', new Set(['1']))).toEqual({ match: null, name: 'Mléko polotučné (sku-2)' })
  })

  it('finds the product it created for that SKU before, so a repeat is stable', () => {
    const withDistinct: ProductCatalogEntry[] = [...catalog, { id: '3', name: 'Mléko polotučné (sku-2)', category: 'Potraviny', defaultUnit: 'ks', defaultLocation: null }]
    expect(resolveProductForSku(withDistinct, 'Mléko polotučné', 'sku-2', new Set(['1']))).toEqual({ match: withDistinct[2], name: 'Mléko polotučné (sku-2)' })
  })

  it('gives three same-name SKUs three distinct products', () => {
    const names = ['sku-a', 'sku-b', 'sku-c'].map((sku) => resolveProductForSku(catalog, 'Mléko polotučné', sku, new Set(['1'])).name)
    expect(new Set(names).size).toBe(3)
  })
})
