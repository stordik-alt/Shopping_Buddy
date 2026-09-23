import { describe, expect, it } from 'vitest'
import { matchProductByName, type ProductCatalogEntry } from '@/lib/products'

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
