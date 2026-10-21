// Tests for the row-count comparison of the Neon project migration (scripts/migrate-neon-project.ts).
//
// The comparison is the safety net of the whole migration: after a restore it decides whether the
// target really holds the source data. A comparison that misses a difference would report a
// successful migration of a database that lost rows, so the cases below cover both directions.

import { describe, expect, it } from 'vitest'
import { compareRowCounts, needsSigningKeyReset } from './migrate-neon-project'

describe('compareRowCounts', () => {
  it('reports nothing when both databases hold the same tables and rows', () => {
    const source = new Map([['households', 21], ['products', 58_730]])
    const target = new Map([['households', 21], ['products', 58_730]])

    expect(compareRowCounts(source, target)).toEqual({ missing: [], differing: [] })
  })

  it('reports a table that exists in the source but not in the target', () => {
    const source = new Map([['households', 21], ['purchases', 23]])
    const target = new Map([['households', 21]])

    const { missing, differing } = compareRowCounts(source, target)
    expect(missing).toEqual(['purchases'])
    expect(differing).toEqual([])
  })

  it('reports a table whose row count differs, naming both counts', () => {
    const source = new Map([['products', 58_730]])
    const target = new Map([['products', 58_729]])

    const { missing, differing } = compareRowCounts(source, target)
    expect(missing).toEqual([])
    expect(differing).toEqual(['products: source 58730, target 58729'])
  })

  it('does not complain about a table that only the target has', () => {
    // The target may hold an extra table (a newer migration ran there). That is not a data loss.
    const source = new Map([['households', 21]])
    const target = new Map([['households', 21], ['audit_log', 5]])

    expect(compareRowCounts(source, target)).toEqual({ missing: [], differing: [] })
  })

  it('reports an empty target as missing every table', () => {
    const source = new Map([['households', 21], ['products', 1]])
    const target = new Map<string, number>()

    const { missing, differing } = compareRowCounts(source, target)
    expect(missing).toEqual(['households', 'products'])
    expect(differing).toEqual([])
  })
})

describe('needsSigningKeyReset', () => {
  it('asks for a reset when the key has no algorithm', () => {
    // This is the state a key restored from a dump arrives in: the older auth service wrote it
    // without alg and crv, and the newer service answers HTTP 500 on /get-session with it.
    expect(needsSigningKeyReset([{ alg: '', crv: 'Ed25519' }])).toBe(true)
  })

  it('asks for a reset when the key has no curve', () => {
    expect(needsSigningKeyReset([{ alg: 'EdDSA', crv: '' }])).toBe(true)
  })

  it('asks for a reset when the algorithm or the curve is null', () => {
    expect(needsSigningKeyReset([{ alg: null, crv: null }])).toBe(true)
    expect(needsSigningKeyReset([{ alg: 'EdDSA', crv: null }])).toBe(true)
  })

  it('keeps a key the service has written itself', () => {
    expect(needsSigningKeyReset([{ alg: 'EdDSA', crv: 'Ed25519' }])).toBe(false)
  })

  it('keeps every key when there is none', () => {
    expect(needsSigningKeyReset([])).toBe(false)
  })
})
