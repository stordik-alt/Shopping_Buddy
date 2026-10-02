import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRICE_SOURCES } from '@/lib/ingestion/ingest'

// vercel.json schedules rotating catalog refreshes daily, while flyer OCR jobs follow the retailers'
// publication cycles. The tests below keep both kinds of schedules explicit and in sync with sources.
type Cron = { path: string; schedule: string }
const crons: Cron[] = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')).crons

const runsPerDay = (source: string) =>
  crons.filter((cron) => cron.path === `/api/cron/ingest-prices/${source}` || cron.path.startsWith(`/api/cron/ingest-prices/${source}/`)).length

const flyerSources = new Set(['penny_flyer', 'billa_flyer', 'lidl_flyer'])

describe('price ingestion cron schedule', () => {
  it('runs every rotating catalog source at least once a day', () => {
    for (const { source } of PRICE_SOURCES) {
      if (flyerSources.has(source)) continue
      expect(runsPerDay(source), source).toBeGreaterThanOrEqual(1)
    }
  })

  it('covers every rotating catalog split within two days', () => {
    for (const { source, parts } of PRICE_SOURCES) {
      if (flyerSources.has(source)) continue
      expect(runsPerDay(source) * 2, source).toBeGreaterThanOrEqual(parts)
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

  it('schedules each entry at most once a day', () => {
    // A fixed minute/hour with either a daily cadence or a single weekday/monthday.
    for (const { schedule } of crons) expect(schedule).toMatch(/^\d{1,2} \d{1,2} (\*|\d{1,2}) \* (\*|[0-6])$/)
  })
})
