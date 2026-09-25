import {
  getCanonicalStoreLocationId,
  getIngestionCursor,
  getStoreByChain,
  loadExternalProductContext,
  loadLatestOfficialPrices,
  recordOfficialPrice,
  resolveOrCreateProductFromExternal,
  setIngestionCursor,
  touchExternalRefs,
  upsertActiveDeal,
} from '@/lib/db/queries'
import { albertHypermarketConnector, albertSupermarketConnector, mergeIngestResults } from '@/lib/ingestion/albert'
import { billaConnector } from '@/lib/ingestion/billa'
import { dmConnector } from '@/lib/ingestion/dm'
import { globusConnector } from '@/lib/ingestion/globus'
import { kosikConnector } from '@/lib/ingestion/kosik'
import { lidlConnector } from '@/lib/ingestion/lidl'
import { pennyConnector } from '@/lib/ingestion/penny'
import { rohlikConnector } from '@/lib/ingestion/rohlik'
import { partLabel, type CatalogPart } from '@/lib/ingestion/parts'
import { ingestionDate } from '@/lib/ingestion/today'
import type { IngestionSource, IngestResult, PriceConnector } from '@/lib/ingestion/types'

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
  /** Passed to the connector's fetch (see FetchOptions.fullCatalog); only the backfill sets it. */
  fullCatalog?: boolean
  /** Passed to the connector's fetch (see FetchOptions.part): the rotating refresh's current part. */
  part?: CatalogPart
  /** Called after each product with how many of the fetched products are done — progress for the
   *  long-running backfill script. */
  onProgress?: (done: number, total: number) => void
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

  const raws = await connector.fetchProducts(limit, {
    deadline: options.deadline,
    ...(options.fullCatalog ? { fullCatalog: true } : {}),
    ...(options.part ? { part: options.part } : {}),
  })
  if (options.part) result.part = partLabel(options.part)
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

  for (const [index, raw] of raws.entries()) {
    if (index > 0) options.onProgress?.(index, raws.length)
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
        else if (written.action === 'unchanged' || written.action === 'confirm') result.unchanged++
        else result.skipped++ // stale: what is stored is newer than what was fetched
        if (written.closedPrevious) result.priceChanges++
      }

      if (normalized.deal) {
        if (storeLocationId === undefined) storeLocationId = isOnline || connector.chainWideDeals ? null : await getCanonicalStoreLocationId(connector.chain)
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

  if (!result.truncated) options.onProgress?.(raws.length, raws.length)

  // Bookkeeping only — the prices are already written, so a failure here is reported, not thrown.
  try {
    await touchExternalRefs(connector.source, alreadyLinked)
  } catch (err) {
    result.errors.push(`last-seen update: ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}

export type PriceSource = {
  source: IngestionSource
  /** How many parts the store's catalog is split into for the rotating refresh: each run reads one
   *  part and the next run continues with the next (`ingestion_cursors`). 1 = the whole catalog every
   *  run. */
  parts: number
  run: (limit: number, options?: IngestOptions) => Promise<IngestResult>
}

/** Every store connector run by the cron. Adding a store means adding its connector here (each entry
 *  closes over its own raw type, so the list needs no shared generic).
 *
 *  Rotating refresh. After the full-catalog backfill (scripts/backfill-prices.ts) a store holds up to
 *  ~13,000 products, more than one run can read and write inside the function time limit
 *  (lib/ingestion/cron-handler.ts). So a large catalog is split into `parts` of roughly 2,000
 *  products (lib/ingestion/parts.ts: by the product's or category's own id, so the split is the same
 *  every day), and each run refreshes one part. `vercel.json` schedules several runs a day for the
 *  large stores, so every product is re-read about every two days. A re-read of an unchanged price
 *  only confirms the stored row (lib/ingestion/official-price.ts) — storage grows with real price
 *  changes, not with the number of runs. About 2,000 products per run: the database is in us-east-1
 *  next to the functions, so a write costs a few dozen milliseconds (~1 minute for a part), and a run
 *  that still runs out of time stops cleanly and says so (`truncated`). Lidl (~240 grocery products)
 *  and Penny (its ~40 weekly offers) are read whole every run, as are Globus's flyers. */
export const PRICE_SOURCES: PriceSource[] = [
  { source: lidlConnector.source, parts: 1, run: (limit, options) => ingestPrices(lidlConnector, limit, options) },
  // ~9,400 products; each run walks the whole category listing (~1 min) and keeps one part.
  { source: billaConnector.source, parts: 5, run: (limit, options) => ingestPrices(billaConnector, limit, options) },
  { source: pennyConnector.source, parts: 1, run: (limit, options) => ingestPrices(pennyConnector, limit, options) },
  // ~13,000 products, one category lookup each.
  { source: dmConnector.source, parts: 7, run: (limit, options) => ingestPrices(dmConnector, limit, options) },
  // ~11,500 products; the id listing is read whole, details and prices only for the part.
  { source: rohlikConnector.source, parts: 6, run: (limit, options) => ingestPrices(rohlikConnector, limit, options) },
  // ~13,100 products; a part is a set of sub-categories, each read to its end.
  { source: kosikConnector.source, parts: 7, run: (limit, options) => ingestPrices(kosikConnector, limit, options) },
  // The current national flyers, ~1,000 offers (~170 small page files): read whole every day.
  { source: globusConnector.source, parts: 1, run: (limit, options) => ingestPrices(globusConnector, limit, options) },
  // Albert's flyers, read by a model page by page (lib/ingestion/albert.ts): the supermarket flyer
  // for the "Albert" chain, then the hypermarket flyer for "Albert Hypermarket", in one run. Pages
  // read before come from a cache; a run that runs out of time continues where it stopped next time.
  {
    source: albertSupermarketConnector.source,
    parts: 1,
    run: async (limit, options) =>
      mergeIngestResults(await ingestPrices(albertSupermarketConnector, limit, options), await ingestPrices(albertHypermarketConnector, limit, options)),
  },
]

// No batch cap of its own: a run's size is set by its part (and stopped by the time budget).
const UNLIMITED = 1_000_000

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
  for (const { source, run, parts } of selected) {
    if (now() >= deadline) {
      results[source] = { skipped: 'time budget exhausted before this source started' }
      continue
    }
    try {
      // Rotating refresh: this run reads the part the cursor names and moves the cursor on. Wrapped
      // into range, since the number of parts can change between deployments.
      const part = parts > 1 ? { index: (await getIngestionCursor(source)) % parts, count: parts } : undefined
      results[source] = await run(options.limit ?? UNLIMITED, { deadline, now, ...(part ? { part } : {}) })
      // Moved on also after a truncated run: repeating the same part would hit the same limit again
      // and never reach the others. A source that threw keeps its cursor and retries the part.
      if (part) await setIngestionCursor(source, (part.index + 1) % part.count)
    } catch (err) {
      results[source] = { error: err instanceof Error ? err.message : String(err) }
    }
  }
  return results
}
