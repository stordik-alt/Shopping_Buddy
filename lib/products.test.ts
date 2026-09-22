import { describe, expect, it } from 'vitest'
import { matchProductByName, type ProductCatalogEntry } from '@/lib/products'

const catalog: ProductCatalogEntry[] = [
  { id: '1', name: 'Mléko polotučné', category: 'Potraviny' },
  { id: '2', name: 'Toaletní papír', category: 'Drogerie' },
]

describe('matchProductByName', () => {
  it('matches an exact name', () => {
    expect(matchProductByName(catalog, 'Mléko polotučné')).toEqual({ id: '1', name: 'Mléko polotučné', category: 'Potraviny' })
  })

  it('matches regardless of case', () => {
    expect(matchProductByName(catalog, 'mléko polotučné')).toEqual({ id: '1', name: 'Mléko polotučné', category: 'Potraviny' })
  })

  it('matches with surrounding whitespace trimmed', () => {
    expect(matchProductByName(catalog, '  Toaletní papír  ')).toEqual({ id: '2', name: 'Toaletní papír', category: 'Drogerie' })
  })

  it('returns null for a name not in the catalog, rather than a near/fuzzy guess', () => {
    expect(matchProductByName(catalog, 'Mléko')).toBeNull()
    expect(matchProductByName(catalog, 'Mleko polotucne')).toBeNull()
  })

  it('returns null against an empty catalog', () => {
    expect(matchProductByName([], 'Mléko polotučné')).toBeNull()
  })
})
