import { handleIngestCron } from '@/lib/ingestion/cron-handler'

// Real external price ingestion (docs/01_CURRENT_STATE.md section 15 / docs/04_ROADMAP.md Phase 5).
// This route runs every store one after another inside one time budget — meant for manual runs.
// The scheduled crons call `./[source]` instead, one per store, so each store gets the full limit.
// See lib/ingestion/cron-handler.ts for the time-limit design.
export const maxDuration = 300

export async function GET(request: Request) {
  return handleIngestCron(request)
}
