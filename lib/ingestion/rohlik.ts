import { scaleUnitPrice, UNIT_PRICE_TOLERANCE } from '@/lib/ingestion/product-discovery'
import { fetchWithTimeout } from '@/lib/ingestion/http'
import type { FetchOptions, NormalizedDeal, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// --- Fetcher (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) --------
// Rohlík.cz is an online-only grocer, so its published price *is* the price — there is no separate
// in-store price to confuse it with. There is no public retailer API; like the other connectors this
// uses the JSON endpoints the site's own category pages call (observed via network capture,
// 2026-09-24). Checked the same day: rohlik.cz/robots.txt disallows only `/regal/*` for the general
// group (it does not disallow `/api/`), the endpoints need no login or token, and showed no CAPTCHA
// or bot challenge. Three calls are needed because the site splits the data:
//   - /api/v1/categories/normal/<id>/products  -> product ids of a category
//   - /api/v1/products?products=<id>...        -> name, unit, package size text
//   - /api/v1/products/prices?products=<id>... -> price, unit price and promotions ("sales")
// Requests run one after another with a small pause, never in parallel.

const BASE_URL = 'https://www.rohlik.cz'
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'
const REQUEST_PAUSE_MS = 250
/** Ids per details/prices request — well inside what the endpoints accept (60 was tried) and keeps the URL short. */
const BATCH_SIZE = 50
const MAX_CATEGORY_PAGE_SIZE = 200

// Rohlík's top-level *food and drink* categories, taken from its own sitemap_base.xml (2026-09-24).
// A top-level category lists the products of all its sub-categories. Left out on purpose: drogerie,
// dítě, domácnost, zvíře, vitaminy (non-food — this connector is grocery-only, like Billa's) and the
// brand landing page.
export const ROHLIK_GROCERY_CATEGORY_IDS = [
  300101000, // pekárna a cukrárna
  300102000, // ovoce a zelenina
  300103000, // maso a ryby
  300104000, // uzeniny a lahůdky
  300105000, // mléčné a chlazené
  300106000, // trvanlivé
  300107000, // mražené
  300108000, // nápoje
  300121000, // sušenky
  300123000, // horké nápoje
] as const

type RohlikMoney = { amount: number; currency: string }

export type RohlikSale = {
  type: string
  active: boolean
  silent: boolean
  welcomePrice: boolean
  triggerAmount: number
  bundleId: number | null
  price: RohlikMoney
  pricePerUnit: RohlikMoney | null
  originalPrice: RohlikMoney | null
  originalPricePerUnit?: RohlikMoney | null
  validTill: string | null
}

export type RohlikRawProduct = {
  id: number
  name: string
  /** Unit the unit price is quoted in: `kg`, `l` or `ks` (anything else is unusable). */
  unit: string
  /** Package size as the site prints it: "150 g", "1 l", "cca 120 g" (weighed items), "1 ks". */
  textualAmount: string | null
  archived: boolean
  /** Sold by weight: `price` is only an estimate for one piece of roughly `textualAmount`. */
  weightedItem: boolean
  price: RohlikMoney
  pricePerUnit: RohlikMoney
  sales: RohlikSale[]
}

type DetailResponse = { id: number; name: string; unit: string; textualAmount: string | null; archived: boolean; weightedItem: boolean }
type PriceResponse = { productId: number; price: RohlikMoney; pricePerUnit: RohlikMoney; sales?: RohlikSale[] }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson<T>(path: string, what: string): Promise<T> {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`Rohlik ${what} fetch failed: HTTP ${response.status}`)
  return (await response.json()) as T
}

/** Product ids of one page (0-based) of a category, in the site's own "recommended" order. */
export async function fetchRohlikCategoryProductIds(categoryId: number, page: number, size: number): Promise<number[]> {
  const pageSize = Math.min(Math.max(size, 1), MAX_CATEGORY_PAGE_SIZE)
  const body = await getJson<{ productIds?: unknown }>(`/api/v1/categories/normal/${categoryId}/products?page=${page}&size=${pageSize}&sort=recommended&filter=`, `category ${categoryId}`)
  if (!Array.isArray(body.productIds) || !body.productIds.every((id) => typeof id === 'number')) {
    throw new Error(`Rohlik category ${categoryId} returned an unexpected response shape`)
  }
  return body.productIds as number[]
}

/** Details and prices for up to a batch of ids, joined by id. An id missing from either response is dropped. */
export async function fetchRohlikProducts(ids: number[], pauseMs: number = REQUEST_PAUSE_MS): Promise<RohlikRawProduct[]> {
  const query = ids.map((id) => `products=${id}`).join('&')
  const details = await getJson<DetailResponse[]>(`/api/v1/products?${query}`, 'product details')
  await sleep(pauseMs)
  const prices = await getJson<PriceResponse[]>(`/api/v1/products/prices?${query}`, 'product prices')
  if (!Array.isArray(details) || !Array.isArray(prices)) throw new Error('Rohlik product details/prices returned an unexpected response shape')

  const priceById = new Map(prices.map((entry) => [entry.productId, entry]))
  const products: RohlikRawProduct[] = []
  for (const detail of details) {
    const price = priceById.get(detail.id)
    if (!price?.price || !price.pricePerUnit) continue
    products.push({
      id: detail.id,
      name: detail.name,
      unit: detail.unit,
      textualAmount: detail.textualAmount ?? null,
      archived: detail.archived === true,
      weightedItem: detail.weightedItem === true,
      price: price.price,
      pricePerUnit: price.pricePerUnit,
      sales: price.sales ?? [],
    })
  }
  return products
}

/** Fetches up to `limit` products, spread evenly over the food categories (the first page of each, in
 *  the site's own order) so the batch is diverse instead of one aisle. Deterministic for a given site
 *  state; a product keeps the same external id, so its price history stays continuous. */
export async function fetchRohlikCatalog(limit: number, options: FetchOptions & { pauseMs?: number } = {}): Promise<RohlikRawProduct[]> {
  if (limit <= 0) return []
  const pauseMs = options.pauseMs ?? REQUEST_PAUSE_MS
  const outOfTime = () => options.deadline != null && Date.now() >= options.deadline

  const perCategory = Math.ceil(limit / ROHLIK_GROCERY_CATEGORY_IDS.length)
  const ids: number[] = []
  const seen = new Set<number>()
  for (const categoryId of ROHLIK_GROCERY_CATEGORY_IDS) {
    if (outOfTime()) break
    for (const id of await fetchRohlikCategoryProductIds(categoryId, 0, perCategory)) {
      // A product can be listed under two top-level categories; keep it once.
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    await sleep(pauseMs)
  }

  const products: RohlikRawProduct[] = []
  for (const batch of chunk(ids.slice(0, limit), BATCH_SIZE)) {
    if (outOfTime()) break
    products.push(...(await fetchRohlikProducts(batch, pauseMs)))
    await sleep(pauseMs)
  }
  return products
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

/** Promotion kinds that are a public, single-unit price cut with an end date. Everything else is
 *  deliberately not a deal: `premium` is the Rohlík Premium members-only price (not what a household
 *  pays), `multipack` and `groupDiscount` need several pieces, and a `silent` or inactive sale is not
 *  shown. A promotion is not automatically a good deal either (CLAUDE.md section 18) — recording it
 *  only lets the price engine judge it later. */
const PUBLIC_SALE_TYPES = new Set(['sale', 'longtermAction', 'expiration'])

/** "150 g" / "1,5 l" / "500 ml" / "2 ks" / "1 kg" -> its quantity expressed in the unit's own base
 *  (kg for weight, l for volume, ks for pieces). `null` when the text is not one of those plain forms
 *  (a weighed item's "cca 120 g" deliberately is not: that is an estimate, not a package size). */
export function parseRohlikPackage(text: string | null): { unit: 'kg' | 'l' | 'ks'; quantity: number } | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|ks)\s*$/i.exec(text ?? '')
  if (!match) return null
  const value = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  switch (match[2].toLowerCase()) {
    case 'g':
      return { unit: 'kg', quantity: value / 1000 }
    case 'kg':
      return { unit: 'kg', quantity: value }
    case 'ml':
      return { unit: 'l', quantity: value / 1000 }
    case 'l':
      return { unit: 'l', quantity: value }
    default:
      return { unit: 'ks', quantity: value }
  }
}

const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/** The best public promotion running today, or `null`. A promotion whose original price does not
 *  agree with the regular price, that is not cheaper than it, or whose end date is missing/past is
 *  ignored rather than stored with an invented window (CLAUDE.md sections 15 and 33). */
function pickPublicDeal(raw: RohlikRawProduct, regularPrice: number, regularUnitPrice: number, today: string): NormalizedDeal | null | 'no-validity' {
  let best: NormalizedDeal | null = null
  let sawWithoutValidity = false
  for (const sale of raw.sales) {
    if (!PUBLIC_SALE_TYPES.has(sale.type) || !sale.active || sale.silent || sale.welcomePrice || sale.triggerAmount !== 1 || sale.bundleId != null) continue
    // Weighed items quote the promotion per kg, like their regular price.
    const dealPrice = raw.weightedItem ? sale.pricePerUnit?.amount : sale.price?.amount
    const currency = raw.weightedItem ? sale.pricePerUnit?.currency : sale.price?.currency
    if (!isPositive(dealPrice) || currency !== 'CZK' || dealPrice >= regularPrice) continue
    const original = raw.weightedItem ? sale.originalPricePerUnit : sale.originalPrice
    if (original && Math.abs(original.amount - regularPrice) > regularPrice * UNIT_PRICE_TOLERANCE) continue

    const validUntil = /^\d{4}-\d{2}-\d{2}/.exec(sale.validTill ?? '')?.[0]
    if (!validUntil) {
      sawWithoutValidity = true
      continue
    }
    if (validUntil < today) continue
    // A weighed item's promotion is already per kg; otherwise it is the same package at a lower price,
    // so the unit price scales by the price ratio.
    const unitPrice = raw.weightedItem ? dealPrice : scaleUnitPrice(regularUnitPrice, regularPrice, dealPrice)
    if (!best || dealPrice < best.dealPrice) best = { dealPrice, unitPrice, validFrom: today, validUntil }
  }
  if (best) return best
  return sawWithoutValidity ? 'no-validity' : null
}

/** Turns one raw Rohlík record into a validated, normalized product — or `null` when it is not usable,
 *  per CLAUDE.md section 33 ("reject or flag suspicious data rather than silently inserting it"):
 *  - archived, no id/name, or a price that is not a positive CZK amount
 *  - a unit this app does not model (kg, l, ks only — e.g. "kytice" is refused)
 *  - a fixed-package product whose stated size and unit price disagree by more than the tolerance
 *  - a weighed item whose unit is not kg
 *  Everything fetched comes from Rohlík's food categories, so the category is 'Potraviny'.
 *
 *  Promotions: the regular price is always what is recorded, so a temporary discount never
 *  masquerades as the everyday price (section 18); only a public promotion with an end date becomes a
 *  `deal` (see `pickPublicDeal`). `today` is passed in so this stays pure and testable. */
export function normalizeRohlikProduct(raw: RohlikRawProduct, today: string): NormalizedProduct | null {
  const name = (raw.name ?? '').trim()
  if (!Number.isFinite(raw.id) || !name || raw.archived) return null
  if (raw.price?.currency !== 'CZK' || raw.pricePerUnit?.currency !== 'CZK') return null
  if (!isPositive(raw.price.amount) || !isPositive(raw.pricePerUnit.amount)) return null
  if (raw.unit !== 'kg' && raw.unit !== 'l' && raw.unit !== 'ks') return null

  const unit = raw.unit
  const unitPrice = raw.pricePerUnit.amount
  let regularPrice = raw.price.amount

  if (raw.weightedItem) {
    // The listed price is only an estimate for one piece of roughly "cca 120 g"; the per-kg price is
    // the reliable figure, so it is recorded as the price, like a product sold purely by weight.
    if (unit !== 'kg') return null
    regularPrice = unitPrice
  } else {
    const pack = parseRohlikPackage(raw.textualAmount)
    // Cross-check only when the package is stated in the same family as the unit price; a size in an
    // unrelated unit is not evidence of an error, an inconsistent one in the same unit is.
    if (pack && pack.unit === unit) {
      const expectedUnitPrice = regularPrice / pack.quantity
      if (Math.abs(unitPrice - expectedUnitPrice) > expectedUnitPrice * UNIT_PRICE_TOLERANCE) return null
    }
  }

  const deal = pickPublicDeal(raw, regularPrice, unitPrice, today)
  return {
    externalId: String(raw.id),
    name,
    category: 'Potraviny',
    unit,
    unitPrice,
    regularPrice,
    currency: 'CZK',
    recordedAt: today,
    ...(deal && deal !== 'no-validity' ? { deal } : {}),
    ...(deal === 'no-validity' ? { promotionWithoutValidity: true } : {}),
  }
}

export const rohlikConnector: PriceConnector<RohlikRawProduct> = {
  source: 'rohlik',
  chain: 'Rohlík',
  fetchProducts: fetchRohlikCatalog,
  rawId: (raw) => String(raw.id),
  normalize: normalizeRohlikProduct,
}
