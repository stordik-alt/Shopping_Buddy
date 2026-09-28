import {
  createDbFlyerPageCache,
  createFlyerConnector,
  createGeminiFlyerExtractor,
  parsePublitasSpreads,
  USER_AGENT,
  type Flyer,
  type FlyerFetchDeps,
  type FlyerSource,
  type PublitasSpread,
} from '@/lib/ingestion/flyer'

// --- Source (docs/02_ARCHITECTURE.md / CLAUDE.md section 32: External Source -> Fetcher) ---------
// Billa's weekly flyer and its long-running themed catalogues (researched 2026-09-28, following the
// owner's decision to extend the flyer-OCR approach to Billa after the Lidl connector turned out
// unable to state grocery promotion validity at all — see lib/ingestion/lidl.ts):
// - www.billa.cz/akcni-letaky (no robots.txt Disallow rules) lists the current flyers as plain,
//   server-rendered `<a href="/akcni-letaky/<slug>">` tiles, each with the flyer's title
//   (`data-teaser-name`) and its validity ("Platí od středa 15. 7. do úterý 29. 9. 2026") in the
//   surrounding markup — no JavaScript needed to read it.
// - Each of those pages is itself server-rendered and embeds the flyer's Publitas viewer URL
//   (`https://view.publitas.com/billa-cz/<publication-slug>/page/1`) directly in its markup —
//   the exact same platform (and `spreads.json` shape) as Albert's, just the shared multi-tenant
//   `view.publitas.com` instead of a retailer-specific one. No login, no CAPTCHA seen anywhere.
// "Speciál: <town>" flyers (found alongside the others) are single-store openings, not the chain's
// own pricing, and are excluded (`isNationalFlyer` below).

const LISTING_URL = 'https://www.billa.cz/akcni-letaky'
const PAGE_IMAGE_SIZE = 'at1600'
/** Billa has one store format; flyer_pages needs a name for it. */
const LOCATION_TYPE = 'STANDARD'

export type BillaFlyer = Flyer & { title: string; publicationUrl: string }

const pad = (value: number) => String(value).padStart(2, '0')

/** "od středa 15. 7. do úterý 29. 9. 2026" → 2026-07-15 … 2026-09-29 (a year straddling New Year's
 *  takes the start month's year from the one before, same as Penny's). `null` when nothing matches —
 *  a validity is never guessed. Pure/testable. */
export function parseBillaValidity(text: string): { validFrom: string; validUntil: string } | null {
  const match = /od\s+\S+\s+(\d{1,2})\.\s*(\d{1,2})\.\s+do\s+\S+\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i.exec(text)
  if (!match) return null
  const [, fromDay, fromMonth, untilDay, untilMonth, year] = match.map(Number)
  const fromYear = fromMonth > untilMonth ? year - 1 : year
  return { validFrom: `${fromYear}-${pad(fromMonth)}-${pad(fromDay)}`, validUntil: `${year}-${pad(untilMonth)}-${pad(untilDay)}` }
}

/** A "Speciál: <town>" flyer is one store's opening/anniversary promotion, not the chain's own
 *  pricing (found alongside the national flyers on the listing page, 2026-09-28) — excluded so a
 *  Bílovec-only price is never recorded as Billa's. Pure. */
export function isNationalFlyer(title: string): boolean {
  return !/^speciál:/i.test(title.trim())
}

/** One listing tile: its slug, title and validity, straight from the server-rendered markup — no
 *  JavaScript needed. Pure/testable. A tile whose title or validity cannot be read is left out
 *  rather than guessed (dropped silently is fine here: `billaFlyerSource.listFlyers()` already
 *  throws if the whole listing yields nothing). */
export function parseBillaListing(html: string): { slug: string; title: string; validFrom: string; validUntil: string }[] {
  const flyers: { slug: string; title: string; validFrom: string; validUntil: string }[] = []
  for (const match of html.matchAll(/href="\/akcni-letaky\/([a-z0-9-]+)"[^>]*data-teaser-name="([^"]*)"/g)) {
    const [, slug, title] = match
    // The validity text sits later in the same tile's markup, well within the small block a card
    // template renders — bounded so a malformed page can't run this window into the next tile.
    const tileStart = match.index + match[0].length
    const block = html.slice(tileStart, tileStart + 4000)
    const validityMatch = /Plat[ií]\s+od[^<]*\d{4}/i.exec(block)
    if (!validityMatch) continue
    const validity = parseBillaValidity(validityMatch[0].replace(/&nbsp;|&amp;nbsp;/g, ' '))
    if (!validity) continue
    flyers.push({ slug, title, ...validity })
  }
  return flyers
}

/** The Publitas publication's base URL (`view.publitas.com/billa-cz/<slug>/`, where `spreads.json`
 *  itself lives), from the `.../page/1` view URL embedded in one flyer's own page — the listing page
 *  itself does not carry it. Found inside the page's hydration payload, whose `/` is written as
 *  `/` there. Pure/testable. */
export function parseBillaPublitasUrl(html: string): string | null {
  // Matched by what follows ("/page/"), not just the domain: the page also links a PDF download
  // under a different (also view.publitas.com) URL, which is not the flipbook viewer.
  const match = /https:\/\/view\.publitas\.com\/([a-z0-9-]+\/[a-z0-9-]+)\/page\//i.exec(html.replace(/\\u002F/gi, '/'))
  return match ? `https://view.publitas.com/${match[1]}/` : null
}

/** How Billa publishes its flyers: the listing page for the current tiles, then each tile's own page
 *  for its Publitas viewer URL, then that viewer's `spreads.json`. */
export const billaFlyerSource: FlyerSource<BillaFlyer> = {
  name: 'Billa',
  async listFlyers(get) {
    const listing = await get(LISTING_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!listing.ok) throw new Error(`Billa flyer listing failed: HTTP ${listing.status}`)
    const tiles = parseBillaListing(await listing.text()).filter((tile) => isNationalFlyer(tile.title))
    if (tiles.length === 0) throw new Error('Billa flyer listing has no flyers (the page layout may have changed)')
    const flyers: BillaFlyer[] = []
    for (const tile of tiles) {
      const tilePage = await get(`${LISTING_URL}/${tile.slug}`, { headers: { 'User-Agent': USER_AGENT } })
      if (!tilePage.ok) continue // one flyer's own page failing does not stop the others
      const publicationUrl = parseBillaPublitasUrl(await tilePage.text())
      if (!publicationUrl) continue
      flyers.push({ id: tile.slug, locationType: LOCATION_TYPE, validFrom: tile.validFrom, validUntil: tile.validUntil, title: tile.title, publicationUrl })
    }
    return flyers
  },
  async loadPages(get, flyer) {
    const response = await get(new URL('spreads.json', flyer.publicationUrl).toString(), { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } })
    if (!response.ok) throw new Error(`Billa flyer ${flyer.id} pages failed: HTTP ${response.status}`)
    return parsePublitasSpreads(flyer.publicationUrl, (await response.json()) as PublitasSpread[], PAGE_IMAGE_SIZE)
  },
}

// Flash-Lite (the default, same as Albert) rather than Penny's stronger/costlier Flash: Billa's cards
// are spread out with a photo each, closer to Albert's layout than Penny's dense list — but this is a
// judgement call, not a measured trial like Penny's (docs/01_CURRENT_STATE.md); worth re-checking
// against real accept/reject counts once this connector has run for real.
export const billaFlyerExtractor = createGeminiFlyerExtractor('Billa')
export const billaFlyerCache = createDbFlyerPageCache('billa_flyer')

/** Billa's flyer offers, as deals of the "Billa" chain — its own source (`billa_flyer`), apart from
 *  the web shop's SKUs (`billa`, lib/ingestion/billa.ts): a flyer offer has no SKU, only its printed
 *  name and size. A flyer holds at every Billa store, so the deals are chain-wide. */
export function createBillaFlyerConnector(deps: FlyerFetchDeps) {
  return createFlyerConnector('billa_flyer', 'Billa', billaFlyerSource, () => true, deps)
}

export const billaFlyerConnector = createBillaFlyerConnector({ extractor: billaFlyerExtractor, cache: billaFlyerCache })
