import { describe, expect, it } from 'vitest'
import {
  canApproveProductSubtypeCandidate,
  deduplicateProductSubtypeCandidates,
  normalizeProductSubtypeCandidate,
  normalizeSubtypeLabel,
  type ProductSubtypeCandidateInput,
} from '@/lib/product-subtype-candidates'

const candidate = (overrides: Partial<ProductSubtypeCandidateInput> = {}): ProductSubtypeCandidateInput => ({
  parentTypeKey: 'voda',
  name: 'Voda s příchutí melounu',
  sourceType: 'retailer' as const,
  sourceName: 'Test řetězec',
  sourceRecordIds: ['sku-1'],
  ...overrides,
})

describe('Product Subtype candidate workflow', () => {
  it('normalizes accents and punctuation deterministically', () => {
    expect(normalizeSubtypeLabel('  VODA s příchutí-melounu  ')).toBe('voda s prichuti melounu')
    expect(normalizeProductSubtypeCandidate(candidate()).candidateKey).toBe('voda-voda-s-prichuti-melounu')
  })

  it('deduplicates equivalent names under the same parent and merges source evidence', () => {
    const results = deduplicateProductSubtypeCandidates([
      candidate({ name: 'Voda s příchutí melounu', sourceRecordIds: ['sku-1'], evidence: { chain: 'A' } }),
      candidate({ name: ' voda  s prichuti melounu ', sourceRecordIds: ['sku-2'], evidence: { chain: 'B' } }),
    ])
    expect(results).toHaveLength(1)
    expect(results[0].sourceRecordIds).toEqual(['sku-1', 'sku-2'])
    expect(results[0].evidence.records).toHaveLength(2)
  })

  it('does not deduplicate the same label across different parent types', () => {
    const results = deduplicateProductSubtypeCandidates([
      candidate({ parentTypeKey: 'voda' }),
      candidate({ parentTypeKey: 'sirup' }),
    ])
    expect(results).toHaveLength(2)
  })

  it('requires an explicit definition and both inclusion and exclusion boundaries before approval', () => {
    const normalized = normalizeProductSubtypeCandidate(candidate())
    expect(canApproveProductSubtypeCandidate(normalized)).toEqual({
      approved: false,
      missing: [
        'definition (at least 20 characters)',
        'at least one includes example/boundary',
        'at least one excludes example/boundary',
      ],
    })
    expect(canApproveProductSubtypeCandidate({
      ...normalized,
      definition: 'Voda s přidanou příchutí, prodávaná jako nealkoholický nápoj.',
      includes: ['voda s melounovou příchutí'],
      excludes: ['sirup k ředění'],
    })).toEqual({ approved: true })
  })

  it('rejects invalid source names and empty labels', () => {
    expect(() => normalizeProductSubtypeCandidate(candidate({ name: '   ' }))).toThrow('non-empty subtype name')
    expect(() => normalizeProductSubtypeCandidate(candidate({ sourceName: ' ' }))).toThrow('sourceName')
  })
})
