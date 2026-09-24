import {
  getCanonicalStoreLocationId,
  getStoreByChain,
  loadExternalProductContext,
  loadLatestOfficialPrices,
  recordOfficialPrice,
  resolveOrCreateProductFromExternal,
  touchExternalRefs,
  upsertActiveDeal,
} from '@/lib/db/queries'
import { billaConnector } from '@/lib/ingestion/billa'
import { dmConnector } from '@/lib/ingestion/dm'
import { kosikConnector } from '@/lib/ingestion/kosik'
import { lidlConnector } from '@/lib/ingestion/lidl'
import { pennyConnector } from '@/lib/ingestion/penny'
import { rohlikConnector } from '@/lib/ingestion/rohlik'
import { ingestionDate } from '@/lib/ingestion/today'
import type { IngestResult, PriceConnector } from '@/lib/ingestion/types'

export type { IngestResult } from '@/lib/ingestion/types'

export type IngestOptions = {
  /** Epoch ms after which no further product is started. The run then ends cleanly with
   *  `truncated: true` instead of being killed mid-write by the platform's function time limit. */
  deadline?: number
  /** Clock, injectable for tests. */
  now?: () => number
  /** The date (`YYYY-MM-DD`) stamped on the observed prices. Defaults to today's real date in
   *  Czech time — see lib/ingestion/today.ts for why this is not the app's fixed demo date. */
  today?: string
}

/** Fetches + normalizes + validates + persists real prices for one store connector — the
 *  orchestration step of docs/02_ARCHITECTURE.md's External Source -> Fetcher -> Normalizer ->
 *  Validator -> Database pipeline, shared by every store. One product's failure doesn't abort the
 *  batch (per CLAUDE.md section 32, "if a retailer source stops working, the rest of the
 *  application should continue functioning") — it's recorded in `errors` and the rest still runs. */
export async function ingestPrices<Raw>(connector: PriceConnector<Raw>, limit: number, options: IngestOptions = {}): Promise<IngestResult> {
  const result: IngestResult = { processed: 0, recorded: 0, newProducts: 0, deals: 0, promotionsWithoutValidity: 0, skipped: 0, unchanged: 0, priceChanges: 0, truncated: false, errors: [] }
  if (limit <= 0) return result
  const now = options.now ?? Date.now
  const today = options.today ?? ingestionDate()

  const raws = await connector.fetchProducts(limit, { deadline: options.deadline })
  result.processed = raws.length

  // Looked up once per run, not per product: each lookup is a database round trip, and per-product
  // lookups were what made a run of ~80 products take minutes (see loadExternalProductContext()).
  const { id: storeId, isOnline } = await getStoreByChain(connector.chain)
  const [context, latestPrices] = await Promise.all([loadExternalProductContext(connector.source), loadLatestOfficialPrices(storeId)])
  // A deal of a chain with physical stores is still attached to the seeded canonical branch, looked up
  // lazily since a connector whose source has no dated promotions never needs one. An online-only
  // chain has no branch at all (and none is invented): its deals carry the chain and a null branch.
  let storeLocationId: string | null | undefined
  // Products that were already linked before this run; their `lastSeenAt` is refreshed in one batch
  // at the end.
  const alreadyLinked: string[] = []

  for (const raw of raws) {
    if (options.deadline != null && now() >= options.deadline) {
      result.truncated = true
      break
    }
    try {
      const normalized = connector.normalize(raw, today)
      if (!normalized) {
        result.skipped++
        continue
      }

      const existedBefore = context.refs.has(normalized.externalId)
      const productId = await resolveOrCreateProductFromExternal(
        {
          externalId: normalized.externalId,
          source: connector.source,
          name: normalized.name,
          category: normalized.category,
          unit: normalized.unit,
        },
        context,
      )
      if (existedBefore) alreadyLinked.push(normalized.externalId)
      else result.newProducts++

      // A retailer's own website publishes one price per product, not per branch, so this is an
      // official CHAIN-scope observation with no physical location (docs/02_PROJECT_CONTEXT.md:
      // "Official chain price: CHAIN + store_location_id=NULL + OFFICIAL"). It never overwrites a
      // receipt-based STORE observation. Within the official prices the current one is the latest
      // by date; a repeat run the same day refreshes that day's row, and a changed price leaves the
      // previous one as an old price closed with a date (see recordOfficialPrice()). Skipped when
      // the source states no regular price (an offers-only source): the offer then lives only in
      // `deals`.
      if (normalized.regularPrice != null && normalized.unitPrice != null) {
        const written = await recordOfficialPrice(
          {
            productId,
            storeId,
            sourceReference: normalized.externalId,
            regularPrice: normalized.regularPrice,
            currency: normalized.currency,
            unit: normalized.unit,
            unitPrice: normalized.unitPrice,
            observedAt: normalized.recordedAt,
          },
          latestPrices.get(normalized.externalId),
        )
        if (written.latest) latestPrices.set(normalized.externalId, written.latest)
        if (written.action === 'insert' || written.action === 'update-same-day') result.recorded++
        else if (written.action === 'unchanged') result.unchanged++
        else result.skipped++ // stale: what is stored is newer than what was fetched
        if (written.closedPrevious) result.priceChanges++
      }

      if (normalized.deal) {
        if (storeLocationId === undefined) storeLocationId = isOnline ? null : await getCanonicalStoreLocationId(connector.chain)
        await upsertActiveDeal({
          productId,
          storeId,
          storeLocationId,
          dealPrice: normalized.deal.dealPrice,
          unit: normalized.unit,
          unitPrice: normalized.deal.unitPrice,
          currency: normalized.currency,
          validFrom: normalized.deal.validFrom,
          validUntil: normalized.deal.validUntil,
        })
        result.deals++
      } else if (normalized.promotionWithoutValidity) {
        result.promotionsWithoutValidity++
      }
    } catch (err) {
      result.errors.push(`${connector.rawId(raw)}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Bookkeeping only — the prices are already written, so a failure here is reported, not thrown.
  try {
    await touchExternalRefs(connector.source, alreadyLinked)
  } catch (err) {
    result.errors.push(`last-seen update: ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}

export type PriceSource = {
  source: string
  /** How many products one daily run reads from this store. */
  limit: number
  run: (limit: number, options?: IngestOptions) => Promise<IngestResult>
}

/** Every store connector run by the daily cron, with how many products each reads per run. Adding a
 *  store means adding its connector here (each entry closes over its own raw type, so the list needs
 *  no shared generic).
 *
 *  The limits are set by what one run can write inside the function time limit (lib/ingestion/
 *  cron-handler.ts). The database is in us-east-1 and the functions run next to it, so a product costs
 *  a few dozen milliseconds to write, not the ~0.4 s it costs from a distant machine; a few hundred
 *  products per store fit comfortably, and a run that still runs out of time stops cleanly and says so
 *  (`truncated`). Each store reads the same, stable sample every day (see its connector), so every
 *  product's price history stays continuous. Penny lists only its ~40 weekly offers, so 80 is
 *  already everything. */
export const PRICE_SOURCES: PriceSource[] = [
  { source: lidlConnector.source, limit: 400, run: (limit, options) => ingestPrices(lidlConnector, limit, options) },
  { source: billaConnector.source, limit: 450, run: (limit, options) => ingestPrices(billaConnector, limit, options) },
  { source: pennyConnector.source, limit: 80, run: (limit, options) => ingestPrices(pennyConnector, limit, options) },
  { source: dmConnector.source, limit: 700, run: (limit, options) => ingestPrices(dmConnector, limit, options) },
  // Online-only: a run is ~10 category requests plus 2 requests per 50 products, well inside the budget.
  { source: rohlikConnector.source, limit: 500, run: (limit, options) => ingestPrices(rohlikConnector, limit, options) },
  // Online-only, 30 products per request: ~60 requests (about 50 s) for the batch, plus the menu. A live
  // dry run read 2,400 in 70 s; 1,800 leaves the rest of the time budget for writing them.
  { source: kosikConnector.source, limit: 1800, run: (limit, options) => ingestPrices(kosikConnector, limit, options) },
]

export type SourceOutcome = IngestResult | { error: string } | { skipped: string }

/** Runs price ingestion for one source (`only`) or for all of them one after another, all inside a
 *  single time budget. Each source is isolated (CLAUDE.md section 32): one throwing does not stop
 *  the others. A source that would start after the budget is used up is reported as skipped rather
 *  than begun, and a source running when the budget ends stops between products — so the whole call
 *  finishes on its own, before the platform's function time limit, instead of being killed. */
export async function runPriceSources(options: {
  only?: string
  /** Overrides every source's own batch size (tests, manual small runs). */
  limit?: number
  budgetMs: number
  now?: () => number
  sources?: typeof PRICE_SOURCES
}): Promise<Record<string, SourceOutcome>> {
  const now = options.now ?? Date.now
  const deadline = now() + options.budgetMs
  const all = options.sources ?? PRICE_SOURCES
  const selected = options.only ? all.filter((entry) => entry.source === options.only) : all

  const results: Record<string, SourceOutcome> = {}
  for (const { source, run, limit } of selected) {
    if (now() >= deadline) {
      results[source] = { skipped: 'time budget exhausted before this source started' }
      continue
    }
    try {
      results[source] = await run(options.limit ?? limit, { deadline, now })
    } catch (err) {
      results[source] = { error: err instanceof Error ? err.message : String(err) }
    }
  }
  return results
}
