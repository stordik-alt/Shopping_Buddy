import { fetchWithTimeout } from '@/lib/ingestion/http'
import { UNIT_PRICE_TOLERANCE } from '@/lib/ingestion/product-discovery'
import type { FetchOptions, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// --- Fetcher (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) --------
// Košík.cz is an online-only grocer (like Rohlík), so its published price is the price. There is no
// public retailer API; like the other connectors this uses the JSON the site's own pages call
// (observed via network capture, 2026-09-24):
//   - GET  /api/front/menu/main                         -> the category tree
//   - GET  /api/front/page/products/flexible?slug=<cat> -> the first page of a category's products
//   - POST /api/front/products/more {cursor, limit}     -> the next page (the site's own "load more")
// Checked the same day: robots.txt disallows `/l*_c*` listing pages, `/basket` and
// `/nakupni-listek*` — none of which this touches — and does not disallow `/api/`; the endpoints
// need no login or token and showed no CAPTCHA or bot challenge. The API itself states its limit
// ("Using of limit over 30 products is denied"), so every request asks for 30 at most. Requests run
// one after another with a pause, never in parallel.

const BASE_URL = 'https://www.kosik.cz'
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'
const REQUEST_PAUSE_MS = 300
/** The page size the API allows. */
const PAGE_LIMIT = 30

// Košík's top-level *food and drink* categories (ids from its own main menu, 2026-09-24). Left out on
// purpose: health/lifestyle, drogerie, tobacco, household, children, pets and the pharmacy — this
// connector is grocery-only, like Billa's and Rohlík's.
export const KOSIK_GROCERY_TOP_LEVEL_IDS = [
  1026, // Pekárna a cukrárna
  985, // Ovoce a zelenina
  960, // Maso a ryby
  1046, // Uzeniny a lahůdky
  898, // Mléčné a chlazené
  1211, // Trvanlivé
  1083, // Mražené
  1107, // Nápoje
] as const

export type KosikRawProduct = {
  id: number
  name: string
  /** Current price. For a product sold by weight this is only the estimate for one piece. */
  price: number
  /** The price before a promotion (equals `price` when there is none). */
  recommendedPrice: number
  percentageDiscount: number
  productQuantity: { prefix: string; value: number; unit: string } | null
  /** Unit price at the *current* price, in Kč per kg / l / ks. */
  pricePerUnit: { price: number; unit: string } | null
  /** "Akce platí do 29. 9." — the only place the site states when a promotion ends. */
  actionLabel: string | null
}

type MenuResponse = { categories?: { id: number; subCategories?: { id: number; url: string }[] }[] }
type ApiProduct = {
  id: number
  name: string
  price: number
  recommendedPrice?: number
  percentageDiscount?: number
  productQuantity?: { prefix?: string; value?: number; unit?: string } | null
  pricePerUnit?: { price: number; unit: string } | null
  actionLabel?: string | null
}
/** First page of a category: products sit under `products.items` with the cursor for the next page. */
type CategoryPageResponse = { products?: { items?: ApiProduct[]; cursor?: string | null } | null }
/** "Load more": the products come back as a plain array next to the next cursor. */
type MorePageResponse = { products?: ApiProduct[] | null; cursor?: string | null }

/** One page of products and, when there may be more, the cursor that fetches the next page. */
export type KosikPage = { products: KosikRawProduct[]; cursor: string | null }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function request<T>(path: string, what: string, init: { method?: string; body?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT }
  if (init.body) headers['Content-Type'] = 'application/json'
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, { method: init.method ?? 'GET', headers, body: init.body })
  if (!response.ok) throw new Error(`Kosik ${what} fetch failed: HTTP ${response.status}`)
  return (await response.json()) as T
}

function toRaw(item: ApiProduct): KosikRawProduct {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    recommendedPrice: item.recommendedPrice ?? item.price,
    percentageDiscount: item.percentageDiscount ?? 0,
    productQuantity: item.productQuantity?.value != null && item.productQuantity.unit ? { prefix: item.productQuantity.prefix ?? '', value: item.productQuantity.value, unit: item.productQuantity.unit } : null,
    pricePerUnit: item.pricePerUnit ?? null,
    actionLabel: item.actionLabel ?? null,
  }
}

/** The sub-categories of every food top-level category, taken round-robin (first of each top-level,
 *  then the second of each, …) so a run that stops early still covers every aisle. */
export async function fetchKosikCategorySlugs(): Promise<string[]> {
  const menu = await request<MenuResponse>('/api/front/menu/main', 'menu')
  if (!Array.isArray(menu.categories)) throw new Error('Kosik menu returned an unexpected response shape')
  const lists = KOSIK_GROCERY_TOP_LEVEL_IDS.map((topId) => {
    const top = menu.categories!.find((category) => category.id === topId)
    return (top?.subCategories ?? []).map((sub) => sub.url.replace(/^\//, ''))
  })
  const slugs: string[] = []
  for (let i = 0; lists.some((list) => i < list.length); i++) {
    for (const list of lists) if (i < list.length) slugs.push(list[i])
  }
  return slugs
}

/** The first page (30 products, the site's own order) of a category as a flat list. `vertical` is
 *  the site's list/grid view, which returns products directly; its default view groups them by
 *  sub-category instead. */
export async function fetchKosikCategoryPage(slug: string): Promise<KosikPage> {
  const path = `/api/front/page/products/flexible?vendor=1&slug=${encodeURIComponent(slug)}&limit=${PAGE_LIMIT}&search_term=&page_display=vertical&platform=web`
  const body = await request<CategoryPageResponse>(path, `category ${slug}`)
  const items = body.products?.items
  if (!Array.isArray(items)) throw new Error(`Kosik category ${slug} returned an unexpected response shape`)
  return { products: items.map(toRaw), cursor: body.products?.cursor ?? null }
}

/** The next page of a category, from the cursor the previous page returned — the request the site
 *  itself makes when a shopper scrolls. */
export async function fetchKosikMorePage(cursor: string): Promise<KosikPage> {
  const body = await request<MorePageResponse>('/api/front/products/more', 'more-products', { method: 'POST', body: JSON.stringify({ cursor, limit: PAGE_LIMIT }) })
  if (!Array.isArray(body.products)) throw new Error('Kosik more-products returned an unexpected response shape')
  return { products: body.products.map(toRaw), cursor: body.cursor ?? null }
}

/** Fetches up to `limit` products in rounds: the first page of every sub-category, then the second page
 *  of each, and so on, each product once. Breadth first, so a run that stops early (limit or time) has
 *  covered every aisle rather than exhausted a few. Deterministic for a given site state; a product
 *  keeps its external id, so its price history stays continuous. */
export async function fetchKosikCatalog(limit: number, options: FetchOptions & { pauseMs?: number } = {}): Promise<KosikRawProduct[]> {
  if (limit <= 0) return []
  const pauseMs = options.pauseMs ?? REQUEST_PAUSE_MS
  const outOfTime = () => options.deadline != null && Date.now() >= options.deadline

  const lanes = (await fetchKosikCategorySlugs()).map((slug) => ({ slug, cursor: null as string | null, started: false, done: false }))
  const products: KosikRawProduct[] = []
  const seen = new Set<number>()
  while (products.length < limit && lanes.some((lane) => !lane.done)) {
    for (const lane of lanes) {
      if (lane.done) continue
      if (products.length >= limit || outOfTime()) return products.slice(0, limit)
      await sleep(pauseMs)
      const page = lane.started ? await fetchKosikMorePage(lane.cursor!) : await fetchKosikCategoryPage(lane.slug)
      lane.started = true
      lane.cursor = page.cursor
      // A short page, or no cursor, is the category's last: nothing more to ask for.
      if (!page.cursor || page.products.length < PAGE_LIMIT) lane.done = true
      for (const product of page.products) {
        // A product can be listed under several categories; keep it once.
        if (seen.has(product.id)) continue
        seen.add(product.id)
        products.push(product)
      }
    }
  }
  return products.slice(0, limit)
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

/** A promotion end date that is further away than this is not believed (a mis-read label must not
 *  become a months-long "deal"). */
const MAX_PROMOTION_DAYS = 120

/** "Akce platí do 29. 9." -> the first date with that day and month that is not before `today`
 *  (the label states no year, so this year, or next year around New Year). `null` for any other
 *  wording — notably "Spotřebujte do 26. 9.", a best-before clearance, not a promotion window — and
 *  for an impossible or implausibly distant date. */
export function parseKosikPromotionEnd(label: string | null, today: string): string | null {
  const match = /^Akce platí do (\d{1,2})\.\s*(\d{1,2})\.$/.exec((label ?? '').trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const todayYear = Number(today.slice(0, 4))
  for (const year of [todayYear, todayYear + 1]) {
    const date = new Date(Date.UTC(year, month - 1, day))
    // Rejects 31. 2. and the like, which Date would silently roll over into March.
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    const iso = date.toISOString().slice(0, 10)
    if (iso < today) continue
    const days = (date.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
    return days <= MAX_PROMOTION_DAYS ? iso : null
  }
  return null
}

const round2 = (value: number) => Math.round(value * 100) / 100
const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/** Package size expressed in the unit-price's own base (kg, l or ks); `null` when it is not stated
 *  in that family (a weighed item's "cca 140 g" is an estimate and never reaches here). */
function packageQuantity(raw: KosikRawProduct, unit: 'kg' | 'l' | 'ks'): number | null {
  const quantity = raw.productQuantity
  if (!quantity || !isPositive(quantity.value)) return null
  switch (quantity.unit) {
    case 'g':
      return unit === 'kg' ? quantity.value / 1000 : null
    case 'kg':
      return unit === 'kg' ? quantity.value : null
    case 'ml':
      return unit === 'l' ? quantity.value / 1000 : null
    case 'l':
      return unit === 'l' ? quantity.value : null
    case 'ks':
      return unit === 'ks' ? quantity.value : null
    default:
      return null
  }
}

/** Turns one raw Košík record into a validated, normalized product — or `null` when it is not usable,
 *  per CLAUDE.md section 33 ("reject or flag suspicious data rather than silently inserting it"):
 *  - no id/name, or a price that is not a positive amount
 *  - a unit price in a unit this app does not model (kg, l, ks only)
 *  - a weighed item (`cca` estimate) whose unit price is not per kg
 *  - a fixed-package product whose stated size and unit price disagree by more than the tolerance
 *  Everything fetched comes from Košík's food categories, so the category is 'Potraviny'; the site
 *  publishes CZK only.
 *
 *  Promotions: the regular price is `recommendedPrice` while a promotion runs, so a temporary discount
 *  never masquerades as the everyday price (section 18). Only a percentage discount with a dated
 *  "Akce platí do …" label becomes a `deal`; multi-buy tiers (`cumulativePrices`) are ignored and a
 *  discount without such a date is counted, not stored with an invented window (section 15).
 *  `today` is passed in so this stays pure and testable. */
export function normalizeKosikProduct(raw: KosikRawProduct, today: string): NormalizedProduct | null {
  const name = (raw.name ?? '').trim()
  if (!Number.isFinite(raw.id) || !name) return null
  if (!isPositive(raw.price) || !isPositive(raw.recommendedPrice) || !raw.pricePerUnit || !isPositive(raw.pricePerUnit.price)) return null
  const unit = raw.pricePerUnit.unit
  if (unit !== 'kg' && unit !== 'l' && unit !== 'ks') return null

  const onPromotion = raw.percentageDiscount > 0 && raw.price < raw.recommendedPrice
  // The unit price the site prints is for the current price; scale it back to the regular price.
  const scale = onPromotion ? raw.recommendedPrice / raw.price : 1
  const regularUnitPrice = round2(raw.pricePerUnit.price * scale)

  let regularPrice = onPromotion ? raw.recommendedPrice : raw.price
  const weighed = raw.productQuantity?.prefix === 'cca'
  if (weighed) {
    // The listed price is only an estimate for one piece of roughly "cca 140 g"; the per-kg price is
    // the reliable figure, so it is recorded as the price, like a product sold purely by weight.
    if (unit !== 'kg') return null
    regularPrice = regularUnitPrice
  } else {
    const quantity = packageQuantity(raw, unit)
    // A piece-priced product without a stated size is its own unit price.
    const expected = quantity != null ? regularPrice / quantity : unit === 'ks' && !raw.productQuantity ? regularPrice : null
    if (expected != null && Math.abs(regularUnitPrice - expected) > expected * UNIT_PRICE_TOLERANCE) return null
  }

  let deal: NormalizedProduct['deal']
  let promotionWithoutValidity: true | undefined
  if (onPromotion) {
    const validUntil = parseKosikPromotionEnd(raw.actionLabel, today)
    // A weighed item's promotion is quoted per kg like its regular price.
    const dealPrice = weighed ? raw.pricePerUnit.price : raw.price
    if (validUntil) deal = { dealPrice: round2(dealPrice), validFrom: today, validUntil }
    else promotionWithoutValidity = true
  }

  return {
    externalId: String(raw.id),
    name,
    category: 'Potraviny',
    unit,
    unitPrice: regularUnitPrice,
    regularPrice: round2(regularPrice),
    currency: 'CZK',
    recordedAt: today,
    ...(deal ? { deal } : {}),
    ...(promotionWithoutValidity ? { promotionWithoutValidity } : {}),
  }
}

export const kosikConnector: PriceConnector<KosikRawProduct> = {
  source: 'kosik',
  chain: 'Košík',
  fetchProducts: fetchKosikCatalog,
  rawId: (raw) => String(raw.id),
  normalize: normalizeKosikProduct,
}
