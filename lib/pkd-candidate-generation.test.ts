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
      confidence: 0.7,
      candidateVersion: PKD_CANDIDATE_VERSION,
      evidence: {
        sourceEntryCount: 2,
        sourceKinds: ['open_food_facts', 'seed_catalog'],
        reason: 'unmapped_retail_product_identity',
      },
    })
    expect(result[0].evidence.approvedEntryCount).toBe(1)
  })

  it('merges case and diacritic variants into one stable candidate regardless of input order', () => {
    const first = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: 'PAPRIKA', language: 'cs', status: 'candidate' },
      { id: 'b', canonicalName: 'Paprika', language: 'cs', status: 'approved' },
      { id: 'c', canonicalName: 'paprika', language: 'cs', status: 'approved' },
    ])
    const reversed = generatePkdProductTypeCandidates([
      { id: 'c', canonicalName: 'paprika', language: 'cs', status: 'approved' },
      { id: 'b', canonicalName: 'Paprika', language: 'cs', status: 'approved' },
      { id: 'a', canonicalName: 'PAPRIKA', language: 'cs', status: 'candidate' },
    ])

    expect(first).toHaveLength(1)
    expect(first[0].candidateKey).toBe('cs:paprika')
    expect(first[0].sourceEntryIds).toEqual(['a', 'b', 'c'])
    expect(first[0].canonicalName).toBe(reversed[0].canonicalName)
    expect(first[0].sourceEntryIds).toEqual(reversed[0].sourceEntryIds)
  })

  it('does not propose a candidate when an existing Product Type differs only by case or accents', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: 'PAPRIKA', language: 'cs', status: 'approved' },
      { id: 'b', canonicalName: 'KEFIR', language: 'cs', status: 'approved' },
      { id: 'c', canonicalName: 'Máslo', language: 'cs', status: 'approved' },
    ], ['Paprika', 'Kefír'])

    expect(result.map((candidate) => candidate.candidateKey)).toEqual(['cs:maslo'])
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

  it('filters obvious taxonomy group labels and marks weak or region-specific evidence for review', () => {
    const result = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: 'Slazené nápoje', language: 'cs', status: 'approved', sourceKind: 'open_food_facts' },
      { id: 'b', canonicalName: 'Variety packy svačin', language: 'cs', status: 'approved', sourceKind: 'open_food_facts' },
      { id: 'c', canonicalName: 'Znojemské pivo', language: 'cs', status: 'approved', sourceKind: 'open_food_facts' },
      { id: 'd', canonicalName: 'Ajvar', language: 'cs', status: 'approved', sourceKind: 'open_food_facts' },
    ])

    expect(result.map((candidate) => candidate.canonicalName)).toEqual(['Ajvar', 'Znojemské pivo'])
    expect(result.find((candidate) => candidate.canonicalName === 'Znojemské pivo')?.evidence.reviewFlags)
      .toContain('possible_region_or_named_variant')
    expect(result.find((candidate) => candidate.canonicalName === 'Ajvar')?.evidence.reviewFlags)
      .toContain('comparison_unit_unknown')
    expect(result.find((candidate) => candidate.canonicalName === 'Ajvar')?.category).toBeNull()
    expect(result.find((candidate) => candidate.canonicalName === 'Ajvar')?.comparisonUnit).toBeNull()
  })

  it('raises confidence only when independent evidence or explicit attributes are present', () => {
    const singleSource = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: 'Mléko', language: 'cs', status: 'approved', sourceKind: 'open_food_facts' },
    ])[0]
    const corroborated = generatePkdProductTypeCandidates([
      { id: 'a', canonicalName: 'Mléko', language: 'cs', status: 'approved', sourceKind: 'open_food_facts', category: 'Potraviny', comparisonUnit: 'l' },
      { id: 'b', canonicalName: 'mléko', language: 'cs', status: 'approved', sourceKind: 'seed_catalog', category: 'Potraviny', comparisonUnit: 'l' },
    ])[0]

    expect(singleSource.confidence).toBe(0.6)
    expect(corroborated.confidence).toBe(0.8)
    expect(corroborated.evidence.reviewFlags).not.toContain('category_unknown')
    expect(corroborated.evidence.reviewFlags).not.toContain('comparison_unit_unknown')
  })

  it('records exact corroboration from independent reference sources without making them candidate identities', () => {
    const result = generatePkdProductTypeCandidates([
      {
        id: 'off-1',
        canonicalName: 'Ajvar',
        language: 'cs',
        status: 'approved',
        sourceKind: 'open_food_facts',
        referenceEvidence: [
          { sourceKind: 'gs1_gpc', matchedName: 'Ajvar', stableKey: 'gpc:test:ajvar' },
          { sourceKind: 'cz_cpa', matchedName: 'Ajvar', stableKey: 'cz-cpa:test:ajvar' },
        ],
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].evidence.referenceSourceKinds).toEqual(['cz_cpa', 'gs1_gpc'])
    expect(result[0].evidence.referenceEvidence).toHaveLength(2)
    expect(result[0].evidence.reviewFlags).not.toContain('reference_corroboration_missing')
    expect(result[0].confidence).toBe(0.65)
  })

  it('flags a single catalog match as limited corroboration rather than independent confirmation', () => {
    const result = generatePkdProductTypeCandidates([
      {
        id: 'off-1',
        canonicalName: 'Ajvar',
        language: 'cs',
        status: 'approved',
        sourceKind: 'open_food_facts',
        referenceEvidence: [{ sourceKind: 'product_catalog', matchedName: 'Ajvar' }],
      },
    ])

    expect(result[0].evidence.referenceSourceKinds).toEqual(['product_catalog'])
    expect(result[0].evidence.reviewFlags).toContain('reference_corroboration_single_source')
    expect(result[0].confidence).toBe(0.6)
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
