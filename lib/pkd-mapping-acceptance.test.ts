import { describe, expect, it } from 'vitest'
import { buildPkdMappingAcceptanceCommand } from '@/lib/pkd-mapping-acceptance'

describe('buildPkdMappingAcceptanceCommand', () => {
  it('builds an accepted command without requiring a note', () => {
    expect(buildPkdMappingAcceptanceCommand({
      mappingId: ' map-1 ',
      decision: 'accepted',
      reviewerId: ' reviewer-1 ',
    })).toEqual({
      mappingId: 'map-1',
      decision: 'accepted',
      reviewerId: 'reviewer-1',
      note: null,
    })
  })

  it('requires a reason when rejecting a mapping', () => {
    expect(() => buildPkdMappingAcceptanceCommand({
      mappingId: 'map-1',
      decision: 'rejected',
    })).toThrow('A rejection note is required')
  })

  it('normalizes optional review metadata', () => {
    expect(buildPkdMappingAcceptanceCommand({
      mappingId: 'map-1',
      decision: 'rejected',
      reviewerId: '  ',
      note: '  wrong Product Type  ',
    })).toEqual({
      mappingId: 'map-1',
      decision: 'rejected',
      reviewerId: null,
      note: 'wrong Product Type',
    })
  })
})
