import { describe, expect, it } from 'vitest'
import { generateCrossRetailerCandidates } from './product-identity-cross-retailer'

describe('generateCrossRetailerCandidates', () => {
  it('returns only pairs across the two requested retailers', () => {
    const results = generateCrossRetailerCandidates([
      { retailer: 'TETA', sourceCode: 't1', name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
      { retailer: 'TETA', sourceCode: 't2', name: 'Somat sůl do myčky 3 kg', brand: 'Somat' },
      { retailer: 'DM', sourceCode: 'd1', name: 'Somat sul do mycky 1500 g', brand: 'Somat' },
      { retailer: 'DM', sourceCode: 'd2', name: 'Unrelated perfume 100 ml', brand: 'Other' },
    ], { leftRetailer: 'TETA', rightRetailer: 'DM', minimumScore: 0, maxCandidates: 10 })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((item) => item.left.retailer === 'TETA' && item.right.retailer === 'DM')).toBe(true)
    expect(results.every((item) => item.status === 'review_required')).toBe(true)
    expect(results.some((item) => item.left.sourceCode === 't1' && item.right.sourceCode === 'd1')).toBe(true)
  })

  it('rejects the same retailer on both sides', () => {
    expect(() => generateCrossRetailerCandidates([], {
      leftRetailer: 'dm', rightRetailer: 'DM',
    })).toThrow(/two different retailers/)
  })

  it('returns no more than the configured maximum', () => {
    const results = generateCrossRetailerCandidates([
      { retailer: 'TETA', name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
      { retailer: 'DM', name: 'Somat sůl do myčky 1500 g', brand: 'Somat' },
      { retailer: 'DM', name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
    ], { leftRetailer: 'TETA', rightRetailer: 'DM', minimumScore: 0, maxCandidates: 1 })
    expect(results).toHaveLength(1)
  })
})
