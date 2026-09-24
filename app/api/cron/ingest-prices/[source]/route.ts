import { handleIngestCron } from '@/lib/ingestion/cron-handler'

// One store's price ingestion, e.g. /api/cron/ingest-prices/billa — what `vercel.json` schedules
// (a dynamic route path, the form Vercel's cron documentation describes). Each store therefore gets
// the full function time limit to itself. See lib/ingestion/cron-handler.ts for the time-limit design.
export const maxDuration = 300

export async function GET(request: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params
  return handleIngestCron(request, source)
}
