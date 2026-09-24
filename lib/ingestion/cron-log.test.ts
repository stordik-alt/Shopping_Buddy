import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildIngestLogEntry, logIngestResults } from '@/lib/ingestion/cron-log'
import type { IngestResult } from '@/lib/ingestion/types'

const result = (overrides: Partial<IngestResult> = {}): IngestResult => ({
  processed: 100,
  recorded: 90,
  newProducts: 10,
  deals: 7,
  promotionsWithoutValidity: 1,
  skipped: 2,
  unchanged: 3,
  priceChanges: 4,
  truncated: false,
  errors: [],
  ...overrides,
})

describe('buildIngestLogEntry', () => {
  it('summarises a clean run with its counts and no errors', () => {
    expect(buildIngestLogEntry('kosik', result(), 1234)).toEqual({
      event: 'price_ingest',
      source: 'kosik',
      status: 'ok',
      durationMs: 1234,
      processed: 100,
      recorded: 90,
      newProducts: 10,
      deals: 7,
      promotionsWithoutValidity: 1,
      skipped: 2,
      unchanged: 3,
      priceChanges: 4,
      errorCount: 0,
    })
  })

  it('marks a run cut short by the time budget as truncated', () => {
    expect(buildIngestLogEntry('kosik', result({ truncated: true }), 1).status).toBe('truncated')
  })

  it('keeps only the first few per-product errors, shortened, and counts all of them', () => {
    const errors = Array.from({ length: 10 }, (_, i) => `${i}: ${'x'.repeat(500)}`)
    const entry = buildIngestLogEntry('kosik', result({ errors }), 1)
    expect(entry.errorCount).toBe(10)
    expect(entry.errors).toHaveLength(3)
    expect(entry.errors!.every((message) => message.length <= 200)).toBe(true)
  })

  it('reports a source that threw, and one that never started', () => {
    expect(buildIngestLogEntry('lidl', { error: 'HTTP 503' }, 5)).toMatchObject({ status: 'error', errors: ['HTTP 503'] })
    expect(buildIngestLogEntry('dm', { skipped: 'time budget exhausted before this source started' }, 5)).toMatchObject({ status: 'skipped' })
  })

  it('does not log product data, only counts', () => {
    const entry = buildIngestLogEntry('kosik', result(), 1)
    expect(Object.keys(entry).sort()).toEqual(
      ['deals', 'durationMs', 'errorCount', 'event', 'newProducts', 'priceChanges', 'processed', 'promotionsWithoutValidity', 'recorded', 'skipped', 'source', 'status', 'unchanged'].sort(),
    )
  })
})

describe('logIngestResults', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs a run that has per-product errors as a warning, a clean one as info', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logIngestResults({ a: result(), b: result({ errors: ['boom'] }) }, 10)
    expect(info).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
