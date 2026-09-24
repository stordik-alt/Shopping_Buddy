import type { ItemCategory } from '@/lib/types'
import {
  fetchDiscoveryCategoryPage,
  MAX_PAGE_SIZE,
  toNormalizedUnitPrice,
  unitPriceMatchesPackage,
  type DiscoveryProduct,
} from '@/lib/ingestion/product-discovery'
import type { FetchOptions, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// --- Fetcher (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) --------
// penny.cz runs the same web-shop platform as billa.cz (see product-discovery.ts) and this uses the
// same JSON endpoint its own category pages call. penny.cz's robots.txt contains no Disallow rules
// (only a `Sitemap:` line; checked 2026-09-24); the endpoint needs no login or token and showed no
// CAPTCHA/bot challenge.
//
// What the source actually is matters more than how it is read: penny.cz is NOT a full online
// catalog. Its whole product catalog is the current week's offers — 38 products on 2026-09-24,
// every one with a validity window (23.–29. 9.). So this is an offers connector: it feeds `deals`
// with real dated promotions, and records a regular price only where the source states one.

const BASE_URL = 'https://www.penny.cz'

// The site's own "all offers" category. Its other top-level categories (Potraviny, Cukrovinky, …)
// list the same offers split by aisle, so fetching this one alone covers everything once.
const OFFERS_CATEGORY_SLUG = 'vsechny-akce-99000000'

// Safety stop so a misbehaving `total` can never turn into an endless request loop.
const MAX_PAGES = 20

export type PennyRawProduct = DiscoveryProduct

/** Fetches up to `limit` offer products, page after page in the site's own relevance order.
 *  Requests are sequential, not parallel. Deterministic for a given site state. */
export async function fetchPennyProducts(limit: number, options: FetchOptions = {}): Promise<PennyRawProduct[]> {
  if (limit <= 0) return []
  // A fixed page size for every page — the API's paging is offset-based, so mixing sizes would skip
  // or repeat products.
  const pageSize = Math.min(limit, MAX_PAGE_SIZE)
  const products: PennyRawProduct[] = []
  const seen = new Set<string>()
  for (let page = 0; page < MAX_PAGES && products.length < limit; page++) {
    // Out of time budget: stop asking, keep what we have (the caller reports the run as truncated).
    if (options.deadline != null && Date.now() >= options.deadline) break
    const { results, total } = await fetchDiscoveryCategoryPage(BASE_URL, 'Penny', OFFERS_CATEGORY_SLUG, page, pageSize)
    for (const product of results) {
      if (seen.has(product.sku)) continue
      seen.add(product.sku)
      products.push(product)
    }
    if (results.length === 0 || (page + 1) * pageSize >= total) break
  }
  return products.slice(0, limit)
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

// Penny's top-level category names (lower-cased) that are food or drink. "VŠECHNY AKCE" is a
// collection that every offer belongs to, so it says nothing about the product and is ignored.
const GROCERY_TOP_LEVEL = new Set([
  'alkohol',
  'chlazené výrobky',
  'chléb a pečivo',
  'cukrovinky',
  'káva, čaj, kakao',
  'maso a uzeniny',
  'mražené výrobky',
  'nápoje',
  'ovoce a zelenina',
  'potraviny',
])

const NON_GROCERY_TOP_LEVEL: Record<string, ItemCategory> = {
  drogerie: 'Drogerie',
}

/** Maps Penny's category paths onto this app's fixed 5-category set. Food if any path's top level
 *  is food; otherwise the first known non-food mapping; defaults to 'Ostatní' rather than guessing
 *  (pet food, for instance, is not a grocery item here). */
export function mapPennyCategory(raw: PennyRawProduct): ItemCategory {
  const topLevels = (raw.parentCategories ?? []).map((path) => (path[0]?.name ?? '').trim().toLowerCase())
  if (topLevels.some((name) => GROCERY_TOP_LEVEL.has(name))) return 'Potraviny'
  for (const name of topLevels) {
    const mapped = NON_GROCERY_TOP_LEVEL[name]
    if (mapped) return mapped
  }
  return 'Ostatní'
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

/** Turns one raw Penny offer into a validated, normalized product — or `null` when it isn't usable,
 *  per CLAUDE.md section 33 ("reject or flag suspicious data rather than silently inserting it"):
 *  - no sku or name, or no positive offer price
 *  - not a food item (see `mapPennyCategory`) — the catalog is grocery-only, like the other connectors
 *  - a unit this app doesn't model, or an offer price whose unit price contradicts price ÷ package size
 *  - an offer window that ends before it starts (which of the two dates is wrong is unknowable)
 *  - sold by weight / approximate weight: none was seen at Penny, so the price semantics are
 *    unverified and such records are rejected rather than guessed at
 *  Currency: penny.cz publishes no currency field and sells only in Czech koruna, so CZK is assumed
 *  by source rather than read from the record.
 *
 *  Prices: `price.regular` is the offer (current) price. The regular price is only recorded when the
 *  source states one — `price.standard`, else the struck-through `price.crossed`. Offers with
 *  neither (e.g. a plain 15,90 Kč cola) give `regularPrice: null`: only the deal is stored, never
 *  the offer price posing as the everyday price (CLAUDE.md sections 16 and 18). An offer without
 *  usable dates is flagged with `promotionWithoutValidity` rather than stored with an invented
 *  window, and an already-ended offer is not stored as a deal.
 *  `today` is passed in so this stays pure and testable. */
export function normalizePennyProduct(raw: PennyRawProduct, today: string): NormalizedProduct | null {
  const externalId = (raw.sku ?? '').trim()
  const name = (raw.name ?? '').trim()
  if (!externalId || !name) return null
  if (raw.weightArticle || raw.weightPieceArticle) return null

  const offerHalere = raw.price?.regular?.value
  if (offerHalere == null || !Number.isFinite(offerHalere) || offerHalere <= 0) return null
  const offerPrice = offerHalere / 100

  const category = mapPennyCategory(raw)
  if (category !== 'Potraviny') return null

  const offerUnit = toNormalizedUnitPrice(raw.price?.baseUnitShort, raw.price?.basePriceFactor, raw.price?.regular?.perStandardizedQuantity)
  if (!offerUnit) return null
  const { unit } = offerUnit
  if (!unitPriceMatchesPackage(raw, offerPrice, unit, offerUnit.unitPrice)) return null

  // The regular (non-promotional) price and its unit price, when the source states them.
  let regularPrice: number | null = null
  let unitPrice: number | null = null
  const standardHalere = raw.price?.standard?.value
  const crossedHalere = raw.price?.crossed
  if (standardHalere != null && Number.isFinite(standardHalere) && standardHalere > 0) {
    // An offer dearer than the regular price is contradictory data — reject, don't pick a side.
    if (offerHalere > standardHalere) return null
    const standardUnit = toNormalizedUnitPrice(raw.price?.baseUnitShort, raw.price?.basePriceFactor, raw.price?.standard?.perStandardizedQuantity)
    if (standardUnit && standardUnit.unit === unit) {
      regularPrice = standardHalere / 100
      unitPrice = standardUnit.unitPrice
    }
  } else if (crossedHalere != null && Number.isFinite(crossedHalere) && crossedHalere > offerHalere) {
    // Same package, so the crossed-out price's unit price scales exactly with the price ratio.
    regularPrice = crossedHalere / 100
    unitPrice = Math.round(((offerUnit.unitPrice * crossedHalere) / offerHalere) * 100) / 100
  }

  const validFrom = raw.price?.validityStart
  const validUntil = raw.price?.validityEnd
  let deal: NormalizedProduct['deal']
  let promotionWithoutValidity = false
  if (validFrom && validUntil && ISO_DATE.test(validFrom) && ISO_DATE.test(validUntil)) {
    const from = validFrom.slice(0, 10)
    const until = validUntil.slice(0, 10)
    if (until < from) return null
    // The offer's own unit price is stored even when no regular price is known — then it is the only
    // way to compare the offer per kg/l.
    if (until >= today) deal = { dealPrice: offerPrice, unitPrice: offerUnit.unitPrice, validFrom: from, validUntil: until }
  } else {
    promotionWithoutValidity = true
  }

  return {
    externalId,
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

export const pennyConnector: PriceConnector<PennyRawProduct> = {
  source: 'penny',
  chain: 'Penny',
  fetchProducts: fetchPennyProducts,
  rawId: (raw) => raw.sku,
  normalize: normalizePennyProduct,
}
