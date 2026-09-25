import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRICE_SOURCES } from '@/lib/ingestion/ingest'

// vercel.json is the only place the rotating refresh's daily runs are scheduled; a store added to
// PRICE_SOURCES without an entry would silently never refresh, and too few runs for a split catalog
// would leave products stale for days. This keeps the two in step.
type Cron = { path: string; schedule: string }
const crons: Cron[] = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')).crons

const runsPerDay = (source: string) =>
  crons.filter((cron) => cron.path === `/api/cron/ingest-prices/${source}` || cron.path.startsWith(`/api/cron/ingest-prices/${source}/`)).length

describe('price ingestion cron schedule', () => {
  it('runs every store at least once a day', () => {
    for (const { source } of PRICE_SOURCES) expect(runsPerDay(source), source).toBeGreaterThanOrEqual(1)
  })

  it('covers every split catalog within two days', () => {
    for (const { source, parts } of PRICE_SOURCES) expect(runsPerDay(source) * 2, source).toBeGreaterThanOrEqual(parts)
  })

  it('uses only run numbers the extra-run route accepts (2–9), each once', () => {
    const extra = crons.map((cron) => /^\/api\/cron\/ingest-prices\/[^/]+\/([^/]+)$/.exec(cron.path)?.[1]).filter((run) => run != null)
    for (const run of extra) expect(run).toMatch(/^[2-9]$/)
    expect(new Set(crons.map((cron) => cron.path)).size).toBe(crons.length)
  })

  it('schedules each entry at most once a day (the Hobby plan limit)', () => {
    for (const { schedule } of crons) expect(schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/)
  })
})
