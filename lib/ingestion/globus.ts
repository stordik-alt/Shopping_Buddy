import { fetchWithTimeout } from '@/lib/ingestion/http'
import { scaleUnitPrice, UNIT_PRICE_TOLERANCE } from '@/lib/ingestion/product-discovery'
import type { FetchOptions, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'
import type { ItemCategory } from '@/lib/types'

// --- Fetcher (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) --------
// Globus publishes its weekly flyers ("akční letáky") at globus.cz/globus/letaky. The flyer viewer
// itself loads, for every flyer page, a small JSON file with that page's offers from
// action-offers.globus.cz/<page hash>.json — structured records with the barcode, name, package
// size, the offer price, the regular price where the flyer strikes one through, and the offer's
// validity dates. This connector reads exactly those files (observed 2026-09-25). Checked the same
// day: globus.cz's robots.txt allows /globus/letaky (it disallows product-detail pages and the
// per-hypermarket offer listings, neither of which is used), action-offers.globus.cz declares no
// restriction, and neither needs a login nor showed a CAPTCHA or bot challenge. The flyers under
// /globus/ are the national ones; the per-hypermarket flyers are not read.
//
// One listing page holds the page hashes of every current flyer (~170 pages, ~1,000 offers), so a
// run is one listing request plus one small request per page, sequential with a pause.

const LISTING_URL = 'https://www.globus.cz/globus/letaky'
const OFFERS_URL = 'https://action-offers.globus.cz'
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'
const REQUEST_PAUSE_MS = 250

export type GlobusRawOffer = {
  EAN?: string
  vanr?: string
  Name?: string
  subname?: string
  description?: string
  /** Globus's own product group; its first two digits are the department (see mapGlobusCategory). */
  productGroupCode?: string | null
  quantity?: number
  quantityUnit?: string
  saleFrom?: string
  saleTo?: string
  /** The offer price. */
  price?: number
  /** The regular price the flyer strikes through, when it does (`crossed`). */
  originalPrice?: number
  crossed?: boolean
  /** "449,90 Kč za 1 kg" */
  unitPrice?: string
  /** Price for loyalty-card members only — not what every household pays, so never used. */
  clubPrice?: number
}

type OffersPage = { leafletName?: string; page?: number; items?: { productInfo?: GlobusRawOffer }[] }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The distinct flyer page hashes in the listing page's HTML. Pure/testable. */
export function parseGlobusPageHashes(html: string): string[] {
  // Page images are `<hash>-770` etc.; the bare hash is the page itself.
  return [...new Set([...html.matchAll(/action-offers\.globus\.cz\/([0-9a-f]{32})/g)].map((match) => match[1]))]
}

/** Every offer on every current flyer page. A page without an offers file (a cover or an image-only
 *  page answers 404) is skipped; when no page at all can be read the source is treated as down. */
export async function fetchGlobusOffers(limit: number, options: FetchOptions & { pauseMs?: number } = {}): Promise<GlobusRawOffer[]> {
  if (limit <= 0) return []
  const pauseMs = options.pauseMs ?? REQUEST_PAUSE_MS
  const listing = await fetchWithTimeout(LISTING_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!listing.ok) throw new Error(`Globus flyer listing failed: HTTP ${listing.status}`)
  const hashes = parseGlobusPageHashes(await listing.text())
  if (hashes.length === 0) throw new Error('Globus flyer listing has no flyer pages (the page layout may have changed)')

  const offers: GlobusRawOffer[] = []
  let readPages = 0
  for (const hash of hashes) {
    // Out of time budget: stop asking, keep what we have (the caller reports the run as truncated).
    if (options.deadline != null && Date.now() >= options.deadline) break
    const response = await fetchWithTimeout(`${OFFERS_URL}/${hash}.json`, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
    if (response.ok) {
      const page = (await response.json()) as OffersPage
      if (!Array.isArray(page.items)) throw new Error(`Globus offers page ${hash} has an unexpected shape`)
      readPages++
      for (const item of page.items) if (item.productInfo) offers.push(item.productInfo)
    } else if (response.status !== 404) {
      throw new Error(`Globus offers page ${hash} failed: HTTP ${response.status}`)
    }
    if (offers.length >= limit) break
    await sleep(pauseMs)
  }
  if (readPages === 0) throw new Error(`None of the ${hashes.length} Globus flyer pages had an offers file`)
  return offers.slice(0, limit)
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

// The first two digits of Globus's product group code are its department (read off the current
// flyers, 2026-09-25): 61 snacks, 62 coffee and tea, 63 dairy, eggs and frozen, 64 wine and spirits,
// 73 fruit and vegetables, 74 cheese, 75 fish, 80 beer and soft drinks, 82 baby food, 83 health food;
// fresh-counter goods (butcher, bakery, deli) carry no code. 65 is cleaning and household
// chemistry. Everything else — textiles, shoes, toys, appliances, cables, DIY, pet supplies — is not
// what a household shopping list is for, and is not imported.
const FOOD_DEPARTMENTS = new Set(['61', '62', '63', '64', '73', '74', '75', '80', '82', '83'])
// Inside fruit and vegetables (73), group 739 is cut flowers (bouquets, chrysanthemums).
const NON_FOOD_GROUPS = ['739']
const HOUSEHOLD_DEPARTMENTS = new Set(['65'])

export function mapGlobusCategory(productGroupCode: string | null | undefined): ItemCategory | null {
  const code = (productGroupCode ?? '').trim()
  // The fresh counter's records carry no code — as the literal string "null" in the source.
  if (!code || code === 'null' || code === 'undefined') return 'Potraviny'
  const department = code.slice(0, 2)
  if (NON_FOOD_GROUPS.some((group) => code.startsWith(group))) return null
  if (FOOD_DEPARTMENTS.has(department)) return 'Potraviny'
  if (HOUSEHOLD_DEPARTMENTS.has(department)) return 'Domácnost'
  return null
}

type Normalized = { unit: 'kg' | 'l' | 'ks'; quantity: number }

/** A stated package size in this app's units: grams → kg, ml → l. Pieces stay pieces, and so do the
 *  countable units the flyer uses for household goods — rolls ("role") and doses ("dávka"), whose
 *  unit price the flyer itself states per roll. Anything else → null. */
export function globusPackage(quantity: number | undefined, unit: string | undefined): Normalized | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null
  switch ((unit ?? '').toLowerCase()) {
    case 'g':
      return { unit: 'kg', quantity: quantity / 1000 }
    case 'kg':
      return { unit: 'kg', quantity }
    case 'ml':
      return { unit: 'l', quantity: quantity / 1000 }
    case 'l':
      return { unit: 'l', quantity }
    case 'ks':
    case 'role':
    case 'roli':
    case 'dávka':
    case 'dávek':
    case 'dávku':
      return { unit: 'ks', quantity }
    default:
      return null
  }
}

/** "449,90 Kč za 1 kg" / "12,90 Kč za 100 g" → the price per kg, l or piece. Null when unreadable. */
export function parseGlobusUnitPrice(text: string | undefined): { unit: 'kg' | 'l' | 'ks'; unitPrice: number } | null {
  const match = /^\s*([\d\s\u00a0]+(?:,\d{1,2})?)\s*Kč\s+za\s+([\d,]+)\s*(kg|g|l|ml|ks|role|roli|dávku|dávka)\s*$/i.exec(text ?? '')
  if (!match) return null
  const price = Number(match[1].replace(/[\s\u00a0]/g, '').replace(',', '.'))
  const per = Number(match[2].replace(',', '.'))
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(per) || per <= 0) return null
  const pack = globusPackage(per, match[3])
  if (!pack) return null
  return { unit: pack.unit, unitPrice: Math.round((price / pack.quantity) * 100) / 100 }
}

/** "0,5 l", "250 g", "1 kg" — the package size shown after the name, so two sizes of one product
 *  stay two products. */
function packageLabel(quantity: number | undefined, unit: string | undefined): string | null {
  if (quantity == null || !unit || !['g', 'kg', 'ml', 'l', 'ks', 'role', 'dávka'].includes(unit.toLowerCase())) return null
  return `${String(quantity).replace('.', ',')} ${unit.toLowerCase()}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** One flyer offer → a validated product with its dated deal, or null when unusable (CLAUDE.md
 *  section 33):
 *  - no barcode or name, no positive price, an offer window that ends before it starts;
 *  - not food or household goods (mapGlobusCategory);
 *  - no unit price that can be stated honestly: the flyer's own "Kč za …", else price ÷ package
 *    size, else — a product with no size at all — per piece;
 *  - a flyer unit price that contradicts price ÷ package size (UNIT_PRICE_TOLERANCE), or is in a
 *    different unit than the package ("1 ks" priced "za 1 kg");
 *  - an offer dearer than the regular price it strikes through.
 *  The identity is the EAN field (on every offer: a barcode, or Globus's internal code for the fresh
 *  counter; its article number is missing on about one in eight), so the same product is recognised
 *  again in next week's flyer.
 *  Prices: `price` is the offer. The regular price is recorded only when the flyer strikes one
 *  through (`originalPrice`); otherwise only the deal is stored, never the offer price posing as the
 *  everyday price (CLAUDE.md sections 16 and 18). The members-only `clubPrice` is ignored. An offer
 *  whose window has ended (an old flyer still listed) is rejected whole. Currency: globus.cz sells
 *  only in Czech koruna. */
export function normalizeGlobusOffer(raw: GlobusRawOffer, today: string): NormalizedProduct | null {
  // A packaged product's EAN, or — for the fresh counter (fruit, ham, fish by weight) — Globus's own
  // shorter internal code in the same field; both are stable identifiers within Globus.
  const ean = (raw.EAN ?? '').trim()
  const baseName = [raw.Name, raw.subname].map((part) => (part ?? '').trim()).filter(Boolean).join(' ')
  if (!/^\d{3,14}$/.test(ean) || !baseName) return null
  const offerPrice = raw.price
  if (offerPrice == null || !Number.isFinite(offerPrice) || offerPrice <= 0) return null
  const category = mapGlobusCategory(raw.productGroupCode)
  if (!category) return null

  const validFrom = (raw.saleFrom ?? '').slice(0, 10)
  const validUntil = (raw.saleTo ?? '').slice(0, 10)
  if (!ISO_DATE.test(validFrom) || !ISO_DATE.test(validUntil) || validUntil < validFrom) return null
  // An old flyer still listed: its prices are not current any more, not even the regular one.
  if (validUntil < today) return null

  const pack = globusPackage(raw.quantity, raw.quantityUnit)
  const printed = parseGlobusUnitPrice(raw.unitPrice)
  let offerUnit: { unit: 'kg' | 'l' | 'ks'; unitPrice: number }
  if (printed) {
    // A size in pieces but a price per kg (or the other way round): is the offer price for one piece
    // or for a kilo? Unknowable — rejected rather than guessed.
    if (pack && pack.unit !== printed.unit) return null
    if (pack) {
      const expected = offerPrice / pack.quantity
      if (Math.abs(printed.unitPrice - expected) > expected * UNIT_PRICE_TOLERANCE) return null
    }
    offerUnit = printed
  } else if (pack) {
    offerUnit = { unit: pack.unit, unitPrice: Math.round((offerPrice / pack.quantity) * 100) / 100 }
  } else if (raw.quantityUnit == null) {
    offerUnit = { unit: 'ks', unitPrice: offerPrice }
  } else {
    return null // a size in a unit the app does not model, and no printed unit price
  }

  let regularPrice: number | null = null
  let unitPrice: number | null = null
  const original = raw.originalPrice
  if (original != null && Number.isFinite(original) && original > 0) {
    if (offerPrice > original) return null
    regularPrice = original
    unitPrice = scaleUnitPrice(offerUnit.unitPrice, offerPrice, original)
  }

  const label = packageLabel(raw.quantity, raw.quantityUnit)
  return {
    externalId: ean,
    name: label ? `${baseName} ${label}` : baseName,
    category,
    unit: offerUnit.unit,
    unitPrice,
    regularPrice,
    currency: 'CZK',
    recordedAt: today,
    deal: { dealPrice: offerPrice, unitPrice: offerUnit.unitPrice, validFrom, validUntil },
  }
}

/** The same product can appear on two flyers of one week (the main flyer and a themed one): keep one
 *  offer per barcode and window, the cheaper. Pure/testable. */
export function dedupeGlobusOffers(offers: GlobusRawOffer[]): GlobusRawOffer[] {
  const best = new Map<string, GlobusRawOffer>()
  for (const offer of offers) {
    const key = `${offer.EAN}|${offer.saleFrom}|${offer.saleTo}`
    const current = best.get(key)
    if (!current || (offer.price ?? Infinity) < (current.price ?? Infinity)) best.set(key, offer)
  }
  return [...best.values()]
}

export const globusConnector: PriceConnector<GlobusRawOffer> = {
  source: 'globus',
  chain: 'Globus',
  // A national flyer's offer holds at every Globus hypermarket, not at one branch.
  chainWideDeals: true,
  fetchProducts: async (limit, options) => dedupeGlobusOffers(await fetchGlobusOffers(limit, options)),
  rawId: (raw) => raw.EAN ?? '?',
  normalize: normalizeGlobusOffer,
}
