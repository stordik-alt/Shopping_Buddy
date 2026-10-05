import { describe, expect, it } from 'vitest'
import { MAX_DEALS_QUERY_LENGTH } from '@/lib/deals-browse'
import { MAX_PREFERENCE_TERMS, preferenceDealTerms } from '@/lib/preference-deals'

describe('preferenceDealTerms', () => {
  it('takes preferred products and brands as terms, excluded products apart', () => {
    expect(preferenceDealTerms({ preferredProducts: ['Ovesné vločky', 'Řecký jogurt'], preferredBrands: ['Milka'], excludedProducts: ['Energetické nápoje'] })).toEqual({
      preferred: ['Ovesné vločky', 'Řecký jogurt', 'Milka'],
      excluded: ['Energetické nápoje'],
    })
  })

  it('trims, drops empty and repeated terms (case ignored)', () => {
    expect(preferenceDealTerms({ preferredProducts: ['  máslo ', '', 'MÁSLO', 'kuřecí   prsa'], preferredBrands: ['Máslo'], excludedProducts: [' '] })).toEqual({
      preferred: ['máslo', 'kuřecí prsa'],
      excluded: [],
    })
  })

  it('caps the number and the length of terms', () => {
    const many = Array.from({ length: 30 }, (_, index) => `produkt ${index}`)
    const { preferred } = preferenceDealTerms({ preferredProducts: [...many, 'x'.repeat(200)], preferredBrands: [], excludedProducts: [] })
    expect(preferred).toHaveLength(MAX_PREFERENCE_TERMS)
    expect(preferenceDealTerms({ preferredProducts: ['x'.repeat(200)], preferredBrands: [], excludedProducts: [] }).preferred[0]).toHaveLength(MAX_DEALS_QUERY_LENGTH)
  })
})
