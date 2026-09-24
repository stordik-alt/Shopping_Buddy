import { NextResponse } from 'next/server'
import { PRICE_SOURCES, type IngestResult } from '@/lib/ingestion/ingest'

// Real external price ingestion (docs/01_CURRENT_STATE.md section 15 / docs/04_ROADMAP.md Phase 5):
// one connector per store, run from `lib/ingestion/ingest.ts`'s `PRICE_SOURCES` (currently Lidl and
// Billa). Each store's source rationale (robots.txt, endpoints used) lives in its own connector
// module under lib/ingestion/.
//
// Deliberately scoped small for the pilot: PILOT_BATCH_SIZE real grocery products per store, not
// whole catalogs, per an explicit owner decision (2026-09-23) to verify stability before widening
// scope. Same auth model as the other cron routes: Vercel sends `Authorization: Bearer
// $CRON_SECRET`; proxy.ts's matcher excludes all of api/cron/* from session protection.
const PILOT_BATCH_SIZE = 80

type SourceOutcome = IngestResult | { error: string }

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Per CLAUDE.md section 32: a failing external source must not take the rest of the app — or the
  // other stores' ingestion — down with it. Each source runs in its own try/catch, so one retailer
  // changing its site only loses that store's refresh for today.
  const results: Record<string, SourceOutcome> = {}
  for (const { source, run } of PRICE_SOURCES) {
    try {
      results[source] = await run(PILOT_BATCH_SIZE)
    } catch (err) {
      results[source] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  // 502 only when every source failed (nothing refreshed); a partial success is still a 200 whose
  // body shows which store failed.
  const allFailed = Object.values(results).every((outcome) => 'error' in outcome)
  return NextResponse.json(results, { status: allFailed ? 502 : 200 })
}
