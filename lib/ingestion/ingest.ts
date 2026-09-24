import { TODAY } from '@/lib/budget'
import { findProductIdByExternalRef, getCanonicalStoreLocationId, getStoreIdByChain, recordPriceObservation, resolveOrCreateProductFromExternal, upsertActiveDeal } from '@/lib/db/queries'
import { billaConnector } from '@/lib/ingestion/billa'
import { lidlConnector } from '@/lib/ingestion/lidl'
import type { IngestResult, PriceConnector } from '@/lib/ingestion/types'

export type { IngestResult } from '@/lib/ingestion/types'

/** Fetches + normalizes + validates + persists real prices for one store connector — the
 *  orchestration step of docs/02_ARCHITECTURE.md's External Source -> Fetcher -> Normalizer ->
 *  Validator -> Database pipeline, shared by every store. One product's failure doesn't abort the
 *  batch (per CLAUDE.md section 32, "if a retailer source stops working, the rest of the
 *  application should continue functioning") — it's recorded in `errors` and the rest still runs. */
export async function ingestPrices<Raw>(connector: PriceConnector<Raw>, limit: number): Promise<IngestResult> {
  const result: IngestResult = { processed: 0, recorded: 0, newProducts: 0, deals: 0, promotionsWithoutValidity: 0, skipped: 0, errors: [] }
  if (limit <= 0) return result

  const raws = await connector.fetchProducts(limit)
  result.processed = raws.length

  const storeId = await getStoreIdByChain(connector.chain)
  // Deals are still keyed by a concrete store location (the `deals` table wasn't part of the price
  // observation model change), so the seeded canonical branch is used for those only — looked up
  // lazily, since a connector whose source has no dated promotions never needs one.
  let storeLocationId: string | undefined

  for (const raw of raws) {
    try {
      const normalized = connector.normalize(raw, TODAY)
      if (!normalized) {
        result.skipped++
        continue
      }

      const existedBefore = await findProductIdByExternalRef(connector.source, normalized.externalId)
      const productId = await resolveOrCreateProductFromExternal({
        externalId: normalized.externalId,
        source: connector.source,
        name: normalized.name,
        category: normalized.category,
        unit: normalized.unit,
      })
      if (!existedBefore) result.newProducts++

      // A retailer's own website publishes one price per product, not per branch, so this is an
      // official CHAIN-scope observation with no physical location (docs/02_PROJECT_CONTEXT.md:
      // "Official chain price: CHAIN + store_location_id=NULL + OFFICIAL"). It never overwrites a
      // receipt-based STORE observation — `prices` is append-only and current price is derived per
      // context.
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

  return result
}

/** Every store connector run by the daily cron. Adding a store means adding its connector here
 *  (each entry closes over its own raw type, so the list needs no shared generic). */
export const PRICE_SOURCES: { source: string; run: (limit: number) => Promise<IngestResult> }[] = [
  { source: lidlConnector.source, run: (limit) => ingestPrices(lidlConnector, limit) },
  { source: billaConnector.source, run: (limit) => ingestPrices(billaConnector, limit) },
]
