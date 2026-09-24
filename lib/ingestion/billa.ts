import type { ItemCategory } from '@/lib/types'
import {
  fetchDiscoveryCategoryPage,
  toNormalizedUnitPrice,
  unitPriceMatchesPackage,
  UNIT_PRICE_TOLERANCE,
  type DiscoveryProduct,
} from '@/lib/ingestion/product-discovery'
import type { FetchOptions, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// The unit-price conversion is shared with the other retailers on this web-shop platform.
export { toNormalizedUnitPrice }

// --- Fetcher (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) --------
// billa.cz has no public retailer API. Like the Lidl connector, this uses the site's own JSON
// endpoint that its category pages call to render their product grids (observed via network
// capture on 2026-09-24) — not a protected or undocumented back door. billa.cz's robots.txt
// contains no Disallow rules at all (only a `Sitemap:` line; checked 2026-09-24), and the
// endpoint needs no login or token and showed no CAPTCHA/bot challenge.
//
// Listing a category returns full product records (price, package size, unit price, categories),
// so one request yields many products — far lighter than fetching each ~575 KB product page.

const BASE_URL = 'https://www.billa.cz'

// Billa's top-level grocery categories, taken from the site's own /produkty navigation
// (2026-09-24). A category page lists products from all its sub-categories, so these nine cover
// the whole food range without visiting sub-categories. Deliberately excluded:
// - non-food top levels (Domácnost, Drogerie a kosmetika, Péče o dítě, Mazlíčci, Tabákové produkty)
// - cross-cutting "collections" (BILLA vlastní výroba, Farmářské a lokální produkty, Šetříme
//   jídlem), whose products already appear under a regular category — fetching them would only
//   repeat products.
export const BILLA_GROCERY_CATEGORY_SLUGS = [
  'ovoce-a-zelenina-1165',
  'pecivo-1198',
  'chlazene-mlecne-a-rostlinne-vyrobky-1207',
  'maso-a-ryby-1263',
  'uzeniny-lahudky-a-hotova-jidla-1276',
  'mrazene-1307',
  'trvanlive-potraviny-1332',
  'cukrovinky-1449',
  'napoje-1474',
]

export type BillaRawProduct = DiscoveryProduct

/** Fetches one page (0-based) of a Billa category's products. */
export async function fetchBillaCategoryPage(slug: string, page: number, pageSize: number): Promise<BillaRawProduct[]> {
  return (await fetchDiscoveryCategoryPage(BASE_URL, 'Billa', slug, page, pageSize)).results
}

/** Fetches up to `limit` products, spread evenly over the grocery categories (first page of each,
 *  in the site's own relevance order) so the pilot batch is diverse instead of one aisle. Requests
 *  run one after another, not in parallel, to stay well clear of anything that looks like abuse.
 *  Deterministic for a given site state, so a product's price history stays continuous run to run. */
export async function fetchBillaProducts(limit: number, options: FetchOptions = {}): Promise<BillaRawProduct[]> {
  if (limit <= 0) return []
  const perCategory = Math.ceil(limit / BILLA_GROCERY_CATEGORY_SLUGS.length)
  const products: BillaRawProduct[] = []
  const seen = new Set<string>()
  for (const slug of BILLA_GROCERY_CATEGORY_SLUGS) {
    // Out of time budget: stop asking, keep what we have (the caller reports the run as truncated).
    if (options.deadline != null && Date.now() >= options.deadline) break
    for (const product of await fetchBillaCategoryPage(slug, 0, perCategory)) {
      // A product can be listed under two top-level categories; keep it once.
      if (seen.has(product.sku)) continue
      seen.add(product.sku)
      products.push(product)
    }
  }
  return products.slice(0, limit)
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

// Top-level Billa category names (lower-cased) that are food. The category tree carries the real
// category, so this — not a name heuristic — is the authoritative grocery gate, same role as
// `mapLidlCategory()` for Lidl.
const GROCERY_TOP_LEVEL = new Set([
  'ovoce a zelenina',
  'pečivo',
  'chlazené, mléčné a rostlinné výrobky',
  'maso a ryby',
  'uzeniny, lahůdky a hotová jídla',
  'mražené',
  'trvanlivé potraviny',
  'cukrovinky',
  'nápoje',
  'speciální a rostlinná výživa',
])

const NON_GROCERY_TOP_LEVEL: Record<string, ItemCategory> = {
  'drogerie a kosmetika': 'Drogerie',
  'péče o dítě': 'Děti',
  domácnost: 'Domácnost',
}

/** Maps Billa's category paths onto this app's fixed 5-category set. A product can sit under
 *  several paths (e.g. cheese under both dairy and the deli counter); it is food if any path's
 *  top level is food. Defaults to 'Ostatní' rather than guessing. */
export function mapBillaCategory(raw: BillaRawProduct): ItemCategory {
  const topLevels = (raw.parentCategories ?? []).map((path) => (path[0]?.name ?? '').trim().toLowerCase())
  if (topLevels.some((name) => GROCERY_TOP_LEVEL.has(name))) return 'Potraviny'
  for (const name of topLevels) {
    const mapped = NON_GROCERY_TOP_LEVEL[name]
    if (mapped) return mapped
  }
  return 'Ostatní'
}

/** Turns one raw Billa record into a validated, normalized product — or `null` when it isn't
 *  usable, per CLAUDE.md section 33 ("reject or flag suspicious data rather than silently
 *  inserting it"):
 *  - no sku or name, or no positive regular price
 *  - not a food item (see `mapBillaCategory`) — the catalog is grocery-only, like the Lidl connector
 *  - a unit this app doesn't model, or a weight-priced product whose unit isn't kg
 *  - a fixed-weight product's package size and unit price disagree (see UNIT_PRICE_TOLERANCE)
 *  Currency: billa.cz publishes no currency field and sells only in Czech koruna, so CZK is assumed
 *  by source rather than read from the record.
 *
 *  Promotions: the regular price is always the recorded price (`price.standard` while a promotion
 *  runs) so a temporary discount never masquerades as the everyday price (CLAUDE.md section 18).
 *  Billa publishes no end date for its promotions, and `deals` requires one, so a running promotion
 *  is flagged with `promotionWithoutValidity` rather than stored with an invented window.
 *  `today` is passed in so this stays pure and testable. */
export function normalizeBillaProduct(raw: BillaRawProduct, today: string): NormalizedProduct | null {
  const externalId = (raw.sku ?? '').trim()
  const name = (raw.name ?? '').trim()
  if (!externalId || !name) return null

  const regularBase = raw.price?.standard ?? raw.price?.regular
  const regularHalere = regularBase?.value
  if (regularHalere == null || !Number.isFinite(regularHalere) || regularHalere <= 0) return null
  let regularPrice = regularHalere / 100

  const category = mapBillaCategory(raw)
  if (category !== 'Potraviny') return null

  const normalized = toNormalizedUnitPrice(raw.price?.baseUnitShort, raw.price?.basePriceFactor, regularBase?.perStandardizedQuantity)
  if (!normalized) return null
  const { unit, unitPrice } = normalized

  if (raw.weightPieceArticle) {
    // The listed price is only an estimate for one piece of roughly `weightPerPiece` grams — the
    // actual weight, and so the actual price, varies. The per-kg price is the reliable figure, so
    // it is recorded as the price (per kg), the same shape as a product sold purely by weight.
    if (unit !== 'kg') return null
    regularPrice = unitPrice
  } else if (raw.weightArticle) {
    // The listed price is per kg, so it is its own unit price.
    if (unit !== 'kg' || Math.abs(unitPrice - regularPrice) > regularPrice * UNIT_PRICE_TOLERANCE) return null
  } else if (!unitPriceMatchesPackage(raw, regularPrice, unit, unitPrice)) {
    return null
  }

  const currentHalere = raw.price?.regular?.value
  const onPromotion = raw.price?.standard != null && currentHalere != null && currentHalere > 0 && currentHalere < regularHalere

  return {
    externalId,
    name,
    category,
    unit,
    unitPrice,
    regularPrice,
    currency: 'CZK',
    recordedAt: today,
    promotionWithoutValidity: onPromotion || undefined,
  }
}

export const billaConnector: PriceConnector<BillaRawProduct> = {
  source: 'billa',
  chain: 'Billa',
  fetchProducts: fetchBillaProducts,
  rawId: (raw) => raw.sku,
  normalize: normalizeBillaProduct,
}
