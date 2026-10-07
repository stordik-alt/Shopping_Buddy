import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRICE_SOURCES } from '@/lib/ingestion/ingest'

// Catalog refreshes run once per week per source. Large catalogs batch up to three rotating parts per cron
// invocation to reduce DB wakeups; flyer OCR jobs keep their publication-cycle continuation runs.
type Cron = { path: string; schedule: string }
const crons: Cron[] = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')).crons

const runsForSource = (source: string) =>
  crons.filter((cron) => cron.path === `/api/cron/ingest-prices/${source}` || cron.path.startsWith(`/api/cron/ingest-prices/${source}/`))

const flyerSources = new Set(['penny_flyer', 'billa_flyer', 'lidl_flyer'])

describe('price ingestion cron schedule', () => {
  it('runs every rotating catalog source on exactly one weekday per week', () => {
    for (const { source } of PRICE_SOURCES) {
      if (flyerSources.has(source) || parts <= 1) continue
      const runs = runsForSource(source)
      expect(runs.length, source).toBeGreaterThanOrEqual(1)
      const weekdays = new Set(runs.map(({ schedule }) => schedule.split(' ')[4]))
      expect(weekdays.size, source).toBe(1)
    }
  })

  it('uses enough cron invocations for the configured parts-per-run batching', () => {
    for (const { source, parts, partsPerRun = 1 } of PRICE_SOURCES) {
      if (flyerSources.has(source) || parts <= 1) continue
      const runs = runsForSource(source)
      const expected = Math.ceil(parts / partsPerRun)
      expect(runs.length, source).toBe(expected)
    }
  })

  it('keeps all catalog continuation runs on the same weekly day', () => {
    for (const { source } of PRICE_SOURCES) {
      if (flyerSources.has(source)) continue
      const runs = runsForSource(source)
      const weekdays = new Set(runs.map(({ schedule }) => schedule.split(' ')[4]))
      expect(weekdays.size, source).toBe(1)
    }
  })

  it('uses the expected weekly publication schedule for flyer OCR jobs', () => {
    const actual = crons
      .filter((cron) => flyerSources.has(cron.path.split('/')[4]))
      .map(({ path, schedule }) => [path, schedule])
      .sort()

    expect(actual).toEqual([
      ['/api/cron/ingest-prices/billa_flyer', '10 21 * * 2'],
      ['/api/cron/ingest-prices/billa_flyer/2', '10 23 * * 2'],
      ['/api/cron/ingest-prices/lidl_flyer', '20 21 * * 0'],
      ['/api/cron/ingest-prices/lidl_flyer/2', '20 23 * * 0'],
      ['/api/cron/ingest-prices/lidl_flyer/3', '20 21 * * 3'],
      ['/api/cron/ingest-prices/lidl_flyer/4', '20 23 * * 3'],
      ['/api/cron/ingest-prices/penny_flyer', '0 21 * * 2'],
      ['/api/cron/ingest-prices/penny_flyer/2', '0 23 * * 2'],
    ])
  })

  it('uses only run numbers the extra-run route accepts (2–9), each once', () => {
    const extra = crons
      .map((cron) => /^\/api\/cron\/ingest-prices\/[^/]+\/([^/]+)$/.exec(cron.path)?.[1])
      .filter((run) => run != null)
    for (const run of extra) expect(run).toMatch(/^[2-9]$/)
    expect(new Set(crons.map((cron) => cron.path)).size).toBe(crons.length)
  })

  it('uses valid Vercel cron schedule shapes', () => {
    for (const { schedule } of crons) {
      expect(schedule).toMatch(/^\d{1,2} \d{1,2} (\*|\d{1,2}) \* (\*|[0-6])$/)
    }
  })
})