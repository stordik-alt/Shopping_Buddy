import { generateObject } from 'ai'
import { z } from 'zod'
import { loadFlyerPages, pruneFlyerPages, saveFlyerPage, type FlyerPageRow } from '@/lib/db/queries'
import { fetchWithTimeout } from '@/lib/ingestion/http'
import { scaleUnitPrice, UNIT_PRICE_TOLERANCE } from '@/lib/ingestion/product-discovery'
import { ingestionDate } from '@/lib/ingestion/today'
import type { FetchOptions, IngestResult, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'
import type { ItemCategory } from '@/lib/types'

// --- Source (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) ---------
// Albert has no online shop and no structured price data anywhere (researched 2026-09-23, see
// docs/01_CURRENT_STATE.md). Its weekly flyers are the only public source of its prices:
// - www.albert.cz/aktualni-letaky server-renders the current flyers' metadata (Apollo state
//   `Leaflet:<id>`): title, validity dates, `locationType` (SUPERMARKET / HYPERMARKET — two different
//   flyers with different prices), `documentType` (LEAFLET weekly flyer, CATALOG themed catalogue)
//   and the viewer URL on letaky.albert.cz (Publitas). albert.cz's robots.txt disallows only store
//   search queries and /en/.
// - The viewer's own `spreads.json` lists every page with its image in several sizes and the page's
//   text layer. letaky.albert.cz has no robots.txt; nothing needs a login, and no challenge was seen
//   (checked 2026-09-25).
// The pages carry no product data (their hotspot files are empty), and the text layer has names and
// prices in separate runs, so which price belongs to which product is visible only on the page.
// A model therefore reads each page image (with its text layer for exact spelling) — the owner's
// explicit decision of 2026-09-25 (CLAUDE.md section 30's exception). Everything after that step is
// deterministic, and nothing the model says is trusted on its own (normalizeAlbertOffer).

const LISTING_URL = 'https://www.albert.cz/aktualni-letaky'
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'
/** Page image width sent to the model: small print (unit prices, "vybrané druhy") must stay legible. */
const PAGE_IMAGE_SIZE = 'at1600'
/** Pages sent to the model at the same time. */
const EXTRACTION_CONCURRENCY = 4
/** Time kept free after the last extraction for writing the offers (well under a minute). */
const WRITE_RESERVE_MS = 60_000
/** How long a flyer's cached pages are kept after it ends, as the provenance of its deals. */
const CACHE_KEEP_DAYS = 90

export type AlbertLocationType = 'SUPERMARKET' | 'HYPERMARKET'

export type AlbertLeaflet = {
  id: string
  title: string
  locationType: AlbertLocationType
  documentType: string
  validFrom: string
  validUntil: string
  viewUrl: string
}

/** "23.09.2026" → "2026-09-23"; null when it is not a date in that form. */
function czechDateToIso(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

/** The current flyers in the flyer page's server-rendered state. Pure/testable. A flyer whose dates,
 *  type or viewer URL cannot be read is left out rather than guessed. */
export function parseAlbertLeaflets(html: string): AlbertLeaflet[] {
  const text = html.replace(/\\u002F/g, '/')
  const leaflets = new Map<string, AlbertLeaflet>()
  for (const match of text.matchAll(/"Leaflet:(\d+)":\{/g)) {
    // The flyer's own fields come before its (long) list of stores.
    const start = match.index + match[0].length
    const end = text.indexOf('"stores":', start)
    const body = text.slice(start, end === -1 ? start + 3000 : end)
    const field = (name: string) => new RegExp(`"${name}":"([^"]*)"`).exec(body)?.[1]
    const validFrom = czechDateToIso(field('validityStartDateFormatted') ?? '')
    const validUntil = czechDateToIso(field('validityEndDateFormatted') ?? '')
    const locationType = field('locationType')
    const viewUrl = field('viewUrl')
    if (!validFrom || !validUntil || validUntil < validFrom) continue
    if (locationType !== 'SUPERMARKET' && locationType !== 'HYPERMARKET') continue
    if (!viewUrl || !/^https:\/\/letaky\.albert\.cz\/[\w-]+\/$/.test(viewUrl)) continue
    leaflets.set(match[1], {
      id: match[1],
      title: field('title') ?? '',
      locationType,
      documentType: field('documentType') ?? '',
      validFrom,
      validUntil,
      viewUrl,
    })
  }
  return [...leaflets.values()]
}

export type FlyerPage = { number: number; text: string; imageUrl: string }

type Spread = { pages?: { number?: number; text?: string; images?: Record<string, string> }[] }

/** The pages of a flyer from its viewer's `spreads.json`. Pure/testable. */
export function parseAlbertSpreads(viewUrl: string, spreads: Spread[]): FlyerPage[] {
  const origin = new URL(viewUrl).origin
  const pages: FlyerPage[] = []
  for (const spread of spreads) {
    for (const page of spread.pages ?? []) {
      const image = page.images?.[PAGE_IMAGE_SIZE]
      if (typeof page.number !== 'number' || page.number < 1 || !image) continue
      pages.push({ number: page.number, text: page.text ?? '', imageUrl: new URL(image, origin).toString() })
    }
  }
  return pages
}

// --- Extraction (the model step) ---------------------------------------------------------------

const EXTRACTABLE_CATEGORIES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const satisfies readonly ItemCategory[]

/** What the model reports for one offer on a page. Kept deliberately close to what is printed —
 *  sizes and unit prices as text — so every judgement is made by the deterministic validator. */
export const extractedOfferSchema = z.object({
  brand: z.string().nullable().describe('Brand as printed (e.g. "Madeta"); null if none is printed.'),
  name: z.string().describe('Product name as printed, without the brand, size or price.'),
  packageSize: z.string().nullable().describe('Package size exactly as printed, e.g. "100 g", "0,5 l", "3× 50 g", "1 kg", "16 ks"; null if none.'),
  offerPrice: z.number().nullable().describe('The large promotional price in Kč. "1990" printed large means 19.90; "269,-" means 269.'),
  regularPrice: z.number().nullable().describe('The smaller previous price printed with a slash next to the discount, e.g. "29,90/ -33%" → 29.90; null if none.'),
  discountPercent: z.number().nullable().describe('The printed discount, e.g. "-33 %" → 33; null if none.'),
  unitPriceText: z.string().nullable().describe('The printed price per unit exactly as printed, e.g. "1 l = 25,80 Kč" or "100 g = 15,92 Kč"; null if none.'),
  condition: z
    .enum(['none', 'app_only', 'multi_buy', 'price_from', 'other'])
    .describe('"app_only": the price needs the Albert app / loyalty card; "multi_buy": the price holds only when buying several ("při koupi 3 ks", "1+1"); "price_from": the price is a starting price ("od 19,90"); "other": any other condition; "none" otherwise.'),
  selectedVariants: z.boolean().describe('True when "vybrané druhy" (selected varieties) is printed for the offer.'),
  ownValidity: z.string().nullable().describe('A validity period printed for this one offer if it differs from the whole flyer (e.g. "platí od čtvrtka", "víkendová akce"); null otherwise.'),
  category: z.enum(EXTRACTABLE_CATEGORIES).nullable().describe('Potraviny = food and drink; Drogerie = hygiene, cosmetics, cleaning; Děti = baby and children products; Domácnost = other household goods; Ostatní = anything else (clothes, tools, garden, electronics).'),
})

export type ExtractedOffer = z.infer<typeof extractedOfferSchema>

export type PageExtraction = { offers: ExtractedOffer[]; inputTokens?: number; outputTokens?: number }

/** The model step, behind an interface so tests (and a future cheaper model) plug in. */
export type FlyerPageExtractor = {
  model: string
  extract(page: FlyerPage): Promise<PageExtraction>
}

/** The cheapest Gemini Flash-Lite on the Vercel AI Gateway (as for receipts, lib/receipts.ts) —
 *  CLAUDE.md section 31: the cheapest model that does the job. Re-check
 *  https://ai-gateway.vercel.sh/v1/models before assuming it is still current. */
export const ALBERT_FLYER_MODEL = 'google/gemini-2.5-flash-lite'

const EXTRACTION_PROMPT = `This is one page of a Czech Albert supermarket promotional flyer. List every product offer on the page — each product with ITS OWN price, paired by where they are on the page image (a price belongs to the product it is printed next to or on).

Rules — follow these exactly:
- Never invent, estimate or calculate a value. If something is not clearly printed for that offer, output null.
- Large prices without a comma are in haléře: "1990" means 19.90, "12990" means 129.90. "269,-" means 269.
- The smaller price with a slash ("29,90/") next to a discount ("-33 %") is the previous price of the same offer.
- Copy the package size and the unit price text exactly as printed; do not convert them.
- An offer that is only an illustration, a recipe, a competition, a coupon or a service is not a product offer — leave it out.
- The name is the product's own name, never a slogan, banner or claim printed on or next to it (e.g. "MÁSLO + FERMENTOVANÉ PODMÁSLÍ" on a pastry is a claim; the product is the pastry).
- A page with no product offers (a cover with only a logo, an information page) gives an empty list.

The page's text layer follows (the same page in reading order; use it for exact spelling and numbers, but pair names and prices by the image):
`

/** Reads one page with the model above: the page image plus its text layer, returning structured
 *  offers. `generateObject`'s schema validation makes a response of the wrong shape throw instead of
 *  returning partial data. */
export const geminiFlyerExtractor: FlyerPageExtractor = {
  model: ALBERT_FLYER_MODEL,
  async extract(page) {
    const image = await fetchWithTimeout(page.imageUrl, { headers: { 'User-Agent': USER_AGENT } })
    if (!image.ok) throw new Error(`Albert flyer page ${page.number} image failed: HTTP ${image.status}`)
    const { object, usage } = await generateObject({
      model: ALBERT_FLYER_MODEL,
      schema: z.object({ offers: z.array(extractedOfferSchema) }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT + page.text },
            { type: 'image', image: new Uint8Array(await image.arrayBuffer()), mediaType: 'image/jpeg' },
          ],
        },
      ],
    })
    return { offers: object.offers, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens }
  },
}

// --- Fetcher --------------------------------------------------------------------------------------

/** One offer as read off a flyer page, with the flyer and page it came from. */
export type AlbertRawOffer = {
  offer: ExtractedOffer
  flyerId: string
  pageNumber: number
  /** The page's text layer: the validator checks the model's prices against it. */
  pageText: string
  validFrom: string
  validUntil: string
}

/** The cache of pages already read (the `flyer_pages` table), behind an interface for tests. */
export type FlyerPageCache = {
  load(flyerIds: string[]): Promise<Map<string, Pick<FlyerPageRow, 'offers'>>>
  save(leaflet: AlbertLeaflet, pageNumber: number, extraction: PageExtraction, model: string): Promise<void>
  prune(before: string): Promise<void>
}

export const dbFlyerPageCache: FlyerPageCache = {
  load: (flyerIds) => loadFlyerPages('albert', flyerIds),
  save: (leaflet, pageNumber, extraction, model) =>
    saveFlyerPage({
      source: 'albert',
      flyerId: leaflet.id,
      pageNumber,
      locationType: leaflet.locationType,
      validFrom: leaflet.validFrom,
      validUntil: leaflet.validUntil,
      offers: extraction.offers,
      model,
      inputTokens: extraction.inputTokens ?? null,
      outputTokens: extraction.outputTokens ?? null,
    }),
  prune: async (before) => {
    await pruneFlyerPages('albert', before)
  },
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Runs `task` over `items` with at most `limit` running at once, starting none after `stop()`. */
async function runPool<T>(items: T[], limit: number, stop: () => boolean, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length && !stop()) await task(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export type AlbertFetchDeps = {
  extractor: FlyerPageExtractor
  cache: FlyerPageCache
  fetch?: typeof fetchWithTimeout
  today?: string
  /** At most this many pages are sent to the model in the call — for a cheap trial run. */
  maxNewPages?: number
}

/** Every offer of the current flyers for one store format. Pages read before come from the cache;
 *  the others are sent to the model — as many as the run's time budget allows, leaving time to write
 *  the offers; the next run continues with the rest. A page whose extraction fails is left for the
 *  next run and does not stop the others; when no flyer can be listed at all the source is down. */
export async function fetchAlbertOffers(locationType: AlbertLocationType, deps: AlbertFetchDeps, options: FetchOptions = {}): Promise<AlbertRawOffer[]> {
  const get = deps.fetch ?? fetchWithTimeout
  const today = deps.today ?? ingestionDate()
  const listing = await get(LISTING_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!listing.ok) throw new Error(`Albert flyer listing failed: HTTP ${listing.status}`)
  const all = parseAlbertLeaflets(await listing.text())
  if (all.length === 0) throw new Error('Albert flyer listing has no flyers (the page layout may have changed)')
  const leaflets = all.filter((leaflet) => leaflet.locationType === locationType && leaflet.validUntil >= today)

  await deps.cache.prune(addDays(today, -CACHE_KEEP_DAYS))
  const cached = await deps.cache.load(leaflets.map((leaflet) => leaflet.id))
  const extractionDeadline = options.deadline != null ? options.deadline - WRITE_RESERVE_MS : undefined
  const outOfTime = () => extractionDeadline != null && Date.now() >= extractionDeadline
  let started = 0
  const stop = () => outOfTime() || started >= (deps.maxNewPages ?? Infinity)

  const offers: AlbertRawOffer[] = []
  const failures: string[] = []
  for (const leaflet of leaflets) {
    const response = await get(new URL('spreads.json', leaflet.viewUrl).toString(), { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
    if (!response.ok) throw new Error(`Albert flyer ${leaflet.id} pages failed: HTTP ${response.status}`)
    const pages = parseAlbertSpreads(leaflet.viewUrl, (await response.json()) as Spread[])

    const collect = (page: FlyerPage, pageOffers: ExtractedOffer[]) => {
      for (const offer of pageOffers) {
        offers.push({ offer, flyerId: leaflet.id, pageNumber: page.number, pageText: page.text, validFrom: leaflet.validFrom, validUntil: leaflet.validUntil })
      }
    }
    const missing: FlyerPage[] = []
    for (const page of pages) {
      const hit = cached.get(`${leaflet.id}|${page.number}`)
      if (hit) collect(page, readCachedOffers(hit.offers))
      else missing.push(page)
    }
    await runPool(missing, EXTRACTION_CONCURRENCY, stop, async (page) => {
      started++
      try {
        const extraction = await deps.extractor.extract(page)
        await deps.cache.save(leaflet, page.number, extraction, deps.extractor.model)
        collect(page, extraction.offers)
      } catch (err) {
        failures.push(`${leaflet.id}/${page.number}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
    if (outOfTime()) break
  }
  // Every page failed and nothing was cached: the model (or the images) are down — say so instead of
  // reporting an empty flyer.
  if (offers.length === 0 && failures.length > 0) throw new Error(`Albert flyer pages failed: ${failures.slice(0, 3).join('; ')}`)
  return offers
}

/** Cached offers are re-validated against the current schema: a row written by an older version
 *  that no longer fits is skipped, not trusted. */
function readCachedOffers(value: unknown): ExtractedOffer[] {
  const parsed = z.array(extractedOfferSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

type Pack = { unit: 'kg' | 'l' | 'ks'; quantity: number }

function toNumber(text: string): number {
  return Number(text.replace(/[\s ]/g, '').replace(',', '.'))
}

function unitPack(amount: number, unit: string): Pack | null {
  switch (unit.toLowerCase()) {
    case 'g':
      return { unit: 'kg', quantity: amount / 1000 }
    case 'kg':
      return { unit: 'kg', quantity: amount }
    case 'ml':
      return { unit: 'l', quantity: amount / 1000 }
    case 'l':
      return { unit: 'l', quantity: amount }
    case 'ks':
      return { unit: 'ks', quantity: amount }
    default:
      return null
  }
}

/** A printed package size in the app's units: "100 g" → 0.1 kg, "0,5 l", "3× 50 g" → 0.15 kg,
 *  "16 ks". A range ("180–200 g"), a count of packs ("5 bal.") or anything else → null, since the
 *  price per unit could not be stated honestly. Pure/testable. */
export function parseAlbertPackage(text: string): Pack | null {
  const match = /^\s*(?:(\d+)\s*[×x]\s*)?(\d+(?:[,.]\d+)?)\s*(g|kg|ml|l|ks)\s*$/i.exec(text)
  if (!match) return null
  const count = match[1] ? Number(match[1]) : 1
  const amount = toNumber(match[2])
  if (!Number.isFinite(amount) || amount <= 0 || count <= 0) return null
  const pack = unitPack(amount * count, match[3])
  return pack && pack.quantity > 0 ? pack : null
}

/** "1 l = 25,80 Kč", "100 g = 15,92 Kč", "1 ks = 19,97 Kč" → the price per kg, l or piece. Pure. */
export function parseAlbertUnitPrice(text: string): { unit: 'kg' | 'l' | 'ks'; unitPrice: number } | null {
  const match = /^\s*(\d+(?:[,.]\d+)?)\s*(g|kg|ml|l|ks)\s*=\s*(\d[\d\s ]*(?:,\d{1,2})?)\s*Kč\s*$/i.exec(text)
  if (!match) return null
  const pack = unitPack(toNumber(match[1]), match[2])
  const price = toNumber(match[3])
  if (!pack || !Number.isFinite(price) || price <= 0) return null
  return { unit: pack.unit, unitPrice: Math.round((price / pack.quantity) * 100) / 100 }
}

/** Is this price printed on the page? Albert prints the big price without a comma ("1990"), and the
 *  text layer sometimes splits it into "19" and "90"; small prices are "29,90" or "269,-". A price
 *  the model reports that is not on the page at all is a misreading or an invention. Pure. */
export function priceIsOnPage(price: number, pageText: string): boolean {
  if (!Number.isFinite(price) || price <= 0) return false
  const [koruny, halere] = price.toFixed(2).split('.')
  const text = pageText.replace(/ /g, ' ')
  const standalone = (token: string) => new RegExp(`(?<![\\d,.])${token}(?![\\d])`).test(text)
  if (standalone(`${koruny},${halere}`) || standalone(`${koruny}${halere}`)) return true
  if (halere === '00' && standalone(`${koruny},-`)) return true
  // Split big price: both halves present as separate numbers.
  const tokens = new Set(text.split(/[^\d]+/).filter(Boolean))
  return tokens.has(koruny) && tokens.has(halere)
}

/** Name for the identity key: lower case, no diacritics or punctuation, single spaces. */
function keyPart(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
}

/** The product's identity when the flyer gives no product id (CLAUDE.md section 12: stable identity
 *  — here the brand, name, package size and whether the offer covers several varieties, so that the
 *  same offer next week is the same product and two sizes stay two products). Pure. */
export function albertProductKey(offer: Pick<ExtractedOffer, 'brand' | 'name' | 'packageSize' | 'selectedVariants'>, pack: Pack | null): string {
  const size = pack ? `${Math.round(pack.quantity * 1000) / 1000}${pack.unit}` : keyPart(offer.packageSize ?? '')
  return ['v1', keyPart(offer.brand ?? ''), keyPart(offer.name), size, offer.selectedVariants ? 'vybrane' : ''].join('|')
}

const IMPORTED_CATEGORIES = new Set<ItemCategory>(['Potraviny', 'Drogerie', 'Děti', 'Domácnost'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PRICE = 100_000

export type AlbertValidation = { product: NormalizedProduct } | { rejected: string }

/** Why a name the model read cannot be a product's name, or null. A name that joins words with
 *  " + " is a claim printed on the pack (what it is made with), not its name: on 2026-09-26 the
 *  "Mistrovská máslová makovka 70 g" was stored as "MÁSLO + JIHOČESKÉ FERMENTOVANÉ PODMÁSLÍ" and the
 *  shopping plan offered it for butter. A real name with " + " would be a bundle of two products,
 *  which one price cannot describe either. A "+" inside a brand ("Absorb+") is not a join. Pure. */
export function albertNameProblem(name: string): string | null {
  return /\s\+\s/.test(name) ? `name joins two things: ${name.trim()}` : null
}

/** One offer read by the model → a validated product with its dated deal, or why it was rejected (CLAUDE.md
 *  section 33). The model only reads; this decides, and rejects rather than guesses:
 *  - a condition not every household meets (Albert app price, multi-buy, "od" price, other) or a
 *    validity of its own that differs from the flyer's;
 *  - not food, drugstore, baby or household goods;
 *  - an offer price that is not printed on the page (priceIsOnPage) — a misread or invented number;
 *  - a package size that is printed but not a single amount the app can price ("180–200 g", "5 bal.");
 *  - a printed unit price that contradicts the offer price ÷ package size;
 *  - a previous price and discount that do not agree with the offer price, or are not on the page.
 *  And since pairing names with prices is exactly what a model can get wrong, an offer is accepted
 *  only when the page confirms the pairing independently: the printed discount matches the offer and
 *  previous price, or the printed unit price matches the offer price and package size.
 *  Prices: the offer is the deal; the previous price is recorded as the regular price only when the
 *  discount confirms it (never the offer posing as the everyday price, sections 16 and 18). */
export function validateAlbertOffer(raw: AlbertRawOffer, today: string): AlbertValidation {
  const reject = (reason: string): AlbertValidation => ({ rejected: reason })
  const { offer } = raw
  const name = offer.name.trim()
  if (!name) return reject('no name')
  const nameProblem = albertNameProblem(name)
  if (nameProblem) return reject(nameProblem)
  if (offer.condition !== 'none') return reject(`condition: ${offer.condition}`)
  if ((offer.ownValidity ?? '').trim()) return reject(`own validity: ${offer.ownValidity}`)
  if (!offer.category || !IMPORTED_CATEGORIES.has(offer.category)) return reject(`category: ${offer.category ?? 'none'}`)
  if (!ISO_DATE.test(raw.validFrom) || !ISO_DATE.test(raw.validUntil) || raw.validUntil < raw.validFrom) return reject('invalid flyer dates')
  if (raw.validUntil < today) return reject('flyer ended')

  const offerPrice = offer.offerPrice
  if (offerPrice == null || !Number.isFinite(offerPrice) || offerPrice <= 0 || offerPrice > MAX_PRICE) return reject('no offer price')
  if (!priceIsOnPage(offerPrice, raw.pageText)) return reject(`offer price ${offerPrice} not on the page`)

  const sizeText = (offer.packageSize ?? '').trim()
  const pack = sizeText ? parseAlbertPackage(sizeText) : null
  if (sizeText && !pack) return reject(`package size not a single amount: ${sizeText}`)

  // Unit price check: printed per-unit price vs. offer price ÷ package.
  const printedUnit = offer.unitPriceText ? parseAlbertUnitPrice(offer.unitPriceText) : null
  let unitConfirmed = false
  if (printedUnit && pack) {
    if (printedUnit.unit !== pack.unit) return reject(`unit price in ${printedUnit.unit}, package in ${pack.unit}`)
    const expected = offerPrice / pack.quantity
    if (Math.abs(printedUnit.unitPrice - expected) > expected * UNIT_PRICE_TOLERANCE) return reject(`unit price ${offer.unitPriceText} contradicts ${offerPrice} / ${sizeText}`)
    unitConfirmed = true
  }

  // Discount check: previous price and printed discount vs. the offer price.
  let discountConfirmed = false
  const regular = offer.regularPrice
  if (regular != null) {
    if (!Number.isFinite(regular) || regular <= offerPrice || regular > MAX_PRICE) return reject(`previous price ${regular} not above the offer ${offerPrice}`)
    if (!priceIsOnPage(regular, raw.pageText)) return reject(`previous price ${regular} not on the page`)
    if (offer.discountPercent != null) {
      const computed = Math.round((1 - offerPrice / regular) * 100)
      if (Math.abs(computed - offer.discountPercent) > 1) return reject(`discount -${offer.discountPercent} % contradicts ${regular} → ${offerPrice}`)
      discountConfirmed = true
    }
  }
  if (!unitConfirmed && !discountConfirmed) return reject('pairing not confirmed by a printed discount or unit price')

  // The offer's unit price: from the package; else the printed one; else — no size printed — per piece.
  const offerUnit = pack
    ? { unit: pack.unit, unitPrice: Math.round((offerPrice / pack.quantity) * 100) / 100 }
    : printedUnit ?? { unit: 'ks' as const, unitPrice: offerPrice }

  const brand = (offer.brand ?? '').trim()
  const displayName = [brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? brand : '', name, sizeText].filter(Boolean).join(' ')
  return {
    product: {
      externalId: albertProductKey(offer, pack),
      name: offer.selectedVariants ? `${displayName} (vybrané druhy)` : displayName,
      category: offer.category,
      unit: offerUnit.unit,
      unitPrice: discountConfirmed && regular != null ? scaleUnitPrice(offerUnit.unitPrice, offerPrice, regular) : null,
      regularPrice: discountConfirmed ? regular : null,
      currency: 'CZK',
      recordedAt: today,
      deal: { dealPrice: offerPrice, unitPrice: offerUnit.unitPrice, validFrom: raw.validFrom, validUntil: raw.validUntil },
    },
  }
}

/** validateAlbertOffer() without the reason — the connector's `normalize`. */
export function normalizeAlbertOffer(raw: AlbertRawOffer, today: string): NormalizedProduct | null {
  const result = validateAlbertOffer(raw, today)
  return 'product' in result ? result.product : null
}

/** The same product appears on several pages (the cover repeats inside) and in several flyers of
 *  one format (the weekly flyer and a themed catalogue). One deal per product and chain is kept
 *  (upsertActiveDeal keeps one running deal per product): of the offers that pass validation, the
 *  cheapest. Offers that fail validation are all kept, so the run counts them as skipped. Pure. */
export function dedupeAlbertOffers(raws: AlbertRawOffer[], today: string): AlbertRawOffer[] {
  const rejected: AlbertRawOffer[] = []
  const best = new Map<string, { raw: AlbertRawOffer; price: number }>()
  for (const raw of raws) {
    const product = normalizeAlbertOffer(raw, today)
    if (!product?.deal) {
      rejected.push(raw)
      continue
    }
    const current = best.get(product.externalId)
    if (!current || product.deal.dealPrice < current.price) best.set(product.externalId, { raw, price: product.deal.dealPrice })
  }
  return [...rejected, ...[...best.values()].map((entry) => entry.raw)]
}

/** The connector for one of Albert's two store formats: the supermarket flyer's offers belong to the
 *  "Albert" chain, the hypermarket flyer's to "Albert Hypermarket" (migration 0029), so prices that
 *  differ between the formats are never mixed. Both share the `albert` source, so one product is one
 *  product in both. A flyer holds at every store of its format, so the deals are chain-wide. */
export function createAlbertConnector(chain: string, locationType: AlbertLocationType, deps: AlbertFetchDeps): PriceConnector<AlbertRawOffer> {
  return {
    source: 'albert',
    chain,
    chainWideDeals: true,
    fetchProducts: async (limit, options) => {
      const raws = await fetchAlbertOffers(locationType, deps, options)
      return dedupeAlbertOffers(raws, deps.today ?? ingestionDate()).slice(0, limit)
    },
    rawId: (raw) => `${raw.flyerId}/${raw.pageNumber} ${raw.offer.name}`,
    normalize: normalizeAlbertOffer,
  }
}

const defaultDeps: AlbertFetchDeps = { extractor: geminiFlyerExtractor, cache: dbFlyerPageCache }
export const albertSupermarketConnector = createAlbertConnector('Albert', 'SUPERMARKET', defaultDeps)
export const albertHypermarketConnector = createAlbertConnector('Albert Hypermarket', 'HYPERMARKET', defaultDeps)

/** Two runs' results as one (the `albert` source runs both formats). */
export function mergeIngestResults(a: IngestResult, b: IngestResult): IngestResult {
  return {
    processed: a.processed + b.processed,
    recorded: a.recorded + b.recorded,
    newProducts: a.newProducts + b.newProducts,
    deals: a.deals + b.deals,
    promotionsWithoutValidity: a.promotionsWithoutValidity + b.promotionsWithoutValidity,
    skipped: a.skipped + b.skipped,
    unchanged: a.unchanged + b.unchanged,
    priceChanges: a.priceChanges + b.priceChanges,
    truncated: a.truncated || b.truncated,
    errors: [...a.errors, ...b.errors],
  }
}
