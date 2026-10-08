import { describe, expect, it } from 'vitest'
import { findPkdDedupCandidates, normalizePkdEntry } from './pkd-normalization'

describe('PKD normalization', () => {
  it('folds accents, case, punctuation and whitespace without collapsing digits', () => {
    expect(normalizePkdEntry({
      id: '1',
      canonicalName: '  Mléko 1,5 %  ',
      language: 'CS',
    })).toMatchObject({
      normalizedName: 'mleko 1 5',
      identityKey: 'cs:mleko 1 5',
      normalizationVersion: '2026-10-v1',
    })

    expect(normalizePkdEntry({
      id: '2',
      canonicalName: 'Mleko 15 %',
      language: 'cs',
    }).identityKey).not.toBe('cs:mleko 1 5')
  })

  it('creates a candidate for equivalent names with compatible metadata', () => {
    expect(findPkdDedupCandidates([
      { id: '1', canonicalName: 'Máslo', language: 'cs', category: 'Potraviny', subcategory: 'Tuky' },
      { id: '2', canonicalName: 'MASLO', language: 'cs', category: 'Potraviny', subcategory: 'Tuky' },
    ])).toEqual([expect.objectContaining({
      leftEntryId: '1',
      rightEntryId: '2',
      reason: 'exact_normalized_name',
      confidence: 0.98,
    })])
  })

  it('does not propose a merge when explicit forms conflict', () => {
    expect(findPkdDedupCandidates([
      { id: '1', canonicalName: 'Mléko', language: 'cs', category: 'Potraviny', physicalForm: 'liquid' },
      { id: '2', canonicalName: 'Mléko', language: 'cs', category: 'Potraviny', physicalForm: 'powder' },
    ])).toEqual([])
  })

  it('allows missing metadata without inventing a conflict', () => {
    const result = findPkdDedupCandidates([
      { id: '1', canonicalName: 'Rýže', language: 'cs', category: 'Potraviny' },
      { id: '2', canonicalName: 'Rýže', language: 'cs', category: 'Potraviny', subcategory: 'Přílohy' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe(0.94)
  })

  it('keeps different languages and different normalized names separate', () => {
    expect(findPkdDedupCandidates([
      { id: '1', canonicalName: 'Milk', language: 'en' },
      { id: '2', canonicalName: 'Mléko', language: 'cs' },
      { id: '3', canonicalName: 'Máslo', language: 'cs' },
    ])).toEqual([])
  })
})
