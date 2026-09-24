import { gunzipSync } from 'node:zlib'
import type { ItemCategory, ItemUnit } from '@/lib/types'
import type { PriceConnector } from '@/lib/ingestion/types'

// --- Fetcher (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) --------
// Lidl CZ has no public retailer API; these are the site's own published, machine-readable
// surfaces (the product sitemap it declares in robots.txt, and the JSON endpoint its own product
// grid pages call to render prices) — not an undocumented/protected internal API being forced open.
// Neither path is covered by lidl.cz's robots.txt Disallow rules (checked 2026-09-23).

const SITEMAP_URL = 'https://www.lidl.cz/p/export/CZ/cs/product_sitemap.xml.gz'
const GRIDBOXES_URL = 'https://www.lidl.cz/p/api/gridboxes/CZ/cs'
// Matches the batch size the site's own pages request (observed via network capture) — not an
// arbitrary choice, and small enough to stay well clear of anything that would look like abuse.
export const GRIDBOXES_BATCH_SIZE = 20

export type LidlSitemapEntry = { erpNumber: string; slug: string }

/** Parses the product sitemap's `<loc>` entries (already-decompressed XML text) into
 *  `{erpNumber, slug}` pairs. Pure/testable — the actual download+gunzip happens in
 *  `fetchLidlSitemap()` below. */
export function parseLidlSitemap(xml: string): LidlSitemapEntry[] {
  const entries: LidlSitemapEntry[] = []
  const pattern = /<loc>https:\/\/www\.lidl\.cz\/p\/([a-z0-9-]+)\/p(\d+)<\/loc>/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml))) {
    entries.push({ slug: match[1], erpNumber: match[2] })
  }
  return entries
}

// A curated, explicitly-placeholder keyword list (Czech grocery staples), not an attempt at
// complete category coverage — the sitemap itself carries no category info, only a slug, so this
// is how the pilot ingestion batch (docs/01_CURRENT_STATE.md section 15) stays scoped to groceries
// without first fetching all ~36k products' full detail just to filter by category. Widening this
// list (or replacing it with a real category-aware discovery mechanism) is expected once ingestion
// moves past the initial pilot.
const GROCERY_SLUG_KEYWORDS = [
  'mleko', 'vejce', 'banany', 'jablka', 'chleb', 'rohliky', 'maslo', 'syr', 'kureci', 'hovezi',
  'vepr', 'ryze', 'testoviny', 'rajcata', 'brambory', 'mrkev', 'jogurt', 'sunka', 'cibule', 'cukr',
  'mouka', 'olej', 'pivo', 'vino', 'kava', 'caj', 'tvaroh', 'salam', 'okurky', 'papriky', 'citron',
]

// A real pilot run surfaced a second, deeper false-positive pattern beyond simple substring
// collisions (fixed by exact-token matching below): Czech kitchenware/accessory products are
// routinely named "<gadget> na <food>" — "regál na víno" (wine RACK), "dóza na kávu" (coffee JAR),
// "strojek na těstoviny" (pasta MAKER) — so a grocery keyword can be an exact slug token while the
// product itself is a durable good, not food. These gadget-pattern words are a strong signal to
// exclude a candidate before even fetching its price — cheap, since it avoids wasting a gridboxes
// call on something the authoritative category check below (mapLidlCategory) would reject anyway.
const ACCESSORY_SLUG_EXCLUDE = [
  'regal', 'dozu', 'doza', 'strojek', 'sada', 'stojan', 'sklenice', 'sklenic', 'hrnek', 'hrnky',
  'konvice', 'mlynek', 'mlynky', 'rozprasovac', 'forma', 'nadobi', 'sitko', 'karafa', 'dekantér', 'dekanter',
]

/** Filters sitemap entries down to ones with a slug *token* (hyphen-separated word) matching a
 *  known grocery keyword exactly, and returns up to `limit` of their erpNumbers — a cheap,
 *  slug-only pre-filter, not the final say. This narrows the ~12k-entry sitemap down to a
 *  manageable candidate pool worth actually fetching; `normalizeLidlProduct()`'s category check
 *  (via `mapLidlCategory`) below is the authoritative filter, since only the fetched response
 *  carries Lidl's own real category. Matches on whole tokens rather than substring `includes()`
 *  deliberately: a real pilot run surfaced substring false positives this exact-token approach
 *  avoids — "olej" (cooking oil) inside "petrolejovy" (paraffin heater), "mleko" (milk) inside
 *  "mlekovar" (a milk-frothing appliance), "kava" (coffee) inside "nepromokava"
 *  (waterproof/rainproof). Pure/testable; deterministic given the same sitemap input. */
export function selectGroceryErpNumbers(entries: LidlSitemapEntry[], limit: number): string[] {
  const matched = entries.filter((entry) => {
    const tokens = entry.slug.split('-')
    if (ACCESSORY_SLUG_EXCLUDE.some((word) => tokens.includes(word))) return false
    return GROCERY_SLUG_KEYWORDS.some((keyword) => tokens.includes(keyword))
  })
  return matched.slice(0, limit).map((entry) => entry.erpNumber)
}

export async function fetchLidlSitemap(): Promise<LidlSitemapEntry[]> {
  const response = await fetch(SITEMAP_URL)
  if (!response.ok) throw new Error(`Lidl sitemap fetch failed: HTTP ${response.status}`)
  const gzipped = Buffer.from(await response.arrayBuffer())
  const xml = gunzipSync(gzipped).toString('utf-8')
  return parseLidlSitemap(xml)
}

// Shape is a deliberately small subset of the real response — only the fields this connector
// actually reads. The real API returns far more (images, seals, badges, analytics ids, ...).
export type LidlRawProduct = {
  erpNumber: string
  fullTitle?: string
  title?: string
  category?: string
  keyfacts?: { wonCategoryPrimary?: string }
  price?: {
    price?: number
    oldPrice?: number
    currencyCode?: string
    packaging?: { text?: string }
    basePrice?: { text?: string }
    discount?: { startDate?: string; endDate?: string }
  }
}

export async function fetchLidlProductBatch(erpNumbers: string[]): Promise<LidlRawProduct[]> {
  const url = `${GRIDBOXES_URL}?erpNumbers=${erpNumbers.join(',')}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Lidl gridboxes fetch failed: HTTP ${response.status}`)
  return response.json()
}

/** Fetches product data for an arbitrary list of erpNumbers, chunked into the same batch size the
 *  site itself uses. Failure isolation per CLAUDE.md section 32 ("if a retailer source stops
 *  working, the rest of the application should continue functioning") happens one level up, in
 *  the cron route — a single bad batch there doesn't need to abort every other batch here. */
export async function fetchLidlProducts(erpNumbers: string[]): Promise<LidlRawProduct[]> {
  const results: LidlRawProduct[] = []
  for (let i = 0; i < erpNumbers.length; i += GRIDBOXES_BATCH_SIZE) {
    const batch = erpNumbers.slice(i, i + GRIDBOXES_BATCH_SIZE)
    results.push(...(await fetchLidlProductBatch(batch)))
  }
  return results
}

// --- Normalizer + Validator (folded into one set of pure functions for a single source) ----------

const PACKAGING_PATTERN = /^([\d.,]+)\s*(ks|kg|g|l|ml)\b/i

/** Parses a packaging string like "750 ml" or "10 ks" into a quantity+unit. `null` for anything
 *  that doesn't match a unit this app models (per CLAUDE.md section 33 — reject/flag rather than
 *  guess), including a missing string. */
export function parseLidlPackaging(text: string | undefined | null): { quantity: number; unit: ItemUnit } | null {
  if (!text) return null
  const match = PACKAGING_PATTERN.exec(text.trim())
  if (!match) return null
  const quantity = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  return { quantity, unit: match[2].toLowerCase() as ItemUnit }
}

const BASE_PRICE_PATTERN = /1\s*(ks|kg|g|l|ml)\s*=\s*([\d.,]+)\s*Kč/i

/** Parses Lidl's own already-normalized unit-price string, e.g. "1 l = 49,86 Kč" or
 *  "10 ks, 1 ks = 6,99 Kč" — the retailer's own computed per-unit price, preferred over deriving
 *  one ourselves from price/packaging since it's authoritative and avoids a rounding mismatch. */
export function parseLidlBasePrice(text: string | undefined | null): { unit: ItemUnit; unitPrice: number } | null {
  if (!text) return null
  const match = BASE_PRICE_PATTERN.exec(text)
  if (!match) return null
  const unitPrice = Number(match[2].replace(',', '.'))
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null
  return { unit: match[1].toLowerCase() as ItemUnit, unitPrice }
}

/** Real per-unit price for a product: prefers Lidl's own `basePrice` text (see above); falls back
 *  to deriving one from `price / packaging quantity` when only packaging is known; falls back to
 *  treating the whole listed price as "1 ks" when neither is present (matches how a plain
 *  count-style item is already represented elsewhere in this app, e.g. `lib/mock-data.ts`). Never
 *  invents a package size that isn't stated anywhere. */
function deriveUnitPrice(price: number, raw: LidlRawProduct): { unit: ItemUnit; unitPrice: number } {
  const basePrice = parseLidlBasePrice(raw.price?.basePrice?.text)
  if (basePrice) return basePrice
  const packaging = parseLidlPackaging(raw.price?.packaging?.text)
  if (packaging) return { unit: packaging.unit, unitPrice: Math.round((price / packaging.quantity) * 100) / 100 }
  return { unit: 'ks', unitPrice: price }
}

const CATEGORY_KEYWORDS: { keyword: string; category: ItemCategory }[] = [
  { keyword: 'potraviny', category: 'Potraviny' },
  { keyword: 'food', category: 'Potraviny' }, // the response's plain top-level `category` field uses this English value
  { keyword: 'drogerie', category: 'Drogerie' },
  { keyword: 'kosmetika', category: 'Drogerie' },
  { keyword: 'miminka', category: 'Děti' },
  { keyword: 'dům a zahrada', category: 'Domácnost' },
  { keyword: 'domácnost', category: 'Domácnost' },
]

/** Maps Lidl's own (much more granular) category text onto this app's fixed 5-category set —
 *  small, explicit keyword list in the same spirit as `lib/pantry.ts`'s `inferPantryLocation()`,
 *  not an attempt at a complete taxonomy mapping. Defaults to 'Ostatní' rather than guessing. */
export function mapLidlCategory(raw: LidlRawProduct): ItemCategory {
  const text = `${raw.keyfacts?.wonCategoryPrimary ?? ''} ${raw.category ?? ''}`.toLowerCase()
  for (const { keyword, category } of CATEGORY_KEYWORDS) {
    if (text.includes(keyword)) return category
  }
  return 'Ostatní'
}

export type NormalizedLidlProduct = {
  externalId: string
  name: string
  category: ItemCategory
  unit: ItemUnit
  unitPrice: number
  regularPrice: number
  currency: string
  recordedAt: string
  deal?: { dealPrice: number; validFrom: string; validUntil: string }
}

/** Turns one raw gridboxes record into a validated, normalized product — or `null` when it isn't
 *  usable, per CLAUDE.md section 33 ("reject or flag suspicious data rather than silently
 *  inserting it"):
 *  - no name, or no numeric price at all (e.g. weight-priced produce sold by scale in-store, which
 *    genuinely has no fixed online price — never invented here)
 *  - a non-positive price
 *  - a currency other than CZK (this app's price model assumes CZK for the Czech market)
 *  - a discount window that ends before it starts
 *  - not actually a grocery item — `mapLidlCategory()` doesn't resolve it to 'Potraviny'. Shopping
 *    Buddy's catalog is grocery-only; `selectGroceryErpNumbers()`'s slug-keyword pre-filter is only
 *    a cheap heuristic to avoid fetching the entire sitemap, and a pilot run showed it lets through
 *    real false positives (Czech kitchenware is routinely named "<gadget> na <food>" — a wine
 *    rack's slug contains "vino" as a real, non-substring-collision token). This check, using
 *    Lidl's own real category from the fetched response, is the authoritative gate.
 *  `today` is passed in (not read from the system clock here) so this stays a pure, testable
 *  function — the caller supplies it, same convention as `lib/budget.ts`'s `TODAY`. */
export function normalizeLidlProduct(raw: LidlRawProduct, today: string): NormalizedLidlProduct | null {
  const name = (raw.fullTitle ?? raw.title ?? '').trim()
  if (!name) return null

  const price = raw.price?.price
  if (price == null || !Number.isFinite(price) || price <= 0) return null

  const currency = raw.price?.currencyCode ?? 'CZK'
  if (currency !== 'CZK') return null

  const category = mapLidlCategory(raw)
  if (category !== 'Potraviny') return null

  const { unit, unitPrice } = deriveUnitPrice(price, raw)

  const discount = raw.price?.discount
  const oldPrice = raw.price?.oldPrice
  let deal: NormalizedLidlProduct['deal']
  let regularPrice = price
  if (oldPrice != null && oldPrice > price && discount?.startDate && discount?.endDate) {
    const validFrom = discount.startDate.slice(0, 10)
    const validUntil = discount.endDate.slice(0, 10)
    if (validUntil < validFrom) return null // a promotion ending before it starts — reject, don't guess which date is wrong
    deal = { dealPrice: price, validFrom, validUntil }
    regularPrice = oldPrice
  }

  return {
    externalId: raw.erpNumber,
    name,
    category,
    unit,
    unitPrice,
    regularPrice,
    currency,
    recordedAt: today,
    deal,
  }
}

/** Lidl as a `PriceConnector` for the shared ingestion orchestrator (`lib/ingestion/ingest.ts`):
 *  pre-filters the sitemap by grocery slug keywords, then fetches the matching products. */
export const lidlConnector: PriceConnector<LidlRawProduct> = {
  source: 'lidl',
  chain: 'Lidl',
  async fetchProducts(limit) {
    const sitemap = await fetchLidlSitemap()
    return fetchLidlProducts(selectGroceryErpNumbers(sitemap, limit))
  },
  rawId: (raw) => raw.erpNumber,
  normalize: normalizeLidlProduct,
}
