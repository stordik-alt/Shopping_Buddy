import type { ItemUnit } from '@/lib/types'

// Shared building blocks for retailers on the same web-shop platform. billa.cz and penny.cz (both
// REWE Group) expose an identical JSON endpoint — `/api/product-discovery/categories/<slug>/products`
// — with an identical product record, which their own category pages call to render product grids
// (observed via network capture, 2026-09-24). Each retailer's connector keeps its own category
// list, grocery gating and promotion rules; only what is genuinely the same lives here, so a fix to
// price/unit handling applies to every store on the platform (CLAUDE.md section 37: no duplicate
// logic).

// Identifies this app to the retailer instead of hiding behind a browser User-Agent.
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'

// The API's page-size cap was verified up to 50; stay at or below it.
export const MAX_PAGE_SIZE = 50

// Shape is a deliberately small subset of the real response — only the fields the connectors read.
// Prices are integers in haléře (1/100 Kč).
export type DiscoveryProduct = {
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
    /** The retailer's "was" price, struck through on the page — only present during a promotion. */
    crossed?: number
    /** Regular (non-promotional) price — only present while a promotion is running (and not always
     *  even then). */
    standard?: { value?: number; perStandardizedQuantity?: number }
    /** Current selling price; equals the regular price when no promotion is running. */
    regular?: { value?: number; perStandardizedQuantity?: number }
    /** Promotion window (Penny publishes one for every offer; Billa does not). ISO dates. */
    validityStart?: string
    validityEnd?: string
  }
}

type DiscoveryResponse = { results?: DiscoveryProduct[]; total?: number }

/** Fetches one page (0-based) of a category's products from a platform retailer. `retailer` only
 *  labels errors. Throws on an HTTP error or an unexpected response shape, so the caller can
 *  isolate the failing source. */
export async function fetchDiscoveryCategoryPage(
  baseUrl: string,
  retailer: string,
  slug: string,
  page: number,
  pageSize: number,
): Promise<{ results: DiscoveryProduct[]; total: number }> {
  const size = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE)
  const url = `${baseUrl}/api/product-discovery/categories/${slug}/products?page=${page}&pageSize=${size}&sortBy=relevance`
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`${retailer} category ${slug} fetch failed: HTTP ${response.status}`)
  const body = (await response.json()) as DiscoveryResponse
  if (!Array.isArray(body.results)) throw new Error(`${retailer} category ${slug} returned an unexpected response shape`)
  return { results: body.results, total: typeof body.total === 'number' ? body.total : body.results.length }
}

/** Converts a unit price (per `factor` of `baseUnit`, in haléře) into Kč per kg / l / ks — the
 *  normalized units of CLAUDE.md section 17. Gram and millilitre goods are quoted per 100 g /
 *  100 ml (`basePriceFactor` "100"), which are scaled to a full kg / l so unit prices of different
 *  products stay directly comparable. `null` for a unit this app doesn't model. */
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

// The retailer's own price, unit price and package size are separate fields that can disagree (the
// Globus research found the same class of problem). A 3 % band absorbs the retailer rounding the
// unit price to whole haléře; anything beyond that is treated as bad data, not averaged away.
export const UNIT_PRICE_TOLERANCE = 0.03

/** For a fixed-package product: does `unitPrice` agree with `priceKc` ÷ the stated package size?
 *  Only cross-checks when the package size is in the same unit family as the unit price; otherwise
 *  (e.g. a "ks" count on a per-kg product) there is nothing sound to compare and it passes. */
export function unitPriceMatchesPackage(raw: DiscoveryProduct, priceKc: number, unit: ItemUnit, unitPrice: number): boolean {
  const pack = packageQuantity(raw.amount, raw.volumeLabelShort)
  if (!pack || pack.unit !== unit) return true
  const expectedUnitPrice = priceKc / pack.quantity
  return Math.abs(unitPrice - expectedUnitPrice) <= expectedUnitPrice * UNIT_PRICE_TOLERANCE
}
