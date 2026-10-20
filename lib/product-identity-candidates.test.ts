import { describe, expect, it } from 'vitest'
import {
  compareProductIdentityRecords,
  generateProductIdentityCandidates,
} from './product-identity-candidates'

describe('compareProductIdentityRecords', () => {
  it('scores formatting and diacritic differences as a review candidate', () => {
    const result = compareProductIdentityRecords(
      { retailer: 'TETA', sourceCode: '1', name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
      { retailer: 'OTHER', sourceCode: '2', name: 'SOMAT sul do mycky 1500 g', brand: 'SOMAT' },
    )
    expect(result.status).toBe('review_required')
    expect(result.evidence.brandAgreement).toBe(true)
    expect(result.evidence.packageQuantityAgreement).toBe(true)
    expect(result.score).toBeGreaterThan(0.3)
  })

  it('reduces score for a different package size', () => {
    const samePack = compareProductIdentityRecords(
      { name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
      { name: 'Somat sůl do myčky 1500 g', brand: 'Somat' },
    )
    const differentPack = compareProductIdentityRecords(
      { name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
      { name: 'Somat sůl do myčky 3 kg', brand: 'Somat' },
    )
    expect(differentPack.score).toBeLessThan(samePack.score)
    expect(differentPack.evidence.packageQuantityAgreement).toBe(false)
  })

  it('retains variant conflicts as explicit evidence', () => {
    const result = compareProductIdentityRecords(
      { name: 'Zewa Deluxe Delicate Care 8 ks', brand: 'Zewa' },
      { name: 'Zewa Deluxe Camomile Comfort 8 ks', brand: 'Zewa' },
    )
    expect(result.evidence.conflictingVariantTokens).toContain('delicate')
    expect(result.evidence.conflictingVariantTokens).toContain('camomile')
  })

  it('recognizes exact EAN but never auto-accepts a match', () => {
    const result = compareProductIdentityRecords(
      { name: 'Product A 500 ml', ean: '5901234123457' },
      { name: 'Different name 500 ml', ean: '5901234123457' },
    )
    expect(result.evidence.exactEan).toBe(true)
    expect(result.status).toBe('review_required')
  })
})

describe('generateProductIdentityCandidates', () => {
  it('does not compare the same retailer source identity with itself', () => {
    const results = generateProductIdentityCandidates([
      { retailer: 'TETA', sourceCode: '123', name: 'Somat 1 kg' },
      { retailer: 'teta', sourceCode: '123', name: 'Somat 1 kg' },
    ], { minimumScore: 0 })
    expect(results).toHaveLength(0)
  })

  it('returns deterministic, bounded review candidates', () => {
    const records = [
      { retailer: 'TETA', sourceCode: '1', name: 'Somat sůl 1,5 kg', brand: 'Somat' },
      { retailer: 'OTHER', sourceCode: '2', name: 'Somat sůl 1500 g', brand: 'Somat' },
      { retailer: 'OTHER', sourceCode: '3', name: 'Unrelated perfume 100 ml', brand: 'Other' },
    ]
    const results = generateProductIdentityCandidates(records, { minimumScore: 0.3, maxCandidates: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('review_required')
    expect(results[0].left.name).toContain('Somat')
  })
})
