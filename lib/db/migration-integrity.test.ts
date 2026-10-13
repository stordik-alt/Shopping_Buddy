import { describe, expect, it } from 'vitest'
import { checksumOf, needsBreakpointMarker, planIntegrity, runsInTransaction } from '@/lib/db/migration-integrity'

describe('checksumOf', () => {
  it('ignores the line-ending style', () => expect(checksumOf('a\r\nb\r\n')).toBe(checksumOf('a\nb\n')))
  it('changes with the content', () => expect(checksumOf('select 1;')).not.toBe(checksumOf('select 2;')))
})

describe('planIntegrity', () => {
  const files = new Map([
    ['0001.sql', 'select 1;'],
    ['0002.sql', 'select 2;'],
    ['0003.sql', 'select 3;'],
  ])
  it('accepts matching checksums', () => {
    const applied = new Map<string, string | null>([['0001.sql', checksumOf('select 1;')]])
    expect(planIntegrity(applied, files)).toEqual({ changed: [], toRecord: [], missing: [] })
  })
  it('flags an edited applied file', () => {
    const applied = new Map<string, string | null>([['0002.sql', checksumOf('select 20;')]])
    expect(planIntegrity(applied, files).changed).toEqual(['0002.sql'])
  })
  it('records a baseline for rows without a checksum', () => {
    const applied = new Map<string, string | null>([['0003.sql', null]])
    expect(planIntegrity(applied, files).toRecord).toEqual(['0003.sql'])
  })
  it('reports an applied file that is gone', () => {
    const applied = new Map<string, string | null>([['0009.sql', 'x']])
    expect(planIntegrity(applied, files).missing).toEqual(['0009.sql'])
  })
})

describe('migration file rules', () => {
  it('runs in a transaction unless the file opts out', () => {
    expect(runsInTransaction('create table a();')).toBe(true)
    expect(runsInTransaction('-- migrate: no-transaction\ncreate index concurrently i on a(b);')).toBe(false)
  })
  it('requires the breakpoint marker for dollar-quoted bodies', () => {
    expect(needsBreakpointMarker('DO $$ BEGIN null; END $$;')).toBe(true)
    expect(needsBreakpointMarker('DO $$ BEGIN null; END $$;\n--> statement-breakpoint\nselect 1;')).toBe(false)
    expect(needsBreakpointMarker('select 1;')).toBe(false)
  })
})
