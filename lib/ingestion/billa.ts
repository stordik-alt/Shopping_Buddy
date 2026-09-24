import type { ItemCategory, ItemUnit } from '@/lib/types'
import type { NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

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
const CATEGORY_PRODUCTS_PATH = '/api/product-discovery/categories'

// Identifies this app to the retailer instead of hiding behind a browser User-Agent.
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'

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

// The API's page-size cap was verified up to 50; stay at or below it.
const MAX_PAGE_SIZE = 50

// Shape is a deliberately small subset of the real response — only the fields this connector
// reads. Prices are integers in haléře (1/100 Kč).
export type BillaRawProduct = {
  sku: string
  name?: string
  /** Package size as a plain number string, in `volumeLabelShort` units (e.g. "225" with "g"). */
  amount?: string
  volumeLabelShort?: string
  /** Sold by weight at a per-kg price (deli counter, loose produce) rather than a fixed package. */
  weightArticle?: boolean
  /** Sold by approximate piece weight (e.g. a chicken quarter ~855 g): `price.*.value` is only the
   *  estimated price of one typical piece, while the per-kg unit price is exact. */
  weightPieceArticle?: boolean
  parentCategories?: { name: string }[][]
  price?: {
    baseUnitShort?: string
    basePriceFactor?: string
    /** Regular (non-promotional) price — only present while a promotion is running. */
    standard?: { value?: number; perStandardizedQuantity?: number }
    /** Current selling price; equals the regular price when no promotion is running. */
    regular?: { value?: number; perStandardizedQuantity?: number }
  }
}

type BillaCategoryResponse = { results?: BillaRawProduct[] }

/** Fetches the first `pageSize` products of one category (0-based `page`). */
export async function fetchBillaCategoryPage(slug: string, page: number, pageSize: number): Promise<BillaRawProduct[]> {
  const size = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
  const url = `${BASE_URL}${CATEGORY_PRODUCTS_PATH}/${slug}/products?page=${page}&pageSize=${size}&sortBy=relevance`
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`Billa category ${slug} fetch failed: HTTP ${response.status}`)
  const body = (await response.json()) as BillaCategoryResponse
  if (!Array.isArray(body.results)) throw new Error(`Billa category ${slug} returned an unexpected response shape`)
  return body.results
}

/** Fetches up to `limit` products, spread evenly over the grocery categories (first page of each,
 *  in the site's own relevance order) so the pilot batch is diverse instead of one aisle. Requests
 *  run one after another, not in parallel, to stay well clear of anything that looks like abuse.
 *  Deterministic for a given site state, so a product's price history stays continuous run to run. */
export async function fetchBillaProducts(limit: number): Promise<BillaRawProduct[]> {
  if (limit <= 0) return []
  const perCategory = Math.ceil(limit / BILLA_GROCERY_CATEGORY_SLUGS.length)
  const products: BillaRawProduct[] = []
  const seen = new Set<string>()
  for (const slug of BILLA_GROCERY_CATEGORY_SLUGS) {
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

/** Converts Billa's unit price (per `factor` of `baseUnit`, in haléře) into Kč per kg / l / ks —
 *  the normalized units of CLAUDE.md section 17. Billa quotes gram and millilitre products per
 *  100 g / 100 ml (`basePriceFactor` "100"), which are scaled to a full kg / l so unit prices of
 *  different products stay directly comparable. `null` for a unit this app doesn't model. */
export function toNormalizedUnitPrice(
  baseUnit: string | undefined,
  factor: string | undefined,
  perStandardizedHalere: number | undefined,
): { unit: ItemUnit; unitPrice: number } | null {
  if (perStandardizedHalere == null || !Number.isFinite(perStandardizedHalere) || perStandardizedHalere <= 0) return null
  const base = Number(factor ?? '1')
  if (!Number.isFinite(base) || base <= 0) return null
  const perStandardizedKc = perStandardizedHalere / 100
  const round = (value: number) => Math.round(value * 100) / 100
  switch (baseUnit) {
    case 'kg':
    case 'l':
    case 'ks':
      return { unit: baseUnit, unitPrice: round(perStandardizedKc / base) }
    case 'g':
      return { unit: 'kg', unitPrice: round((perStandardizedKc * 1000) / base) }
    case 'ml':
      return { unit: 'l', unitPrice: round((perStandardizedKc * 1000) / base) }
    default:
      return null
  }
}

/** Package size in the normalized unit (kg / l / ks), or `null` when unstated or not convertible. */
function packageQuantity(amount: string | undefined, label: string | undefined): { quantity: number; unit: ItemUnit } | null {
  const value = Number((amount ?? '').replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  switch (label) {
    case 'g':
      return { quantity: value / 1000, unit: 'kg' }
    case 'kg':
      return { quantity: value, unit: 'kg' }
    case 'ml':
      return { quantity: value / 1000, unit: 'l' }
    case 'l':
      return { quantity: value, unit: 'l' }
    case 'ks':
      return { quantity: value, unit: 'ks' }
    default:
      return null
  }
}

// Billa's own price, unit price and package size are separate fields that can disagree (the Globus
// research found the same class of problem). A 3 % band absorbs the retailer rounding the unit
// price to whole haléře; anything beyond that is treated as bad data, not averaged away.
const UNIT_PRICE_TOLERANCE = 0.03

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
  } else {
    const pack = packageQuantity(raw.amount, raw.volumeLabelShort)
    // Only cross-check when the stated package size is in the same unit family as the unit price;
    // otherwise (e.g. a "ks" count on a per-kg product) there is nothing sound to compare.
    if (pack && pack.unit === unit) {
      const expectedUnitPrice = regularPrice / pack.quantity
      if (Math.abs(unitPrice - expectedUnitPrice) > expectedUnitPrice * UNIT_PRICE_TOLERANCE) return null
    }
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
