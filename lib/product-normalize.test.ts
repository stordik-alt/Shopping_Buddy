import { describe, expect, it } from 'vitest'
import { levenshteinDistance, normalizeProductText, similarity } from '@/lib/product-normalize'

describe('normalizeProductText', () => {
  it('treats case/diacritic/punctuation variants of the same word as equal', () => {
    // spec section 5: "JUPIK / JUPÍK / JUPIK." should be comparable. "JUP1K" (a digit/letter OCR
    // confusion) is deliberately NOT made equal here — see the fuzzy-matching test below for why.
    expect(normalizeProductText('JUPIK')).toBe(normalizeProductText('JUPÍK'))
    expect(normalizeProductText('JUPIK')).toBe(normalizeProductText('JUPIK.'))
  })

  it('collapses punctuation and duplicated spaces without destroying digits', () => {
    expect(normalizeProductText('  Máslo,  Jihočeské!! ')).toBe('maslo jihoceske')
    expect(normalizeProductText('MAT 1,5L')).toBe('mat 1 5l')
  })

  it('keeps a possessive "\'s" with its word, so it never reads as the Czech "s"', () => {
    expect(normalizeProductText("Nature's Promise Eidam")).toBe('natures promise eidam')
    expect(normalizeProductText('McLLOYD´S lupínky')).toBe('mclloyds lupinky')
    expect(normalizeProductText('Jogurt s jahodami')).toBe('jogurt s jahodami')
  })

  it('keeps quantity/volume digits, so different sizes stay distinguishable', () => {
    // CLAUDE.md section 12: "Milk 1L / Milk 500ml / Milk 2L must not be treated as equivalent".
    expect(normalizeProductText('Mattoni 1L')).not.toBe(normalizeProductText('Mattoni 2L'))
  })
})

describe('levenshteinDistance / similarity', () => {
  it('is 0 / 1 for identical strings', () => {
    expect(levenshteinDistance('mattoni', 'mattoni')).toBe(0)
    expect(similarity('mattoni', 'mattoni')).toBe(1)
  })

  it('scores a digit/letter OCR confusion as very close (handled by fuzzy matching, not normalization)', () => {
    // MATTON1 -> MATTONI: normalizeProductText deliberately keeps the digit as-is (see its doc
    // comment), so this one-substitution difference is caught by edit-distance similarity instead.
    const score = similarity(normalizeProductText('MATTON1'), normalizeProductText('MATTONI'))
    expect(score).toBeGreaterThan(0.8)
    expect(score).toBeLessThan(1)
  })

  it('scores a genuine single-character typo as very close but not identical', () => {
    const a = normalizeProductText('JUPIK')
    const b = normalizeProductText('JUPIG') // a real edit-distance-1 typo, not an OCR-mapped digit
    expect(similarity(a, b)).toBeGreaterThan(0.75)
    expect(similarity(a, b)).toBeLessThan(1)
  })

  it('scores unrelated words as far apart', () => {
    expect(similarity('mleko', 'sunka')).toBeLessThan(0.5)
  })
})
