import { NextResponse } from 'next/server'
import { fetchLidlSitemap, selectGroceryErpNumbers } from '@/lib/ingestion/lidl'
import { ingestLidlPrices } from '@/lib/ingestion/ingest'

// Real external price ingestion (docs/01_CURRENT_STATE.md section 15 / docs/04_ROADMAP.md Phase 5),
// starting with Lidl CZ as a pilot: its own published product sitemap + the JSON endpoint its
// product-grid pages call for prices, both outside lidl.cz's robots.txt Disallow rules (checked
// 2026-09-23) — see lib/ingestion/lidl.ts for the full source rationale.
//
// Deliberately scoped small for this pilot: PILOT_BATCH_SIZE real grocery products, not the whole
// ~36k-item sitemap, per an explicit owner decision (2026-09-23) to verify stability before
// widening scope. Same auth model as the other cron routes: Vercel sends `Authorization: Bearer
// $CRON_SECRET`; proxy.ts's matcher excludes all of api/cron/* from session protection.
const PILOT_BATCH_SIZE = 80

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sitemap = await fetchLidlSitemap()
    const erpNumbers = selectGroceryErpNumbers(sitemap, PILOT_BATCH_SIZE)
    const result = await ingestLidlPrices(erpNumbers)
    return NextResponse.json(result)
  } catch (err) {
    // Per CLAUDE.md section 32: a failing external source must not take the rest of the app down
    // with it — this route failing just means today's price refresh didn't happen, not a 500 that
    // could cascade into anything else, since nothing else depends on this route synchronously.
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
