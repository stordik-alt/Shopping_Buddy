import { describe, expect, it } from 'vitest'
import { evaluateProductIdentityPairs } from './product-identity-evaluation'

describe('evaluateProductIdentityPairs', () => {
  it('reports confusion-matrix metrics and per-pair predictions', () => {
    const report = evaluateProductIdentityPairs([
      {
        id: 'same-normalized-pack',
        left: { name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
        right: { name: 'SOMAT sul do mycky 1500 g', brand: 'SOMAT' },
        expected: 'same_product',
      },
      {
        id: 'different-pack-size',
        left: { name: 'Somat sůl do myčky 1,5 kg', brand: 'Somat' },
        right: { name: 'Somat sůl do myčky 3 kg', brand: 'Somat' },
        expected: 'different_product',
      },
    ], 0.3)

    expect(report.total).toBe(2)
    expect(report.labelledSame).toBe(1)
    expect(report.labelledDifferent).toBe(1)
    expect(report.truePositive + report.falseNegative).toBe(1)
    expect(report.trueNegative + report.falsePositive).toBe(1)
    expect(report.results.map((result) => result.id)).toEqual([
      'same-normalized-pack',
      'different-pack-size',
    ])
    expect(report.results.every((result) => result.syntheticRight === false)).toBe(true)
  })

  it('rejects invalid thresholds and duplicate pair IDs', () => {
    expect(() => evaluateProductIdentityPairs([], 1.1)).toThrow(/threshold/)
    const pair = {
      id: 'duplicate',
      left: { name: 'Product A 500 ml' },
      right: { name: 'Product A 500 ml' },
      expected: 'same_product' as const,
    }
    expect(() => evaluateProductIdentityPairs([pair, pair])).toThrow(/Duplicate/)
  })

  it('returns null for metrics with a zero denominator', () => {
    const report = evaluateProductIdentityPairs([], 0.3)
    expect(report.accuracy).toBeNull()
    expect(report.precision).toBeNull()
    expect(report.recall).toBeNull()
    expect(report.specificity).toBeNull()
  })
})
