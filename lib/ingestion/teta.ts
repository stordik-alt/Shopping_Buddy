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
  // Current public catalog top-level labels observed on Teta's /eshop/produkty/vse page.
  pleť: 'Drogerie',
  vlasy: 'Drogerie',
  tělo: 'Drogerie',
  hygiena: 'Drogerie',
  'krása a parfémy': 'Drogerie',
  muži: 'Drogerie',
  'péče o zdraví': 'Drogerie',
  domácnost: 'Domácnost',
  děti: 'Děti',
  potraviny: 'Potraviny',
  mazlíčci: 'Ostatní',
  papírnictví: 'Ostatní',
  sezona: 'Ostatní',
  textil: 'Ostatní',
  // Legacy/leaf labels retained for snapshots that already use the earlier contract.
  'péče o tělo': 'Drogerie',
  'vlasová kosmetika': 'Drogerie',
  kosmetika: 'Drogerie',
  'dentální hygiena': 'Drogerie',
  'čištění a praní': 'Domácnost',
  'úklid a praní': 'Domácnost',
  'péče o dítě': 'Děti',
}

/** A real calendar date in YYYY-MM-DD form (rejects e.g. 2026-13-45). */
function isValidIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

/**
 * The 14 top-level e-shop categories, by Teta's own taxon code — the slug that appears in the
 * category URL ("/eshop/produkty/hygiena"). The code is the stable key: the retailer can re-word a
 * category's display name ("Krása a parfémy"), but the code stays. Verified against the live
 * payload of a product page (2026-10-22): the codes are domacnost, deti, plet, vlasy, telo, hygiena,
 * krasa-a-parfemy, muzi, pece-o-zdravi, potraviny, mazlicci, papirnictvi, sezona, textil.
 */
export const TETA_TOP_LEVEL_CATEGORY_CODES: Record<string, ItemCategory> = {
  hygiena: 'Drogerie',
  plet: 'Drogerie',
  vlasy: 'Drogerie',
  telo: 'Drogerie',
  'krasa-a-parfemy': 'Drogerie',
  muzi: 'Drogerie',
  'pece-o-zdravi': 'Drogerie',
  domacnost: 'Domácnost',
  deti: 'Děti',
  potraviny: 'Potraviny',
  mazlicci: 'Ostatní',
  papirnictvi: 'Ostatní',
  sezona: 'Ostatní',
  textil: 'Ostatní',
}

/** "Krása a parfémy" -> "krasa-a-parfemy": the slug form of a category name, so a name and its
 *  code can be compared without listing both spellings. */
export function tetaCategorySlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** The 14 top-level categories, in the order the collector walks them. */
export const TETA_TOP_LEVEL_CATEGORY_LIST = Object.keys(TETA_TOP_LEVEL_CATEGORY_CODES)

/** The app category of a top-level category, by its taxon code. */
export function mapTetaCategoryCode(code: string | null | undefined): ItemCategory | null {
  return TETA_TOP_LEVEL_CATEGORY_CODES[(code ?? '').trim().toLowerCase()] ?? null
}

/** The app category of a top-level category, by its display name. */
export function mapTetaCategoryName(name: string | null | undefined): ItemCategory | null {
  const trimmed = (name ?? '').trim().toLowerCase()
  if (!trimmed) return null
  const direct = TOP_LEVEL_CATEGORY[trimmed]
  if (direct) return direct
  // The name may be the slug or a differently punctuated wording of the same category.
  const slug = tetaCategorySlug(trimmed)
  for (const [key, category] of Object.entries(TOP_LEVEL_CATEGORY)) {
    if (tetaCategorySlug(key) === slug) return category
  }
  return null
}

export function mapTetaCategory(raw: TetaRawProduct): ItemCategory | null {
  return mapTetaCategoryName(raw.categoryPath?.[0])
}

/** Validates + normalizes one record, or null when unusable: missing identity, non-positive price,
 *  non-CZK currency, unknown category, malformed/unsupported stated unit price, or a unit price
 *  contradicting package size. A missing unit price may use the existing package-price fallback;
 *  an explicitly stated but unsupported unit is rejected rather than guessed as 1 ks. A promotion
 *  is stored as a deal only when it states a valid end date; otherwise it is flagged without
 *  inventing a validity window. Club prices are not persisted as regular prices. */
export function normalizeTetaProduct(raw: TetaRawProduct, today: string): NormalizedProduct | null {
  if (raw == null || typeof raw !== 'object') return null
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
    // A stated unit price must be a positive price over a positive quantity; anything else is
    // malformed data, not a reason to silently fall back to the package price.
    if (!(raw.unitPrice.price > 0) || !(raw.unitPrice.per > 0)) return null
    const converted = toNormalizedUnitPrice(raw.unitPrice.unit, String(raw.unitPrice.per), Math.round(raw.unitPrice.price * 100))
    if (converted) {
      if (raw.package && !unitPriceMatchesPackage({ sku: id, amount: raw.package.amount, volumeLabelShort: raw.package.unit }, raw.price, converted.unit, converted.unitPrice)) {
        return null
      }
      unit = converted.unit
      currentUnitPrice = converted.unitPrice
    } else {
      // A source-declared unit we cannot normalize is not equivalent to one piece/package.
      return null
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
    if (until && isValidIsoDate(until) && until >= today) {
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
  /** Records showing a loyalty-club price, which is deliberately not imported. */
  clubPricesIgnored: number
}

function rejectionReason(raw: TetaRawProduct): string {
  if (raw == null || typeof raw !== 'object') return 'not an object'
  if (!(raw.id ?? '').trim() || !(raw.name ?? '').trim()) return 'missing id or name'
  if (!Number.isFinite(raw.price) || raw.price <= 0) return 'invalid price'
  if (raw.currency !== 'CZK') return 'currency is not CZK'
  if (!mapTetaCategory(raw)) return 'unknown category'
  return 'invalid or contradictory unit price'
}

/** Dry run: validates a snapshot and reports what an import would accept, without any database or
 *  network access. Duplicate source ids are reported and only the first record is kept. */
export function dryRunTeta(records: TetaRawProduct[], today: string): TetaDryRunReport {
  const report: TetaDryRunReport = { total: records.length, accepted: [], rejected: [], duplicates: [], deals: 0, promotionsWithoutValidity: 0, withEan: 0, clubPricesIgnored: 0 }
  const seen = new Set<string>()
  for (const raw of records) {
    const id = String(raw?.id ?? '').trim()
    if (id && seen.has(id)) {
      report.duplicates.push(id)
      continue
    }
    seen.add(id)
    const product = normalizeTetaProduct(raw, today)
    if (!product) {
      report.rejected.push({ id, reason: rejectionReason(raw) })
      continue
    }
    report.accepted.push(product)
    if (product.deal) report.deals += 1
    if (product.promotionWithoutValidity) report.promotionsWithoutValidity += 1
    if (raw.ean) report.withEan += 1
    if (raw.clubPrice != null) report.clubPricesIgnored += 1
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
