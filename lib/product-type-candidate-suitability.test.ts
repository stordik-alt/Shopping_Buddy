import { describe, expect, it } from 'vitest'
import {
  getProductTypeCandidateReviewFlags,
  isSuitableCzechRetailProductTypeCandidate,
} from '@/lib/product-type-candidate-suitability'

describe('Product Type candidate suitability', () => {
  it.each([
    'Maloobchod s pohonnými hmotami',
    'Nespecializovaný velkoobchod',
    'Služby exteritoriálních organizací a institucí',
    'Interdisciplinární výzkum a vývoj',
    'Distribuce elektřiny',
    'Zprostředkování v oblasti ubytování',
    'Budovy bytové a nebytové, výstavba bytových a nebytových budov',
  ])('rejects activity/service taxonomy labels: %s', (name) => {
    expect(isSuitableCzechRetailProductTypeCandidate(name, 'cs')).toBe(false)
    expect(getProductTypeCandidateReviewFlags(name, 'cs')).toEqual(expect.arrayContaining([
      expect.stringMatching(/possible_(commercial_activity|service_or_activity)/),
    ]))
  })

  it.each([
    'Hnědé uhlí a lignit',
    'Dětské pleny',
    'Mléko polotučné',
    'Rozmnožovací materiál: živé rostliny, cibule, hlízy',
  ])('keeps Czech goods labels eligible for human review: %s', (name) => {
    expect(isSuitableCzechRetailProductTypeCandidate(name, 'cs')).toBe(true)
  })

  it('rejects non-Czech labels regardless of confidence', () => {
    expect(isSuitableCzechRetailProductTypeCandidate('Milk', 'en')).toBe(false)
    expect(getProductTypeCandidateReviewFlags('Milk', 'en')).toContain('not_czech')
  })
})
