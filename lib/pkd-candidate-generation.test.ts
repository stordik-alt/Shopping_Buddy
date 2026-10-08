import { describe, expect, it } from 'vitest'
import { generatePkdProductTypeCandidates, PKD_CANDIDATE_VERSION } from '@/lib/pkd-candidate-generation'

describe('generatePkdProductTypeCandidates', () => {
  it('creates one candidate for equivalent unmapped PKD identities', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: ' Mléko ', language: 'cs', status: 'approved' },
      { id: 'b', canonicalName: 'mléko', language: 'cs', status: 'candidate' },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      candidateKey: 'cs:mleko',
      normalizedName: 'mleko',
      canonicalName: 'Mléko',
      sourceEntryIds: ['a', 'b'],
      confidence: 0.9,
      candidateVersion: PKD_CANDIDATE_VERSION,
    })
    expect(result[0].evidence.approvedEntryCount).toBe(1)
  })

  it('never generates a candidate from an already mapped or rejected entry', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: 'Máslo', language: 'cs', productTypeId: 'type-1', status: 'approved' },
      { id: 'b', canonicalName: 'Sýr', language: 'cs', status: 'rejected' },
      { id: 'c', canonicalName: 'Těstoviny', language: 'cs', status: 'approved' },
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
