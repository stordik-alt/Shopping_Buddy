import { TODAY } from '@/lib/budget'
import {
  getCanonicalStoreLocationId,
  getStoreIdByChain,
  loadExternalProductContext,
  recordPriceObservation,
  resolveOrCreateProductFromExternal,
  touchExternalRefs,
  upsertActiveDeal,
} from '@/lib/db/queries'
import { billaConnector } from '@/lib/ingestion/billa'
import { dmConnector } from '@/lib/ingestion/dm'
import { lidlConnector } from '@/lib/ingestion/lidl'
import { pennyConnector } from '@/lib/ingestion/penny'
import type { IngestResult, PriceConnector } from '@/lib/ingestion/types'

export type { IngestResult } from '@/lib/ingestion/types'

export type IngestOptions = {
  /** Epoch ms after which no further product is started. The run then ends cleanly with
   *  `truncated: true` instead of being killed mid-write by the platform's function time limit. */
  deadline?: number
  /** Clock, injectable for tests. */
  now?: () => number
}

/** Fetches + normalizes + validates + persists real prices for one store connector — the
 *  orchestration step of docs/02_ARCHITECTURE.md's External Source -> Fetcher -> Normalizer ->
 *  Validator -> Database pipeline, shared by every store. One product's failure doesn't abort the
 *  batch (per CLAUDE.md section 32, "if a retailer source stops working, the rest of the
 *  application should continue functioning") — it's recorded in `errors` and the rest still runs. */
export async function ingestPrices<Raw>(connector: PriceConnector<Raw>, limit: number, options: IngestOptions = {}): Promise<IngestResult> {
  const result: IngestResult = { processed: 0, recorded: 0, newProducts: 0, deals: 0, promotionsWithoutValidity: 0, skipped: 0, truncated: false, errors: [] }
  if (limit <= 0) return result
  const now = options.now ?? Date.now

  const raws = await connector.fetchProducts(limit, { deadline: options.deadline })
  result.processed = raws.length

  // Looked up once per run, not per product: each lookup is a database round trip, and per-product
  // lookups were what made a run of ~80 products take minutes (see loadExternalProductContext()).
  const [storeId, context] = await Promise.all([getStoreIdByChain(connector.chain), loadExternalProductContext(connector.source)])
  // Deals are still keyed by a concrete store location (the `deals` table wasn't part of the price
  // observation model change), so the seeded canonical branch is used for those only — looked up
  // lazily, since a connector whose source has no dated promotions never needs one.
  let storeLocationId: string | undefined
  // Products that were already linked before this run; their `lastSeenAt` is refreshed in one batch
  // at the end.
  const alreadyLinked: string[] = []

  for (const raw of raws) {
    if (options.deadline != null && now() >= options.deadline) {
      result.truncated = true
      break
    }
    try {
      const normalized = connector.normalize(raw, TODAY)
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
      // receipt-based STORE observation — `prices` is append-only and current price is derived per
      // context. Skipped when the source states no regular price (an offers-only source): the offer
      // then lives only in `deals`.
      if (normalized.regularPrice != null && normalized.unitPrice != null) {
        await recordPriceObservation({
          productId,
          storeId,
          storeLocationId: null,
          priceScope: 'CHAIN',
          sourceType: 'OFFICIAL',
          sourceReference: normalized.externalId,
          regularPrice: normalized.regularPrice,
          currency: normalized.currency,
          unit: normalized.unit,
          unitPrice: normalized.unitPrice,
          observedAt: normalized.recordedAt,
        })
        result.recorded++
      }

      if (normalized.deal) {
        storeLocationId ??= await getCanonicalStoreLocationId(connector.chain)
        await upsertActiveDeal({
          productId,
          storeLocationId,
          dealPrice: normalized.deal.dealPrice,
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

/** Every store connector run by the daily cron. Adding a store means adding its connector here
 *  (each entry closes over its own raw type, so the list needs no shared generic). */
export const PRICE_SOURCES: { source: string; run: (limit: number, options?: IngestOptions) => Promise<IngestResult> }[] = [
  { source: lidlConnector.source, run: (limit, options) => ingestPrices(lidlConnector, limit, options) },
  { source: billaConnector.source, run: (limit, options) => ingestPrices(billaConnector, limit, options) },
  { source: pennyConnector.source, run: (limit, options) => ingestPrices(pennyConnector, limit, options) },
  { source: dmConnector.source, run: (limit, options) => ingestPrices(dmConnector, limit, options) },
]

export type SourceOutcome = IngestResult | { error: string } | { skipped: string }

/** Runs price ingestion for one source (`only`) or for all of them one after another, all inside a
 *  single time budget. Each source is isolated (CLAUDE.md section 32): one throwing does not stop
 *  the others. A source that would start after the budget is used up is reported as skipped rather
 *  than begun, and a source running when the budget ends stops between products — so the whole call
 *  finishes on its own, before the platform's function time limit, instead of being killed. */
export async function runPriceSources(options: {
  only?: string
  limit: number
  budgetMs: number
  now?: () => number
  sources?: typeof PRICE_SOURCES
}): Promise<Record<string, SourceOutcome>> {
  const now = options.now ?? Date.now
  const deadline = now() + options.budgetMs
  const all = options.sources ?? PRICE_SOURCES
  const selected = options.only ? all.filter((entry) => entry.source === options.only) : all

  const results: Record<string, SourceOutcome> = {}
  for (const { source, run } of selected) {
    if (now() >= deadline) {
      results[source] = { skipped: 'time budget exhausted before this source started' }
      continue
    }
    try {
      results[source] = await run(options.limit, { deadline, now })
    } catch (err) {
      results[source] = { error: err instanceof Error ? err.message : String(err) }
    }
  }
  return results
}
