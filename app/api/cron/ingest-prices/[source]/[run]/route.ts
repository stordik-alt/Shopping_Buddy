import { NextResponse } from 'next/server'
import { handleIngestCron } from '@/lib/ingestion/cron-handler'

// A further daily run of one store's rotating price refresh, e.g. /api/cron/ingest-prices/kosik/2.
// Vercel Hobby runs each cron entry at most once a day, so a store whose catalog is split into
// several parts gets several entries in `vercel.json`, each needing its own path. The run number only
// makes the path unique: which part a run reads comes from the store's cursor (`ingestion_cursors`),
// so runs behave the same whichever entry fires, and a late or duplicate delivery is harmless.
export const maxDuration = 300

export async function GET(request: Request, { params }: { params: Promise<{ source: string; run: string }> }) {
  const { source, run } = await params
  if (!/^[2-9]$/.test(run)) return NextResponse.json({ error: `Unknown run: ${run}` }, { status: 404 })
  return handleIngestCron(request, source)
}
