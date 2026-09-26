import type { fetchWithTimeout } from '@/lib/ingestion/http'
import {
  createDbFlyerPageCache,
  createFlyerConnector,
  createGeminiFlyerExtractor,
  USER_AGENT,
  type Flyer,
  type FlyerFetchDeps,
  type FlyerPage,
  type FlyerSource,
  type FlyerValidationOptions,
} from '@/lib/ingestion/flyer'

// --- Source (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) ---------
// Penny's weekly flyer: about 400 offers, against the ~40 of its web shop (lib/ingestion/penny.ts,
// which stays as it is). Researched 2026-09-26:
// - www.penny.cz/nabidky/letaky links the current flyer(s) as FlippingBook publications on
//   files.rewe.co.at/PennyIntLeaflet/CZ/<dd_mm_yyyy>_cz/. penny.cz's robots.txt has no Disallow
//   rules; files.rewe.co.at has no robots.txt; nothing needs a login, and no challenge was seen.
// - Each page is its own HTML page (<flyer>/<n>/, page 1 is the flyer's index) whose
//   `#text-container` holds the page's text layer, and its image is
//   files/assets/common/page-html5-substrates/page<nnnn>_4.jpg (1159 × 2050 px).
// - As at Albert, the text layer lists names and prices in separate runs, so the pairing is visible
//   only on the image: the owner's explicit decision of 2026-09-26 is that the same model reads each
//   page once (CLAUDE.md section 30's exceptions), with the shared validator (lib/ingestion/flyer.ts).
// Validity is printed on the pages ("Nabídka platná od středy 23. 9. do úterý 29. 9. 2026"). Some pages
// also carry offers with a validity of their own (weekend offers "25. 9. – 27. 9."); which offer holds
// which days is visible only on the image, so such a page is not read at all rather than dated wrongly.

const LISTING_URL = 'https://www.penny.cz/nabidky/letaky'
const FLYER_URL = /^https:\/\/files\.rewe\.co\.at\/PennyIntLeaflet\/CZ\/([\w-]+)\/$/
/** Penny has one store format; flyer_pages needs a name for it. */
const LOCATION_TYPE = 'STANDARD'
/** Pages fetched at the same time (small HTML pages; the images are fetched only for the model). */
const PAGE_FETCH_CONCURRENCY = 4

export type PennyFlyer = Flyer & {
  baseUrl: string
  /** The pages worth reading, with their text layers (fetched once, while listing). */
  pages: FlyerPage[]
  /** Pages left out, and why — shown by scripts/penny-flyers.ts. */
  skippedPages: { number: number; reason: string }[]
}

/** The flyer folders the listing page links to, each once. Pure/testable. */
export function parsePennyFlyerLinks(html: string): string[] {
  const urls = new Set<string>()
  for (const match of html.matchAll(/https:\/\/files\.rewe\.co\.at\/PennyIntLeaflet\/CZ\/[\w-]+\//g)) {
    if (FLYER_URL.test(match[0])) urls.add(match[0])
  }
  return [...urls]
}

/** The number of pages in a flyer, from its index page's links to "./<n>/" (page 1 is the index
 *  itself). Pure/testable. */
export function parsePennyPageCount(indexHtml: string): number {
  let last = 1
  for (const match of indexHtml.matchAll(/href="\.\/(\d+)\/"/g)) last = Math.max(last, Number(match[1]))
  return last
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** A page's text layer: the first paragraph of `#text-container`, without the page number it starts
 *  with (a stray number would let priceIsOnPage find a price that is not printed). Pure/testable. */
export function parsePennyPageText(html: string, pageNumber: number): string {
  const match = /<div id="text-container"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/.exec(html)
  if (!match) return ''
  const text = decodeEntities(match[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
  return text.startsWith(`${pageNumber} `) ? text.slice(String(pageNumber).length + 1) : text
}

export type Window = { validFrom: string; validUntil: string }

const pad = (value: number) => String(value).padStart(2, '0')

/** The flyer's validity from its pages: "platná od středy 23. 9. do úterý 29. 9. 2026" → 2026-09-23 …
 *  2026-09-29. The window most pages print wins; none printed → null (the flyer cannot be dated, so
 *  it is not read). A window across New Year takes the start from the year before. Pure/testable. */
export function parsePennyValidity(pageTexts: string[]): Window | null {
  const counts = new Map<string, number>()
  for (const text of pageTexts) {
    const seen = new Set<string>()
    for (const match of text.matchAll(/platn\S*\s+od\s+\S+\s+(\d{1,2})\.\s*(\d{1,2})\.\s+do\s+\S+\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/gi)) {
      const [, fromDay, fromMonth, untilDay, untilMonth, year] = match.map(Number)
      const fromYear = fromMonth > untilMonth ? year - 1 : year
      const key = `${fromYear}-${pad(fromMonth)}-${pad(fromDay)}|${year}-${pad(untilMonth)}-${pad(untilDay)}`
      if (!seen.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
      seen.add(key)
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  if (!best) return null
  const [validFrom, validUntil] = best[0].split('|')
  return { validFrom, validUntil }
}

/** Why a page cannot be dated with the flyer's window, or null. Every date printed on a page must be
 *  the flyer's first or last day: any other ("25. 9. – 27. 9. 2026", "od pátku 25. 9.") means some of
 *  its offers hold on other days, and which ones is visible only on the image. Pure/testable. */
export function pennyPageDateProblem(text: string, window: Window): string | null {
  const allowed = new Set([window.validFrom, window.validUntil].map((iso) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`))
  for (const match of text.matchAll(/(?<![\d,.])(\d{1,2})\.\s?(\d{1,2})\.(?!\d)/g)) {
    const date = `${Number(match[1])}.${Number(match[2])}`
    if (!allowed.has(date)) return `another date on the page: ${match[0].trim()}`
  }
  return null
}

async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** One flyer, fetched whole: its pages' text layers, its validity, and which pages can be read. */
async function loadPennyFlyer(get: typeof fetchWithTimeout, baseUrl: string): Promise<PennyFlyer> {
  const id = FLYER_URL.exec(baseUrl)![1]
  const html = async (url: string) => {
    const response = await get(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) throw new Error(`Penny flyer ${id} page failed: HTTP ${response.status} (${url})`)
    return response.text()
  }
  const index = await html(baseUrl)
  const numbers = Array.from({ length: parsePennyPageCount(index) }, (_, i) => i + 1)
  const texts = await mapPool(numbers, PAGE_FETCH_CONCURRENCY, async (number) =>
    parsePennyPageText(number === 1 ? index : await html(`${baseUrl}${number}/`), number),
  )
  const window = parsePennyValidity(texts)
  if (!window) throw new Error(`Penny flyer ${id}: no validity printed on any page`)

  const pages: FlyerPage[] = []
  const skippedPages: PennyFlyer['skippedPages'] = []
  numbers.forEach((number, i) => {
    const problem = pennyPageDateProblem(texts[i], window)
    if (problem) skippedPages.push({ number, reason: problem })
    else pages.push({ number, text: texts[i], imageUrl: `${baseUrl}files/assets/common/page-html5-substrates/page${String(number).padStart(4, '0')}_4.jpg` })
  })
  return { id, locationType: LOCATION_TYPE, ...window, baseUrl, pages, skippedPages }
}

/** How Penny publishes its flyers: the listing page, then each flyer's own pages. */
export const pennyFlyerSource: FlyerSource<PennyFlyer> = {
  name: 'Penny',
  async listFlyers(get) {
    const listing = await get(LISTING_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!listing.ok) throw new Error(`Penny flyer listing failed: HTTP ${listing.status}`)
    const links = parsePennyFlyerLinks(await listing.text())
    if (links.length === 0) throw new Error('Penny flyer listing has no flyers (the page layout may have changed)')
    const flyers: PennyFlyer[] = []
    for (const link of links) flyers.push(await loadPennyFlyer(get, link))
    return flyers
  },
  loadPages: async (_get, flyer) => flyer.pages,
}

/** Penny prints a unit price with every product, so every offer's own unit price must be on its page
 *  (FlyerValidationOptions). On the first trial pages a discount alone had confirmed "Boni Polooštěpek
 *  190 g" at 9,90 Kč — 52 Kč/kg, where the page prints 21 Kč per 100 g for it. */
export const PENNY_VALIDATION: FlyerValidationOptions = { unitPriceOnPage: true }

/** Gemini 2.5 Flash without thinking, not Flash-Lite as at Albert: Penny's pages are dense (~25 offers
 *  each) and Flash-Lite paired most prices with the wrong product — on the same three trial pages
 *  (2026-09-26) 3 of 78 offers passed the validator, against 45 of 73 with this model; Mistral Large 3
 *  (32), Mistral Small (24), GPT-4.1 mini (15), Qwen3.7 Flash (14) and Llama 4 (0) did worse. About
 *  $0.03 per three pages, ~$0.30 per weekly flyer, inside the gateway's monthly free credit. Thinking
 *  is off: it cost four times the output tokens and accepted fewer offers (31). */
export const PENNY_FLYER_MODEL = 'google/gemini-2.5-flash'

export const pennyFlyerExtractor = createGeminiFlyerExtractor('PENNY discount store', {
  model: PENNY_FLYER_MODEL,
  providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
})
export const pennyFlyerCache = createDbFlyerPageCache('penny_flyer')

/** Penny's flyer offers, as deals of the "Penny" chain. Its own source (`penny_flyer`), apart from
 *  the web shop's SKUs (`penny`): a flyer offer has no SKU, only its printed name and size. */
export function createPennyFlyerConnector(deps: FlyerFetchDeps) {
  return createFlyerConnector('penny_flyer', 'Penny', pennyFlyerSource, () => true, deps, PENNY_VALIDATION)
}

export const pennyFlyerConnector = createPennyFlyerConnector({ extractor: pennyFlyerExtractor, cache: pennyFlyerCache })
