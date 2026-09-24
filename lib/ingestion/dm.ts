import type { ItemCategory, ItemUnit } from '@/lib/types'
import { toNormalizedUnitPrice, unitPriceMatchesPackage } from '@/lib/ingestion/product-discovery'
import type { NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// --- Fetcher (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) --------
// dm.cz (dm drogerie markt) declares a dedicated product sitemap in its robots.txt, whose Disallow
// rules cover only transactional pages (/cart, /search, /shopping-list, gift-card flows; checked
// 2026-09-24). Its product data lives on a separate host, products.dm.de, which the dm.cz product
// pages themselves call: a plain REST API that needs no login, token or cookie and showed no
// CAPTCHA/bot challenge. products.dm.de publishes no robots.txt (404), so no restriction is
// declared for it. Two endpoints are used:
//   GET /product/products/tiles/CZ/dans/<id,id,...>  batch of product tiles (price, unit price, GTIN)
//   GET /product/products/detail/CZ/dan/<id>         one product's detail (category breadcrumbs)
// The tile has only leaf categories, so the top-level category — needed to tell drugstore goods
// from food or baby care — comes from one small (~2.5 KB) detail request per product.

const SITEMAP_URL = 'https://www.dm.cz/product-sitemap.xml'
const API_URL = 'https://products.dm.de/product/products'

// Identifies this app to the retailer instead of hiding behind a browser User-Agent.
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'

// Tile batch size; verified at 50 ids per request.
export const TILE_BATCH_SIZE = 50

// The sitemap lists ~13,000 products, far more than a pilot batch. Sampling ids by a fixed modulus
// (~1 in 160 -> ~80 products) gives a spread across every aisle and — unlike "the first N" or "every
// k-th position" — stays the same products from day to day even as the sitemap gains and loses
// entries, so each product's price history stays continuous. Ids carry no category pattern.
export const SAMPLE_MODULUS = 160

/** Extracts product ids (`dan`) from the product sitemap's `/p/d/<id>/<slug>` URLs. Pure/testable. */
export function parseDmSitemap(xml: string): number[] {
  const ids: number[] = []
  const pattern = /<loc>https:\/\/www\.dm\.cz\/p\/d\/(\d+)\//g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml))) ids.push(Number(match[1]))
  return ids
}

/** The deterministic pilot sample: ids divisible by `SAMPLE_MODULUS`, ascending, at most `limit`. */
export function selectSampleIds(ids: number[], limit: number): number[] {
  return Array.from(new Set(ids))
    .filter((id) => id % SAMPLE_MODULUS === 0)
    .sort((a, b) => a - b)
    .slice(0, Math.max(limit, 0))
}

// Shape is a deliberately small subset of the real responses — only the fields this connector reads.
export type DmRawProduct = {
  dan: number
  /** EAN barcode. Kept on the raw record for a future barcode column; not persisted today. */
  gtin?: number
  brand?: { name?: string }
  title?: { tileHeadline?: string }
  price?: {
    price?: { current?: { value?: string }; previous?: { value?: string } }
    /** First entry looks like "400 g (32,25 Kč za 100 g)": package size, then unit price. */
    tileInfos?: string[]
  }
  trackingData?: { price?: number; currency?: string }
  /** Top-level category from the product detail's breadcrumbs (tiles only carry leaf categories). */
  topCategory?: string
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`DM request failed: HTTP ${response.status} (${url})`)
  return (await response.json()) as T
}

export async function fetchDmSitemap(): Promise<number[]> {
  const response = await fetch(SITEMAP_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`DM sitemap fetch failed: HTTP ${response.status}`)
  return parseDmSitemap(await response.text())
}

/** Fetches product tiles for the given ids. Ids DM no longer serves are simply absent. */
export async function fetchDmTiles(ids: number[]): Promise<DmRawProduct[]> {
  if (ids.length === 0) return []
  const body = await getJson<{ products?: Record<string, DmRawProduct> }>(`${API_URL}/tiles/CZ/dans/${ids.join(',')}`)
  if (!body.products || typeof body.products !== 'object') throw new Error('DM tiles returned an unexpected response shape')
  return Object.values(body.products)
}

/** The product's top-level category name, or `undefined` when the detail has no breadcrumbs. */
export async function fetchDmTopCategory(id: number): Promise<string | undefined> {
  const body = await getJson<{ breadcrumbs?: string[] }>(`${API_URL}/detail/CZ/dan/${id}`)
  return body.breadcrumbs?.[0]
}

/** Fetches up to `limit` sampled products with their top-level category. Requests are sequential,
 *  not parallel. A single failed category lookup drops that product (logged) rather than the whole
 *  batch; if half or more of the lookups fail the source is treated as broken and this throws, so
 *  the failure is visible instead of being reported as a pile of "skipped" products. */
export async function fetchDmProducts(limit: number): Promise<DmRawProduct[]> {
  if (limit <= 0) return []
  const ids = selectSampleIds(await fetchDmSitemap(), limit)
  const tiles: DmRawProduct[] = []
  for (let i = 0; i < ids.length; i += TILE_BATCH_SIZE) {
    tiles.push(...(await fetchDmTiles(ids.slice(i, i + TILE_BATCH_SIZE))))
  }

  const products: DmRawProduct[] = []
  let failed = 0
  for (const tile of tiles) {
    try {
      products.push({ ...tile, topCategory: await fetchDmTopCategory(tile.dan) })
    } catch (err) {
      failed++
      console.error(`DM category lookup failed for ${tile.dan}:`, err)
    }
  }
  if (tiles.length > 0 && failed * 2 >= tiles.length) {
    throw new Error(`DM category lookups failed for ${failed} of ${tiles.length} products`)
  }
  return products
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

// DM's top-level category names (lower-cased), as seen on real products on 2026-09-24. Unlike the
// grocery connectors, DM is a drugstore: its goods map to Drogerie / Děti / Domácnost, with only
// "Výživa" (nutrition: nuts, tea, bars, supplements) being food. A name not listed here is
// rejected — an unknown top level is flagged, not guessed at.
const TOP_LEVEL_CATEGORY: Record<string, ItemCategory> = {
  'líčení': 'Drogerie',
  'pleť, tělo & parfémy': 'Drogerie',
  'vlasová kosmetika': 'Drogerie',
  'péče o zdraví': 'Drogerie',
  'péče o dítě': 'Děti',
  domácnost: 'Domácnost',
  'výživa': 'Potraviny',
}

export function mapDmCategory(raw: DmRawProduct): ItemCategory | null {
  return TOP_LEVEL_CATEGORY[(raw.topCategory ?? '').trim().toLowerCase()] ?? null
}

/** Parses a Czech-formatted number: "1 399,00" (space or no-break-space thousands separator,
 *  decimal comma) -> 1399. `null` when it isn't a plain positive number. */
export function parseCzechNumber(text: string): number | null {
  const value = Number(text.replace(/[\s ]/g, '').replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Parses a price like "1 399,00 Kč" into a number (currency is checked separately). */
export function parseDmPrice(text: string | undefined): number | null {
  if (!text) return null
  const match = /^\s*([\d\s .,]+?)\s*Kč\s*$/.exec(text)
  return match ? parseCzechNumber(match[1]) : null
}

const TILE_INFO_PATTERN = /^\s*([\d\s .,]+?)\s*([^\s(]+)\s*\(\s*([\d\s .,]+?)\s*Kč\s+za\s+([\d\s .,]+?)\s*([^\s)]+)\s*\)/

/** Parses "400 g (32,25 Kč za 100 g)" into the package size and the unit price quoted per
 *  `per` × `unit`. `null` when the text isn't in this shape. */
export function parseDmTileInfo(
  text: string | undefined,
): { packSize: number; packUnit: string; unitPriceKc: number; per: number; unit: string } | null {
  if (!text) return null
  const match = TILE_INFO_PATTERN.exec(text)
  if (!match) return null
  const packSize = parseCzechNumber(match[1])
  const unitPriceKc = parseCzechNumber(match[3])
  const per = parseCzechNumber(match[4])
  if (packSize == null || unitPriceKc == null || per == null) return null
  return { packSize, packUnit: match[2].toLowerCase(), unitPriceKc, per, unit: match[5].toLowerCase() }
}

/** Turns one raw DM product into a validated, normalized product — or `null` when it isn't usable,
 *  per CLAUDE.md section 33 ("reject or flag suspicious data rather than silently inserting it"):
 *  - no id, title or brand-and-title, or no positive price
 *  - a currency other than CZK, or a displayed price that disagrees with the numeric price
 *  - an unknown top-level category (see `TOP_LEVEL_CATEGORY`), or a missing one
 *  - a unit price that contradicts price ÷ package size
 *  Name: the tile's headline carries no brand ("balzám po holení sensitive, 100 ml") and
 *  `products.name` is unique, so the name is "<brand> <headline>" — otherwise two brands' identical
 *  headlines would collide into one catalog product.
 *  Units: normalized to Kč/kg, Kč/l or Kč/ks. A unit this app doesn't model (e.g. "PD", a wash
 *  dose) or no unit-price text at all falls back to one package = "1 ks" at the package price —
 *  never an invented package size (same convention as the Lidl connector).
 *  Promotions: when the tile shows an original price above the current one ("Výprodej"), the
 *  original is recorded as the regular price and the discount is flagged with
 *  `promotionWithoutValidity` — DM publishes no end date, and this is the same handling as Billa.
 *  Note this is a clearance, so the "regular" price may not be the everyday one any more; the
 *  promotion model (a later, owner-scheduled piece of work) has to settle that for both stores.
 *  Currency is read from the record, not assumed. `today` is passed in so this stays pure. */
export function normalizeDmProduct(raw: DmRawProduct, today: string): NormalizedProduct | null {
  if (!Number.isInteger(raw.dan) || raw.dan <= 0) return null
  const headline = (raw.title?.tileHeadline ?? '').trim()
  if (!headline) return null
  const brand = (raw.brand?.name ?? '').trim()
  const name = brand && !headline.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${headline}` : headline

  const price = raw.trackingData?.price
  if (price == null || !Number.isFinite(price) || price <= 0) return null
  if (raw.trackingData?.currency !== 'CZK') return null
  // The displayed price and the numeric one come from different fields; if they disagree one of
  // them is wrong and neither can be trusted.
  const displayed = parseDmPrice(raw.price?.price?.current?.value)
  if (displayed == null || Math.abs(displayed - price) > 0.005) return null

  const category = mapDmCategory(raw)
  if (!category) return null

  // Default: one package as "1 ks" at the package price.
  let unit: ItemUnit = 'ks'
  let currentUnitPrice = price
  const info = parseDmTileInfo(raw.price?.tileInfos?.[0])
  if (info) {
    const converted = toNormalizedUnitPrice(info.unit, String(info.per), Math.round(info.unitPriceKc * 100))
    if (converted) {
      if (!unitPriceMatchesPackage({ sku: String(raw.dan), amount: String(info.packSize), volumeLabelShort: info.packUnit }, price, converted.unit, converted.unitPrice)) {
        return null
      }
      unit = converted.unit
      currentUnitPrice = converted.unitPrice
    }
  }

  let regularPrice = price
  let unitPrice = currentUnitPrice
  let promotionWithoutValidity = false
  const previous = parseDmPrice(raw.price?.price?.previous?.value)
  if (previous != null && previous > price) {
    regularPrice = previous
    // Same package, so the unit price scales exactly with the price ratio.
    unitPrice = Math.round(((currentUnitPrice * previous) / price) * 100) / 100
    promotionWithoutValidity = true
  }

  return {
    externalId: String(raw.dan),
    name,
    category,
    unit,
    unitPrice,
    regularPrice,
    currency: 'CZK',
    recordedAt: today,
    promotionWithoutValidity: promotionWithoutValidity || undefined,
  }
}

export const dmConnector: PriceConnector<DmRawProduct> = {
  source: 'dm',
  chain: 'dm',
  fetchProducts: fetchDmProducts,
  rawId: (raw) => String(raw.dan),
  normalize: normalizeDmProduct,
}
