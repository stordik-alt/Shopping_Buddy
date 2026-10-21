// Tests for the row-count comparison of the Neon project migration (scripts/migrate-neon-project.ts).
//
// The comparison is the safety net of the whole migration: after a restore it decides whether the
// target really holds the source data. A comparison that misses a difference would report a
// successful migration of a database that lost rows, so the cases below cover both directions.

import { describe, expect, it } from 'vitest'
import { compareRowCounts } from './migrate-neon-project'

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
