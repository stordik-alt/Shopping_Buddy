import { describe, expect, it } from 'vitest'
import { generatePkdProductTypeCandidates, PKD_CANDIDATE_VERSION } from '@/lib/pkd-candidate-generation'

describe('generatePkdProductTypeCandidates', () => {
  it('creates one concrete candidate for equivalent unmapped retail identities and records provenance', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: ' Mléko ', language: 'cs', status: 'approved', sourceKind: 'open_food_facts' },
      { id: 'b', canonicalName: 'mléko', language: 'cs', status: 'candidate', sourceKind: 'seed_catalog' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      candidateKey: 'cs:mleko',
      normalizedName: 'mleko',
      canonicalName: 'Mléko',
      sourceEntryIds: ['a', 'b'],
      confidence: 0.9,
      candidateVersion: PKD_CANDIDATE_VERSION,
      evidence: {
        sourceEntryCount: 2,
        sourceKinds: ['open_food_facts', 'seed_catalog'],
        reason: 'unmapped_retail_product_identity',
      },
    })
    expect(result[0].evidence.approvedEntryCount).toBe(1)
  })

  it('never generates a candidate from mapped, rejected, inactive, or ineligible taxonomy entries', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: 'Máslo', language: 'cs', productTypeId: 'type-1', status: 'approved' },
      { id: 'b', canonicalName: 'Sýr', language: 'cs', status: 'rejected' },
      { id: 'c', canonicalName: 'Mléko', language: 'cs', status: 'inactive' },
      { id: 'd', canonicalName: 'Služby', language: 'cs', candidateEligible: false },
      { id: 'e', canonicalName: 'Těstoviny', language: 'cs', status: 'approved' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].candidateKey).toBe('cs:testoviny')
  })

  it('keeps different languages separate', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'cs', canonicalName: 'Mléko', language: 'cs' },
      { id: 'en', canonicalName: 'Milk', language: 'en' },
    ])

    expect(result.map((candidate) => candidate.candidateKey)).toEqual(['cs:mleko', 'en:milk'])
  })

  it('does not guess a candidate from empty names', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: '   ', language: 'cs' },
    ])

    expect(result).toEqual([])
  })
})
