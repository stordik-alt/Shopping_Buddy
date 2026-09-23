import { TODAY } from '@/lib/budget'
import { findProductIdByExternalRef, getCanonicalStoreLocationId, recordPriceObservation, resolveOrCreateProductFromExternal, upsertActiveDeal } from '@/lib/db/queries'
import { fetchLidlProducts, normalizeLidlProduct } from '@/lib/ingestion/lidl'

export type IngestResult = {
  processed: number
  recorded: number
  newProducts: number
  deals: number
  skipped: number
  errors: string[]
}

/** Fetches + normalizes + validates + persists real Lidl prices for a given list of erpNumbers —
 *  the orchestration step of docs/02_ARCHITECTURE.md's External Source -> Fetcher -> Normalizer ->
 *  Validator -> Database pipeline. One product's failure doesn't abort the batch (per CLAUDE.md
 *  section 32, "if a retailer source stops working, the rest of the application should continue
 *  functioning") — it's recorded in `errors` and the rest still runs. */
export async function ingestLidlPrices(erpNumbers: string[]): Promise<IngestResult> {
  const result: IngestResult = { processed: 0, recorded: 0, newProducts: 0, deals: 0, skipped: 0, errors: [] }
  if (erpNumbers.length === 0) return result

  const raws = await fetchLidlProducts(erpNumbers)
  result.processed = raws.length

  const storeLocationId = await getCanonicalStoreLocationId('Lidl')

  for (const raw of raws) {
    try {
      const normalized = normalizeLidlProduct(raw, TODAY)
      if (!normalized) {
        result.skipped++
        continue
      }

      const existedBefore = await findProductIdByExternalRef('lidl', normalized.externalId)
      const productId = await resolveOrCreateProductFromExternal({
        externalId: normalized.externalId,
        source: 'lidl',
        name: normalized.name,
        category: normalized.category,
        unit: normalized.unit,
      })
      if (!existedBefore) result.newProducts++

      await recordPriceObservation({
        productId,
        storeLocationId,
        regularPrice: normalized.regularPrice,
        currency: normalized.currency,
        unit: normalized.unit,
        unitPrice: normalized.unitPrice,
        recordedAt: normalized.recordedAt,
      })
      result.recorded++

      if (normalized.deal) {
        await upsertActiveDeal({
          productId,
          storeLocationId,
          dealPrice: normalized.deal.dealPrice,
          currency: normalized.currency,
          validFrom: normalized.deal.validFrom,
          validUntil: normalized.deal.validUntil,
        })
        result.deals++
      }
    } catch (err) {
      result.errors.push(`${raw.erpNumber}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}
