import {
  createDbFlyerPageCache,
  createFlyerConnector,
  createGeminiFlyerExtractor,
  dedupeFlyerOffers,
  fetchFlyerOffers,
  flyerNameProblem,
  flyerProductKey,
  FLYER_MODEL,
  normalizeFlyerOffer,
  parseFlyerPackage,
  parseFlyerUnitPrice,
  USER_AGENT,
  validateFlyerOffer,
  type FlyerFetchDeps,
  type FlyerPage,
  type FlyerRawOffer,
  type FlyerSource,
  type FlyerValidation,
} from '@/lib/ingestion/flyer'
import type { FetchOptions, IngestResult, PriceConnector } from '@/lib/ingestion/types'

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

// The model step, the page cache and the validator are shared with the other flyer sources
// (lib/ingestion/flyer.ts); this file only knows how Albert lists its flyers and their pages.

const LISTING_URL = 'https://www.albert.cz/aktualni-letaky'
/** Page image width sent to the model: small print (unit prices, "vybrané druhy") must stay legible. */
const PAGE_IMAGE_SIZE = 'at1600'

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


/** How Albert publishes its flyers: the listing page, then each flyer's `spreads.json`. */
export const albertFlyerSource: FlyerSource<AlbertLeaflet> = {
  name: 'Albert',
  async listFlyers(get) {
    const listing = await get(LISTING_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!listing.ok) throw new Error(`Albert flyer listing failed: HTTP ${listing.status}`)
    const all = parseAlbertLeaflets(await listing.text())
    if (all.length === 0) throw new Error('Albert flyer listing has no flyers (the page layout may have changed)')
    return all
  },
  async loadPages(get, leaflet) {
    const response = await get(new URL('spreads.json', leaflet.viewUrl).toString(), { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
    if (!response.ok) throw new Error(`Albert flyer ${leaflet.id} pages failed: HTTP ${response.status}`)
    return parseAlbertSpreads(leaflet.viewUrl, (await response.json()) as Spread[])
  },
}

// The names below predate lib/ingestion/flyer.ts and are kept for the Albert script and tests.
export const ALBERT_FLYER_MODEL = FLYER_MODEL
export const geminiFlyerExtractor = createGeminiFlyerExtractor('Albert supermarket')
export const dbFlyerPageCache = createDbFlyerPageCache('albert')
export type AlbertRawOffer = FlyerRawOffer
export type AlbertFetchDeps = FlyerFetchDeps
export type AlbertValidation = FlyerValidation
export type { ExtractedOffer, FlyerPage, FlyerPageCache, FlyerPageExtractor, PageExtraction } from '@/lib/ingestion/flyer'
export {
  flyerNameProblem as albertNameProblem,
  flyerProductKey as albertProductKey,
  parseFlyerPackage as parseAlbertPackage,
  parseFlyerUnitPrice as parseAlbertUnitPrice,
  validateFlyerOffer as validateAlbertOffer,
  normalizeFlyerOffer as normalizeAlbertOffer,
  dedupeFlyerOffers as dedupeAlbertOffers,
}
export { priceIsOnPage } from '@/lib/ingestion/flyer'

/** Every offer of the current flyers for one store format (see fetchFlyerOffers). */
export function fetchAlbertOffers(locationType: AlbertLocationType, deps: AlbertFetchDeps, options: FetchOptions = {}): Promise<AlbertRawOffer[]> {
  return fetchFlyerOffers(albertFlyerSource, (leaflet) => leaflet.locationType === locationType, deps, options)
}

/** The connector for one of Albert's two store formats: the supermarket flyer's offers belong to the
 *  "Albert" chain, the hypermarket flyer's to "Albert Hypermarket" (migration 0029), so prices that
 *  differ between the formats are never mixed. Both share the `albert` source, so one product is one
 *  product in both. A flyer holds at every store of its format, so the deals are chain-wide. */
export function createAlbertConnector(chain: string, locationType: AlbertLocationType, deps: AlbertFetchDeps): PriceConnector<AlbertRawOffer> {
  return createFlyerConnector('albert', chain, albertFlyerSource, (leaflet) => leaflet.locationType === locationType, deps)
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
