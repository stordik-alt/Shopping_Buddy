import { generateObject } from 'ai'
import { z } from 'zod'
import { loadFlyerPages, pruneFlyerPages, saveFlyerPage, type FlyerPageRow } from '@/lib/db/queries'
import { fetchWithTimeout } from '@/lib/ingestion/http'
import { scaleUnitPrice, UNIT_PRICE_TOLERANCE } from '@/lib/ingestion/product-discovery'
import { ingestionDate } from '@/lib/ingestion/today'
import type { FetchOptions, IngestionSource, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'
import type { ItemCategory } from '@/lib/types'

/** Provider-specific settings, typed as generateObject takes them (the type lives in a package the app
 *  does not depend on directly). */
type ProviderOptions = NonNullable<Parameters<typeof generateObject>[0]['providerOptions']>

// Promotional flyers read page by page by a model — the part every flyer source shares (Albert:
// lib/ingestion/albert.ts, Penny: lib/ingestion/penny-flyer.ts). A retailer that publishes its prices
// only as flyer pages, whose text layer does not say which price belongs to which product, gets each
// page read once by the cheapest model (the owner's explicit decisions, CLAUDE.md section 30's
// exceptions). The result is cached per page (`flyer_pages`), and nothing the model says is trusted on
// its own: a deterministic validator (validateFlyerOffer) accepts an offer only when the page itself
// confirms it. A source supplies only how to list its current flyers and their pages.

export const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'
/** Pages sent to the model at the same time. */
const EXTRACTION_CONCURRENCY = 4
/** Time kept free after the last extraction for writing the offers (well under a minute). */
const WRITE_RESERVE_MS = 60_000
/** How long a flyer's cached pages are kept after it ends, as the provenance of its deals. */
const CACHE_KEEP_DAYS = 90

/** One current flyer. `locationType` names the store format it is for (Albert: SUPERMARKET or
 *  HYPERMARKET; a retailer with one format uses one fixed value). */
export type Flyer = { id: string; locationType: string; validFrom: string; validUntil: string }

export type FlyerPage = { number: number; text: string; imageUrl: string }

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
    .describe('"app_only": the price needs the retailer\'s app / loyalty card; "multi_buy": the price holds only when buying several ("při koupi 3 ks", "1+1"); "price_from": the price is a starting price ("od 19,90"); "other": any other condition; "none" otherwise.'),
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
export const FLYER_MODEL = 'google/gemini-2.5-flash-lite'

/** The instructions for one page. `retailer` is the store as the flyer names it ("Albert supermarket"). */
export function flyerExtractionPrompt(retailer: string): string {
  return `This is one page of a Czech ${retailer} promotional flyer. List every product offer on the page — each product with ITS OWN price, paired by where they are on the page image (a price belongs to the product it is printed next to or on).

Rules — follow these exactly:
- Never invent, estimate or calculate a value. If something is not clearly printed for that offer, output null.
- Large prices without a comma are in haléře: "1990" means 19.90, "12990" means 129.90. "269,-" means 269.
- The smaller price with a slash ("29,90/") next to a discount ("-33 %") is the previous price of the same offer.
- Copy the package size and the unit price text exactly as printed; do not convert them.
- The name is the product's own name, never a slogan, banner or claim printed on or next to it (e.g. "MÁSLO + FERMENTOVANÉ PODMÁSLÍ" on a pastry is a claim; the product is the pastry).
- An offer that is only an illustration, a recipe, a competition, a coupon or a service is not a product offer — leave it out.
- A page with no product offers (a cover with only a logo, an information page) gives an empty list.

The page's text layer follows (the same page in reading order; use it for exact spelling and numbers, but pair names and prices by the image):
`
}

/** Reads one page with `model` (FLYER_MODEL unless a source needs another): the page image plus its text layer, returning structured offers.
 *  `generateObject`'s schema validation makes a response of the wrong shape throw instead of
 *  returning partial data. */
export function createGeminiFlyerExtractor(
  retailer: string,
  { model = FLYER_MODEL, providerOptions }: { model?: string; providerOptions?: ProviderOptions } = {},
): FlyerPageExtractor {
  const prompt = flyerExtractionPrompt(retailer)
  return {
    model,
    async extract(page) {
      const image = await fetchWithTimeout(page.imageUrl, { headers: { 'User-Agent': USER_AGENT } })
      if (!image.ok) throw new Error(`${retailer} flyer page ${page.number} image failed: HTTP ${image.status}`)
      const { object, usage } = await generateObject({
        model,
        schema: z.object({ offers: z.array(extractedOfferSchema) }),
        ...(providerOptions ? { providerOptions } : {}),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt + page.text },
              { type: 'file', data: new Uint8Array(await image.arrayBuffer()), mediaType: 'image/jpeg' },
            ],
          },
        ],
      })
      return { offers: object.offers, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens }
    },
  }
}

// --- Fetcher --------------------------------------------------------------------------------------

/** One offer as read off a flyer page, with the flyer and page it came from. */
export type FlyerRawOffer = {
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
  save(flyer: Flyer, pageNumber: number, extraction: PageExtraction, model: string): Promise<void>
  prune(before: string): Promise<void>
}

/** The `flyer_pages` cache of one source. */
export function createDbFlyerPageCache(source: IngestionSource): FlyerPageCache {
  return {
    load: (flyerIds) => loadFlyerPages(source, flyerIds),
    save: (flyer, pageNumber, extraction, model) =>
      saveFlyerPage({
        source,
        flyerId: flyer.id,
        pageNumber,
        locationType: flyer.locationType,
        validFrom: flyer.validFrom,
        validUntil: flyer.validUntil,
        offers: extraction.offers,
        model,
        inputTokens: extraction.inputTokens ?? null,
        outputTokens: extraction.outputTokens ?? null,
      }),
    prune: async (before) => {
      await pruneFlyerPages(source, before)
    },
  }
}

export function addDays(isoDate: string, days: number): string {
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

export type FlyerFetchDeps = {
  extractor: FlyerPageExtractor
  cache: FlyerPageCache
  fetch?: typeof fetchWithTimeout
  today?: string
  /** At most this many pages are sent to the model in the call — for a cheap trial run. */
  maxNewPages?: number
}

/** How one retailer publishes its flyers. */
export type FlyerSource<F extends Flyer> = {
  /** The retailer as error messages name it ("Albert"). */
  name: string
  /** The current and upcoming flyers. Throws when none can be listed (the source is down). */
  listFlyers(get: typeof fetchWithTimeout, today: string): Promise<F[]>
  /** The pages of one flyer worth reading. */
  loadPages(get: typeof fetchWithTimeout, flyer: F): Promise<FlyerPage[]>
}

/** Every offer of the source's current flyers. Pages read before come from the cache; the others are
 *  sent to the model — as many as the run's time budget allows, leaving time to write the offers; the
 *  next run continues with the rest. A page whose extraction fails is left for the next run and does
 *  not stop the others; when no flyer can be listed at all the source is down. */
export async function fetchFlyerOffers<F extends Flyer>(
  source: FlyerSource<F>,
  select: (flyer: F) => boolean,
  deps: FlyerFetchDeps,
  options: FetchOptions = {},
): Promise<FlyerRawOffer[]> {
  const get = deps.fetch ?? fetchWithTimeout
  const today = deps.today ?? ingestionDate()
  const flyers = (await source.listFlyers(get, today)).filter((flyer) => select(flyer) && flyer.validUntil >= today)

  await deps.cache.prune(addDays(today, -CACHE_KEEP_DAYS))
  const cached = await deps.cache.load(flyers.map((flyer) => flyer.id))
  const extractionDeadline = options.deadline != null ? options.deadline - WRITE_RESERVE_MS : undefined
  const outOfTime = () => extractionDeadline != null && Date.now() >= extractionDeadline
  let started = 0
  const stop = () => outOfTime() || started >= (deps.maxNewPages ?? Infinity)

  const offers: FlyerRawOffer[] = []
  const failures: string[] = []
  for (const flyer of flyers) {
    const pages = await source.loadPages(get, flyer)
    const collect = (page: FlyerPage, pageOffers: ExtractedOffer[]) => {
      for (const offer of pageOffers) {
        offers.push({ offer, flyerId: flyer.id, pageNumber: page.number, pageText: page.text, validFrom: flyer.validFrom, validUntil: flyer.validUntil })
      }
    }
    const missing: FlyerPage[] = []
    for (const page of pages) {
      const hit = cached.get(`${flyer.id}|${page.number}`)
      if (hit) collect(page, readCachedOffers(hit.offers))
      else missing.push(page)
    }
    await runPool(missing, EXTRACTION_CONCURRENCY, stop, async (page) => {
      started++
      try {
        const extraction = await deps.extractor.extract(page)
        await deps.cache.save(flyer, page.number, extraction, deps.extractor.model)
        collect(page, extraction.offers)
      } catch (err) {
        failures.push(`${flyer.id}/${page.number}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
    if (outOfTime()) break
  }
  // Every page failed and nothing was cached: the model (or the images) are down — say so instead of
  // reporting an empty flyer.
  if (offers.length === 0 && failures.length > 0) throw new Error(`${source.name} flyer pages failed: ${failures.slice(0, 3).join('; ')}`)
  return offers
}

/** Cached offers are re-validated against the current schema: a row written by an older version
 *  that no longer fits is skipped, not trusted. */
function readCachedOffers(value: unknown): ExtractedOffer[] {
  const parsed = z.array(extractedOfferSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

// --- Normalizer + Validator (pure functions) ----------------------------------------------------

export type Pack = { unit: 'kg' | 'l' | 'ks'; quantity: number }

function toNumber(text: string): number {
  return Number(text.replace(/[\s ]/g, '').replace(',', '.'))
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
export function parseFlyerPackage(text: string): Pack | null {
  const match = /^\s*(?:(\d+)\s*[×x]\s*)?(\d+(?:[,.]\d+)?)\s*(g|kg|ml|l|ks)\s*$/i.exec(text)
  if (!match) return null
  const count = match[1] ? Number(match[1]) : 1
  const amount = toNumber(match[2])
  if (!Number.isFinite(amount) || amount <= 0 || count <= 0) return null
  const pack = unitPack(amount * count, match[3])
  return pack && pack.quantity > 0 ? pack : null
}

/** "1 l = 25,80 Kč", "100 g = 15,92 Kč", "1 ks = 19,97 Kč" (Albert) or "100 g 9,89 Kč" (Penny, no
 *  "=") → the price per kg, l or piece. Two prices for two sizes ("1 kg 177,67/188,12 Kč") are not
 *  one unit price → null. Pure. */
export function parseFlyerUnitPrice(text: string): { unit: 'kg' | 'l' | 'ks'; unitPrice: number } | null {
  const match = /^\s*(\d+(?:[,.]\d+)?)\s*(g|kg|ml|l|ks)\s*=?\s*(\d[\d\s ]*(?:,\d{1,2})?)\s*Kč\s*$/i.exec(text)
  if (!match) return null
  const pack = unitPack(toNumber(match[1]), match[2])
  const price = toNumber(match[3])
  if (!pack || !Number.isFinite(price) || price <= 0) return null
  return { unit: pack.unit, unitPrice: Math.round((price / pack.quantity) * 100) / 100 }
}

/** Lower case without diacritics, one character for one: positions in the result are positions in
 *  the input, so a match found in the plain text can be read in the printed one. */
function plainSameLength(text: string): string {
  let out = ''
  for (const char of text) {
    const plain = char.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    out += plain.length === char.length ? plain : char
  }
  return out
}

/** How far after the name its own unit price may be printed (its description and size come first). */
const NAME_BLOCK_CHARS = 160

/** The unit price printed with a product's name: Penny's text layer has each product as one block,
 *  "ŠKVARKOVÝ PAGÁČ* ze zmrazeného polotovaru | 65 g 100 g 10,62 Kč", so it is the first unit price
 *  after the name, within the block. The name is found case- and accent-insensitively, by its first
 *  words; null when the name is not on the page or has no unit price after it. Pure. */
export function unitPriceAfterName(pageText: string, name: string): { unit: 'kg' | 'l' | 'ks'; unitPrice: number } | null {
  const words = plainSameLength(name).split(/[^\p{L}\d%]+/u).filter(Boolean).slice(0, 2)
  if (words.length === 0) return null
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const at = new RegExp(`(?<![\\p{L}\\d])${escaped.join('[^\\p{L}\\d]+')}(?![\\p{L}\\d])`, 'u').exec(plainSameLength(pageText))
  if (!at) return null
  const block = pageText.slice(at.index + at[0].length, at.index + at[0].length + NAME_BLOCK_CHARS)
  return unitPricesOnPage(block)[0] ?? null
}

/** Every unit price printed on the page ("100 g 10,62 Kč", "1 l = 25,80 Kč"), per kg, l or piece. A
 *  pair of prices for two sizes ("1 kg 177,67/188,12 Kč") is not one unit price and is left out. Pure. */
export function unitPricesOnPage(pageText: string): { unit: 'kg' | 'l' | 'ks'; unitPrice: number }[] {
  const found: { unit: 'kg' | 'l' | 'ks'; unitPrice: number }[] = []
  for (const match of pageText.matchAll(/(?<![\d,.])(\d+(?:[,.]\d+)?)\s*(g|kg|ml|l|ks)\s*=?\s*(\d+(?:,\d{1,2})?)\s*Kč/gi)) {
    const parsed = parseFlyerUnitPrice(match[0])
    if (parsed) found.push(parsed)
  }
  return found
}

/** Is this price printed on the page? Albert prints the big price without a comma ("1990"), and the
 *  text layer sometimes splits it into "19" and "90"; small prices are "29,90" or "269,-". A price
 *  the model reports that is not on the page at all is a misreading or an invention. Pure. */
export function priceIsOnPage(price: number, pageText: string): boolean {
  if (!Number.isFinite(price) || price <= 0) return false
  const [koruny, halere] = price.toFixed(2).split('.')
  const text = pageText.replace(/ /g, ' ')
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
export function flyerProductKey(offer: Pick<ExtractedOffer, 'brand' | 'name' | 'packageSize' | 'selectedVariants'>, pack: Pack | null): string {
  const size = pack ? `${Math.round(pack.quantity * 1000) / 1000}${pack.unit}` : keyPart(offer.packageSize ?? '')
  return ['v1', keyPart(offer.brand ?? ''), keyPart(offer.name), size, offer.selectedVariants ? 'vybrane' : ''].join('|')
}

/** A name printed in capitals ("ŠKVARKOVÝ PAGÁČ", Penny's style) shown the way the rest of the catalog
 *  writes names ("Škvarkový pagáč"). Display only: the identity key ignores case anyway. A name with
 *  any lower-case letter is kept as printed. Pure. */
export function displayCase(text: string): string {
  const letters = text.replace(/[^\p{L}]/gu, '')
  if (letters.length < 2 || letters !== letters.toLocaleUpperCase('cs')) return text
  const lower = text.toLocaleLowerCase('cs')
  return lower.charAt(0).toLocaleUpperCase('cs') + lower.slice(1)
}

const IMPORTED_CATEGORIES = new Set<ItemCategory>(['Potraviny', 'Drogerie', 'Děti', 'Domácnost'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_PRICE = 100_000

export type FlyerValidation = { product: NormalizedProduct } | { rejected: string }

/** How strictly a source's offers are checked against their page. */
export type FlyerValidationOptions = {
  /** The retailer prints a unit price with every product (Penny): the offer's own unit price — its
   *  price ÷ its package — must then be one of the unit prices on the page. That ties the price to
   *  the product's size, which the name block carries; a discount alone confirms only that the offer
   *  and previous price belong together, not whose they are. */
  unitPriceOnPage?: boolean
}

/** Why a name the model read cannot be a product's name, or null. A name that joins words with
 *  " + " is a claim printed on the pack (what it is made with), not its name: on 2026-09-26 the
 *  "Mistrovská máslová makovka 70 g" was stored as "MÁSLO + JIHOČESKÉ FERMENTOVANÉ PODMÁSLÍ" and the
 *  shopping plan offered it for butter. A real name with " + " would be a bundle of two products,
 *  which one price cannot describe either. A "+" inside a brand ("Absorb+") is not a join. Pure. */
export function flyerNameProblem(name: string): string | null {
  return /\s\+\s/.test(name) ? `name joins two things: ${name.trim()}` : null
}

/** One offer read by the model → a validated product with its dated deal, or why it was rejected (CLAUDE.md
 *  section 33). The model only reads; this decides, and rejects rather than guesses:
 *  - a condition not every household meets (app price, multi-buy, "od" price, other) or a validity of
 *    its own that differs from the flyer's;
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
export function validateFlyerOffer(raw: FlyerRawOffer, today: string, options: FlyerValidationOptions = {}): FlyerValidation {
  const reject = (reason: string): FlyerValidation => ({ rejected: reason })
  const { offer } = raw
  const name = offer.name.trim()
  if (!name) return reject('no name')
  const nameProblem = flyerNameProblem(name)
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
  const pack = sizeText ? parseFlyerPackage(sizeText) : null
  if (sizeText && !pack) return reject(`package size not a single amount: ${sizeText}`)

  if (options.unitPriceOnPage) {
    if (!pack) return reject('no package size to check against the unit prices on the page')
    const printed = unitPriceAfterName(raw.pageText, name)
    if (!printed) return reject('no unit price printed after the name on the page')
    const own = offerPrice / pack.quantity
    if (printed.unit !== pack.unit || Math.abs(printed.unitPrice - own) > own * UNIT_PRICE_TOLERANCE) {
      return reject(`unit price ${Math.round(own * 100) / 100} Kč/${pack.unit} is not the ${printed.unitPrice} Kč/${printed.unit} printed with the name`)
    }
  }

  // Unit price check: printed per-unit price vs. offer price ÷ package.
  const printedUnit = offer.unitPriceText ? parseFlyerUnitPrice(offer.unitPriceText) : null
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

  const brand = displayCase((offer.brand ?? '').trim())
  // "*" marks a footnote on the page ("KEČUP PODRAVKA*"); it is not part of the name.
  const shownName = displayCase(name.replace(/\*/g, '').replace(/\s+/g, ' ').trim())
  const displayName = [brand && !shownName.toLowerCase().startsWith(brand.toLowerCase()) ? brand : '', shownName, sizeText].filter(Boolean).join(' ')
  return {
    product: {
      externalId: flyerProductKey(offer, pack),
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

/** validateFlyerOffer() without the reason — a connector's `normalize`. */
export function normalizeFlyerOffer(raw: FlyerRawOffer, today: string, options: FlyerValidationOptions = {}): NormalizedProduct | null {
  const result = validateFlyerOffer(raw, today, options)
  return 'product' in result ? result.product : null
}

/** The same product appears on several pages (the cover repeats inside) and in several flyers of
 *  one format (the weekly flyer and a themed catalogue). One deal per product and chain is kept
 *  (upsertActiveDeal keeps one running deal per product): of the offers that pass validation, the
 *  cheapest. Offers that fail validation are all kept, so the run counts them as skipped. Pure. */
export function dedupeFlyerOffers(raws: FlyerRawOffer[], today: string, options: FlyerValidationOptions = {}): FlyerRawOffer[] {
  const rejected: FlyerRawOffer[] = []
  const best = new Map<string, { raw: FlyerRawOffer; price: number }>()
  for (const raw of raws) {
    const product = normalizeFlyerOffer(raw, today, options)
    if (!product?.deal) {
      rejected.push(raw)
      continue
    }
    const current = best.get(product.externalId)
    if (!current || product.deal.dealPrice < current.price) best.set(product.externalId, { raw, price: product.deal.dealPrice })
  }
  return [...rejected, ...[...best.values()].map((entry) => entry.raw)]
}

/** A connector for the flyers of one chain: the flyers `select` picks, read through `deps`. A flyer
 *  holds at every store of its format, so the deals are chain-wide. */
export function createFlyerConnector<F extends Flyer>(
  sourceId: IngestionSource,
  chain: string,
  source: FlyerSource<F>,
  select: (flyer: F) => boolean,
  deps: FlyerFetchDeps,
  validation: FlyerValidationOptions = {},
): PriceConnector<FlyerRawOffer> {
  return {
    source: sourceId,
    chain,
    chainWideDeals: true,
    fetchProducts: async (limit, options) => {
      const raws = await fetchFlyerOffers(source, select, deps, options)
      return dedupeFlyerOffers(raws, deps.today ?? ingestionDate(), validation).slice(0, limit)
    },
    rawId: (raw) => `${raw.flyerId}/${raw.pageNumber} ${raw.offer.name}`,
    normalize: (raw, today) => normalizeFlyerOffer(raw, today, validation),
  }
}
