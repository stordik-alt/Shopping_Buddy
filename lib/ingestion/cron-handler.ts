import { NextResponse } from 'next/server'
import { PRICE_SOURCES, runPriceSources } from '@/lib/ingestion/ingest'

// Shared request handling for the price-ingestion cron routes (app/api/cron/ingest-prices).
//
// Time limit. The platform kills a function at `maxDuration`; a run killed mid-write leaves no
// result and no clean stop. So (1) `vercel.json` schedules one cron per store
// (`/api/cron/ingest-prices/<source>`), giving each store the whole limit to itself instead of all
// stores sharing it, (2) the run works inside BUDGET_MS, ending between products
// (`truncated: true`) once it is spent, and (3) every outgoing request has its own timeout
// (lib/ingestion/http.ts). BUDGET_MS leaves ~70 s of the 300 s limit (set in the route files, which
// must declare `maxDuration` literally) for the one request or product write that may be in flight
// when the budget ends, plus the closing bookkeeping and the response.
const BUDGET_MS = 230_000

// How many products a run reads is per store (`PRICE_SOURCES` in lib/ingestion/ingest.ts).

/** Authenticates the cron request and runs ingestion for `only` (one store) or, when it is
 *  undefined, for every store one after another inside the one budget (manual runs).
 *  Same auth model as the other cron routes: Vercel sends `Authorization: Bearer $CRON_SECRET`;
 *  proxy.ts's matcher excludes all of api/cron/* from session protection. */
export async function handleIngestCron(request: Request, only?: string): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // An unknown name is a client error, not a silent no-op.
  if (only && !PRICE_SOURCES.some((entry) => entry.source === only)) {
    return NextResponse.json({ error: `Unknown source: ${only}`, sources: PRICE_SOURCES.map((entry) => entry.source) }, { status: 400 })
  }

  // Per CLAUDE.md section 32: a failing external source must not take the rest of the app — or the
  // other stores' ingestion — down with it; `runPriceSources` isolates each source.
  const results = await runPriceSources({ only, budgetMs: BUDGET_MS })

  // 502 only when every source that ran failed (nothing refreshed); a partial success is still a
  // 200 whose body shows which store failed, and a budget-truncated run is reported in its own body.
  const allFailed = Object.values(results).every((outcome) => 'error' in outcome)
  return NextResponse.json(results, { status: allFailed ? 502 : 200 })
}
