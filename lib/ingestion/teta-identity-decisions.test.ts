import { describe, expect, it } from 'vitest'
import { parseTetaIdentityDecisions } from '@/lib/ingestion/teta-identity-decisions'

describe('Teta identity decisions', () => {
  it('reads a link and a "not the same product"', () => {
    const decisions = parseTetaIdentityDecisions(JSON.stringify({
      source: 'teta',
      decisions: {
        '000000000196442': { action: 'link', productId: 'product-1', productName: 'Nivea Creme' },
        '000000000196443': { action: 'none' },
      },
    }))
    expect(decisions.size).toBe(2)
    expect(decisions.get('000000000196442')).toEqual({
      action: 'link',
      productId: 'product-1',
      productName: 'Nivea Creme',
    })
    expect(decisions.get('000000000196443')).toEqual({ action: 'none' })
  })

  it('reads a file without a source', () => {
    const decisions = parseTetaIdentityDecisions(JSON.stringify({
      decisions: { '000000000196442': { action: 'none' } },
    }))
    expect(decisions.size).toBe(1)
  })

  it('refuses a file that is not JSON', () => {
    expect(() => parseTetaIdentityDecisions('not json')).toThrow('not valid JSON')
  })

  it('refuses a file without decisions', () => {
    expect(() => parseTetaIdentityDecisions(JSON.stringify({ source: 'teta' }))).toThrow('decisions')
  })

  it('refuses a file of another retailer', () => {
    expect(() => parseTetaIdentityDecisions(JSON.stringify({
      source: 'dm',
      decisions: {},
    }))).toThrow('dm')
  })

  it('refuses a decision with an unknown action', () => {
    expect(() => parseTetaIdentityDecisions(JSON.stringify({
      source: 'teta',
      decisions: { '000000000196442': { action: 'merge' } },
    }))).toThrow('merge')
  })

  it('refuses a link to no catalog product', () => {
    expect(() => parseTetaIdentityDecisions(JSON.stringify({
      source: 'teta',
      decisions: { '000000000196442': { action: 'link' } },
    }))).toThrow('links to no catalog product')
  })
})
