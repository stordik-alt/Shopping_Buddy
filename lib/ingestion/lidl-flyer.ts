import {
  createDbFlyerPageCache,
  createFlyerConnector,
  createGeminiFlyerExtractor,
  USER_AGENT,
  type Flyer,
  type FlyerFetchDeps,
  type FlyerPage,
  type FlyerSource,
} from '@/lib/ingestion/flyer'

// --- Source (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) ---------
// Lidl's weekly flyers (researched 2026-09-28, following the owner's decision to add flyer-OCR after
// lib/ingestion/lidl.ts's own official JSON connector turned out unable to state a grocery
// promotion's validity window at all — its `/p/api/gridboxes/` response gives no date for any of a
// live sample of 34 in-store grocery discounts):
// - www.lidl.cz's flyer pages (e.g. "/l/cs/letak/<slug>/view/flyer/page/1") are a small JS viewer
//   (`lidl.leaflets.schwarz`, the Schwarz Group's own shared flyer platform — the same one Kaufland
//   uses) that calls a public JSON endpoint: `endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=<slug>`.
//   Found by capturing the viewer's own network request (no documented API; lidl.cz's robots.txt has
//   no Disallow on `/l/`, and this JSON endpoint is a different, unauthenticated host entirely — no
//   login, no CAPTCHA seen).
// - That response lists every page with a full-size image and a `keyWords` bag of the words printed
//   on it (not reading-order running text, unlike Albert's/Penny's/Billa's text layers, but enough
//   for the shared validator's presence checks — see lib/ingestion/flyer.ts's `priceIsOnPage()`,
//   which only needs a price to appear anywhere in the text, not at a specific position).
// - The flyer's own `offerStartDate`/`offerEndDate` are used as its validity. Not `startDate`/`endDate`,
//   which start noticeably earlier (early access before the flyer is the current one) and would
//   overstate how long a price actually runs. Cross-checked against 4 concurrent flyers 2026-09-28:
//   consistently a clean Mon–Sun week even when the flyer's own *title* names a shorter sub-window
//   (e.g. "od úterý 29.9-30.9" for a flyer whose offerStartDate/offerEndDate covers the full week) —
//   read as one highlighted item's own day, not the whole flyer's, the same kind of per-offer
//   exception the shared extraction prompt already asks the model to flag via `ownValidity` (rejected
//   by validateFlyerOffer), so a genuinely shorter-lived individual offer is still caught there.
// The current-flyers listing (`/c/akcni-letak/s10008644`) is plain server-rendered `<a href>`s to
// each flyer's slug — no JavaScript needed to read it either.

const LISTING_URL = 'https://www.lidl.cz/c/akcni-letak/s10008644'
const API_URL = 'https://endpoints.leaflets.schwarz/v4/flyer'
/** Lidl has one store format; flyer_pages needs a name for it. */
const LOCATION_TYPE = 'STANDARD'

/** The flyer's pages are fetched once, with its own metadata, by `listFlyers()` below — carried on
 *  the flyer itself (same pattern as PennyFlyer) so `loadPages()` is a lookup, not a second fetch. */
export type LidlFlyer = Flyer & { pages: FlyerPage[] }

/** The flyer slugs linked from the current-flyers listing page ("/l/cs/letak/<slug>/..."), each
 *  once. Pure/testable. */
export function parseLidlFlyerSlugs(html: string): string[] {
  const slugs = new Set<string>()
  for (const match of html.matchAll(/\/l\/cs\/letak\/([a-z0-9-]+)\//g)) slugs.add(match[1])
  return [...slugs]
}

type LidlFlyerApiResponse = {
  success?: boolean
  flyer?: {
    id?: string
    offerStartDate?: string
    offerEndDate?: string
    // Each page's largest rendition is its own field (not a dict of named sizes, unlike Publitas) —
    // small print (unit prices) needs `zoom`, the endpoint's biggest.
    pages?: { number?: number; keyWords?: string; zoom?: string; image?: string }[]
  }
}

/** One flyer's metadata and pages from the leaflets.schwarz API response. `null` when the response
 *  isn't usable (not found, or missing what a deal needs) rather than guessing. Pure/testable. */
export function parseLidlFlyerResponse(data: LidlFlyerApiResponse): LidlFlyer | null {
  const flyer = data.flyer
  if (!data.success || !flyer?.id || !flyer.offerStartDate || !flyer.offerEndDate) return null
  if (flyer.offerEndDate < flyer.offerStartDate) return null
  const pages: FlyerPage[] = []
  for (const page of flyer.pages ?? []) {
    const image = page.zoom ?? page.image
    if (typeof page.number !== 'number' || page.number < 1 || !image) continue
    pages.push({ number: page.number, text: page.keyWords ?? '', imageUrl: image })
  }
  return { id: flyer.id, locationType: LOCATION_TYPE, validFrom: flyer.offerStartDate, validUntil: flyer.offerEndDate, pages }
}

/** How Lidl publishes its flyers: the listing page for the current slugs, then each slug's own API
 *  response (its metadata and pages together). */
export const lidlFlyerSource: FlyerSource<LidlFlyer> = {
  name: 'Lidl',
  async listFlyers(get) {
    const listing = await get(LISTING_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!listing.ok) throw new Error(`Lidl flyer listing failed: HTTP ${listing.status}`)
    const slugs = parseLidlFlyerSlugs(await listing.text())
    if (slugs.length === 0) throw new Error('Lidl flyer listing has no flyers (the page layout may have changed)')
    const flyers: LidlFlyer[] = []
    for (const slug of slugs) {
      const response = await get(`${API_URL}?flyer_identifier=${slug}`, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
      if (!response.ok) continue // one flyer failing does not stop the others
      const parsed = parseLidlFlyerResponse((await response.json()) as LidlFlyerApiResponse)
      if (parsed) flyers.push(parsed)
    }
    return flyers
  },
  loadPages: async (_get, flyer) => flyer.pages,
}

export const lidlFlyerExtractor = createGeminiFlyerExtractor('Lidl')
export const lidlFlyerCache = createDbFlyerPageCache('lidl_flyer')

/** Lidl's flyer offers, as deals of the "Lidl" chain — its own source (`lidl_flyer`), apart from the
 *  official web connector's SKUs (`lidl`, lib/ingestion/lidl.ts): a flyer offer has no SKU, only its
 *  printed name and size. A flyer holds at every Lidl store, so the deals are chain-wide. Uses
 *  `zoom`-size images, since Lidl's own printed prices/unit prices are small even at that size. */
export function createLidlFlyerConnector(deps: FlyerFetchDeps) {
  return createFlyerConnector('lidl_flyer', 'Lidl', lidlFlyerSource, () => true, deps)
}

export const lidlFlyerConnector = createLidlFlyerConnector({ extractor: lidlFlyerExtractor, cache: lidlFlyerCache })
