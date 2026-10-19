import type { ItemCategory, ItemUnit } from '@/lib/types'
import { toNormalizedUnitPrice, unitPriceMatchesPackage } from '@/lib/ingestion/product-discovery'
import type { NormalizedProduct } from '@/lib/ingestion/types'

// Teta drogerie (tetadrogerie.cz) — PROPOSED importer, docs/42_TETA_DATA_SOURCE_AUDIT.md.
// Nothing here talks to the live site: no endpoint of tetadrogerie.cz has been verified, so there is
// deliberately NO fetcher and NO registered connector. The real response shape is unknown; the
// `TetaRawProduct` below is ANITKA's own snapshot contract — a fetcher written later (after the
// live responses are inspected) must map the e-shop's data into it. Until then records come from
// fixture files (lib/ingestion/fixtures/teta-catalog.sample.json, synthetic data only).
// Persistence is not wired: `product_source` has no 'teta' value yet, so going live needs a
// migration (additive enum value) plus a seeded `stores.chain = 'Teta'` row.

export const TETA_CHAIN = 'Teta'

/** ANITKA's snapshot contract for one Teta online product (not the e-shop's own response shape). */
export type TetaRawProduct = {
  /** The e-shop's own stable product id/SKU, as a string. Never the name. */
  id: string
  name: string
  brand?: string
  /** Current online price in `currency` (packaged price). */
  price: number
  currency: string
  /** Price before a promotion, when the page shows one. */
  originalPrice?: number
  /** A loyalty-club price when shown; kept out of the regular price — it is conditional. */
  clubPrice?: number
  /** Package size as printed, e.g. `{ amount: '500', unit: 'ml' }`. */
  package?: { amount: string; unit: string }
  /** The displayed unit price, e.g. 'Kč za 100 ml'-style: price per `per` × `unit`. */
  unitPrice?: { price: number; per: number; unit: string }
  /** The e-shop's category path, top level first. */
  categoryPath?: string[]
  /** Not verified to be published by Teta; carried only if present, never required or invented. */
  ean?: string
  /** Promotion end (ISO date) if, and only if, the page states one. */
  promotionValidUntil?: string
}

const TOP_LEVEL_CATEGORY: Record<string, ItemCategory> = {
  'péče o tělo': 'Drogerie',
  'vlasová kosmetika': 'Drogerie',
  kosmetika: 'Drogerie',
  'dentální hygiena': 'Drogerie',
  'čištění a praní': 'Domácnost',
  'úklid a praní': 'Domácnost',
  domácnost: 'Domácnost',
  'péče o dítě': 'Děti',
  děti: 'Děti',
}

export function mapTetaCategory(raw: TetaRawProduct): ItemCategory | null {
  return TOP_LEVEL_CATEGORY[(raw.categoryPath?.[0] ?? '').trim().toLowerCase()] ?? null
}

/** Validates + normalizes one record, or `null` when unusable (CLAUDE.md section 33): missing id or
 *  name, non-positive price, non-CZK currency, unknown category, or a unit price contradicting
 *  price ÷ package size. Unknown unit => one package = "1 ks" at the package price (the DM/Lidl
 *  convention). A promotion (`originalPrice` > `price`) is stored as a deal only when it states a
 *  valid end date; otherwise it is flagged `promotionWithoutValidity` — a window is never invented.
 *  Club prices are ignored here. */
export function normalizeTetaProduct(raw: TetaRawProduct, today: string): NormalizedProduct | null {
  const id = (raw.id ?? '').trim()
  const baseName = (raw.name ?? '').trim()
  if (!id || !baseName) return null
  const brand = (raw.brand ?? '').trim()
  const name = brand && !baseName.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${baseName}` : baseName

  if (!Number.isFinite(raw.price) || raw.price <= 0) return null
  if (raw.currency !== 'CZK') return null
  const category = mapTetaCategory(raw)
  if (!category) return null

  let unit: ItemUnit = 'ks'
  let currentUnitPrice = raw.price
  if (raw.unitPrice) {
    const converted = toNormalizedUnitPrice(raw.unitPrice.unit, String(raw.unitPrice.per), Math.round(raw.unitPrice.price * 100))
    if (converted) {
      if (raw.package && !unitPriceMatchesPackage({ sku: id, amount: raw.package.amount, volumeLabelShort: raw.package.unit }, raw.price, converted.unit, converted.unitPrice)) {
        return null
      }
      unit = converted.unit
      currentUnitPrice = converted.unitPrice
    }
  }

  let regularPrice = raw.price
  let unitPrice = currentUnitPrice
  let deal: NormalizedProduct['deal']
  let promotionWithoutValidity = false
  if (raw.originalPrice != null && Number.isFinite(raw.originalPrice) && raw.originalPrice > raw.price) {
    regularPrice = raw.originalPrice
    unitPrice = Math.round(((currentUnitPrice * raw.originalPrice) / raw.price) * 100) / 100
    const until = raw.promotionValidUntil
    if (until && /^\d{4}-\d{2}-\d{2}$/.test(until) && until >= today) {
      deal = { dealPrice: raw.price, unitPrice: currentUnitPrice, validFrom: today, validUntil: until }
    } else {
      promotionWithoutValidity = true
    }
  }

  return {
    externalId: id,
    name,
    category,
    unit,
    unitPrice,
    regularPrice,
    currency: 'CZK',
    recordedAt: today,
    deal,
    promotionWithoutValidity: promotionWithoutValidity || undefined,
  }
}

export type TetaDryRunReport = {
  total: number
  accepted: NormalizedProduct[]
  rejected: { id: string; reason: string }[]
  duplicates: string[]
  deals: number
  promotionsWithoutValidity: number
  withEan: number
}

/** Dry run: validates a snapshot and reports what an import would accept, without any database or
 *  network access. Duplicate source ids are reported and only the first record is kept. */
export function dryRunTeta(records: TetaRawProduct[], today: string): TetaDryRunReport {
  const report: TetaDryRunReport = { total: records.length, accepted: [], rejected: [], duplicates: [], deals: 0, promotionsWithoutValidity: 0, withEan: 0 }
  const seen = new Set<string>()
  for (const raw of records) {
    const id = String(raw?.id ?? '')
    if (id && seen.has(id)) {
      report.duplicates.push(id)
      continue
    }
    seen.add(id)
    const product = normalizeTetaProduct(raw, today)
    if (!product) {
      report.rejected.push({ id, reason: 'failed validation (id, name, price, currency, category or unit price)' })
      continue
    }
    report.accepted.push(product)
    if (product.deal) report.deals += 1
    if (product.promotionWithoutValidity) report.promotionsWithoutValidity += 1
    if (raw.ean) report.withEan += 1
  }
  return report
}

/** Parses a fixture file's JSON: `{ "products": TetaRawProduct[] }`. Throws on a wrong shape. */
export function parseTetaFixture(json: string): TetaRawProduct[] {
  const data: unknown = JSON.parse(json)
  const products = (data as { products?: unknown } | null)?.products
  if (!Array.isArray(products)) throw new Error('Teta fixture must be an object with a "products" array')
  return products as TetaRawProduct[]
}
