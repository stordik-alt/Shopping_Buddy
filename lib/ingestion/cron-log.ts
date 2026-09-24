import { redactSecrets } from '@/lib/receipt-log'
import type { SourceOutcome } from '@/lib/ingestion/ingest'

// One structured log line per source per price-ingestion run (same JSON-line convention as the
// receipt pipeline's log, lib/receipt-log.ts).
//
// Why: the cron route answers with a JSON body, but Vercel keeps only the request line and duration
// in its logs, not the body — so whether a run wrote its products, was cut short by the time budget
// (`truncated`) or hit per-product errors could only be seen by calling the route by hand. Logging
// the summary makes every scheduled run inspectable in the log viewer.
//
// Only counts and short error messages are logged (upstream errors go through `redactSecrets`, as a
// failing HTTP client can echo a request URL); no product data.

const MAX_LOGGED_ERRORS = 3
const MAX_ERROR_LENGTH = 200

export type IngestLogEntry = {
  event: 'price_ingest'
  source: string
  /** `ok` = ran to the end, `truncated` = stopped by the time budget, `error` = the source threw,
   *  `skipped` = never started because the budget was already spent. */
  status: 'ok' | 'truncated' | 'error' | 'skipped'
  durationMs: number
  processed?: number
  recorded?: number
  newProducts?: number
  deals?: number
  promotionsWithoutValidity?: number
  skipped?: number
  unchanged?: number
  priceChanges?: number
  errorCount?: number
  /** The first few per-product errors (or the source's own error), shortened and redacted. */
  errors?: string[]
}

const shorten = (message: string) => redactSecrets(message).slice(0, MAX_ERROR_LENGTH)

export function buildIngestLogEntry(source: string, outcome: SourceOutcome, durationMs: number): IngestLogEntry {
  if ('error' in outcome) return { event: 'price_ingest', source, status: 'error', durationMs, errors: [shorten(outcome.error)] }
  // `IngestResult.skipped` is a count, so the never-started variant is told apart by lacking the result's counts.
  if (!('processed' in outcome)) return { event: 'price_ingest', source, status: 'skipped', durationMs, errors: [shorten(outcome.skipped)] }
  return {
    event: 'price_ingest',
    source,
    status: outcome.truncated ? 'truncated' : 'ok',
    durationMs,
    processed: outcome.processed,
    recorded: outcome.recorded,
    newProducts: outcome.newProducts,
    deals: outcome.deals,
    promotionsWithoutValidity: outcome.promotionsWithoutValidity,
    skipped: outcome.skipped,
    unchanged: outcome.unchanged,
    priceChanges: outcome.priceChanges,
    errorCount: outcome.errors.length,
    ...(outcome.errors.length > 0 ? { errors: outcome.errors.slice(0, MAX_LOGGED_ERRORS).map(shorten) } : {}),
  }
}

/** Logs one line per source; `durationMs` is how long the whole request took (for a manual run of
 *  several sources, all of them together). A source that failed is an error; one that was cut short, skipped or had
 *  per-product errors is a warning; a clean run is info — so the log viewer's level filter finds the
 *  runs that need a look. */
export function logIngestResults(results: Record<string, SourceOutcome>, durationMs: number): void {
  for (const [source, outcome] of Object.entries(results)) {
    const entry = buildIngestLogEntry(source, outcome, durationMs)
    const line = JSON.stringify(entry)
    if (entry.status === 'error') console.error(line)
    else if (entry.status !== 'ok' || (entry.errorCount ?? 0) > 0) console.warn(line)
    else console.info(line)
  }
}
