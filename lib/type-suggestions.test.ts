import { describe, expect, it } from 'vitest'
import { MAX_TYPE_SUGGESTIONS, rankTypeSuggestions } from '@/lib/type-suggestions'

describe('rankTypeSuggestions', () => {
  it('ranks types by the summed similarity of the neighbours that carry them', () => {
    const ranked = rankTypeSuggestions([
      { typeKey: 'sunka', similarity: 0.5 },
      { typeKey: 'taveny-syr', similarity: 0.6 },
      { typeKey: 'sunka', similarity: 0.4 },
    ])
    expect(ranked.map((suggestion) => suggestion.key)).toEqual(['sunka', 'taveny-syr'])
  })

  it('offers nothing without neighbours or with no similarity', () => {
    expect(rankTypeSuggestions([])).toEqual([])
    expect(rankTypeSuggestions([{ typeKey: 'a', similarity: 0 }])).toEqual([])
  })

  it('drops a type backed by a negligible share of the evidence', () => {
    const ranked = rankTypeSuggestions([
      { typeKey: 'a', similarity: 0.9 },
      { typeKey: 'a', similarity: 0.9 },
      { typeKey: 'a', similarity: 0.9 },
      { typeKey: 'b', similarity: 0.3 },
    ])
    expect(ranked.map((suggestion) => suggestion.key)).toEqual(['a'])
  })

  it('offers at most three types and orders ties by key', () => {
    const ranked = rankTypeSuggestions(['d', 'c', 'b', 'a'].map((typeKey) => ({ typeKey, similarity: 0.5 })))
    expect(ranked).toHaveLength(MAX_TYPE_SUGGESTIONS)
    expect(ranked.map((suggestion) => suggestion.key)).toEqual(['a', 'b', 'c'])
  })
})
