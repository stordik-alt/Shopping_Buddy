import { gunzipSync } from 'node:zlib'
import { distanceKm } from '@/lib/geo'
import { fetchWithTimeout } from '@/lib/ingestion/http'
import { ADOPT_RADIUS_KM } from '@/lib/stores/sync'

// Albert runs two store formats with different weekly flyers and prices (lib/ingestion/albert.ts):
// the supermarket flyer's deals belong to the "Albert" chain, the hypermarket flyer's to "Albert
// Hypermarket". OpenStreetMap does not tell the formats apart, so every Albert branch is imported as
// "Albert"; this moves the hypermarkets to their own chain, so a household choosing its branch sees
// the flyer that really holds there.
//
// Which branches are hypermarkets comes from Albert itself: its store sitemap (listed in
// albert.cz/robots.txt) has one page per store, named "hypermarket-…" or "supermarket-…", and each
// store page server-renders `storeTypeName`, the GPS point and the address (checked 2026-09-25: 90
// hypermarkets, 262 supermarkets). A branch is matched to a hypermarket by GPS within
// ADOPT_RADIUS_KM (the same radius the OSM import uses to recognise a shop), or — a branch created
// from a receipt has no GPS — by street address and town. Nothing is created or deleted, and a
// branch is never moved back: an unmatched hypermarket is only reported.

const SITEMAP_URL = 'https://www.albert.cz/sitemap/albertcz_sitemap_stores-0.xml.gz'
const USER_AGENT = 'ShoppingBuddy-connector/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'
const REQUEST_PAUSE_MS = 250

export const ALBERT_CHAIN = 'Albert'
export const ALBERT_HYPERMARKET_CHAIN = 'Albert Hypermarket'

export type AlbertHypermarket = { url: string; lat: number; lng: number; street: string; town: string }

/** The hypermarket pages in the store sitemap. Pure/testable. */
export function parseAlbertHypermarketUrls(xml: string): string[] {
  return [...new Set([...xml.matchAll(/<loc>\s*(https:\/\/www\.albert\.cz\/nase-prodejny\/hypermarket-[^<\s]+)\s*<\/loc>/g)].map((match) => match[1]))]
}

/** A store page's format, GPS point and address; null when the page is not a hypermarket or any of
 *  these is missing (never guessed). Pure/testable. */
export function parseAlbertStorePage(url: string, html: string): AlbertHypermarket | null {
  // The store's own details follow its type; other addresses on the page (none today) come elsewhere.
  const start = html.indexOf('"storeTypeName":')
  if (start === -1) return null
  const details = html.slice(start, start + 3000)
  if (/^"storeTypeName":"([^"]*)"/.exec(details)?.[1] !== 'Hypermarket') return null
  const geo = /"geoPoint":\{[^}]*"latitude":(-?[\d.]+),"longitude":(-?[\d.]+)/.exec(details)
  const street = /"line1":"([^"]+)"/.exec(details)?.[1]
  const town = /"town":"([^"]+)"/.exec(details)?.[1]
  if (!geo || !street || !town) return null
  const lat = Number(geo[1])
  const lng = Number(geo[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { url, lat, lng, street, town }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Every Albert hypermarket with its GPS point and address: the sitemap, then each hypermarket's
 *  page, sequentially with a pause. A page that cannot be read is skipped (and counted); a sitemap
 *  without any hypermarket means the source changed, and throws. */
export async function fetchAlbertHypermarkets(
  options: { fetch?: typeof fetchWithTimeout; pauseMs?: number } = {},
): Promise<{ hypermarkets: AlbertHypermarket[]; unreadable: number }> {
  const get = options.fetch ?? fetchWithTimeout
  const response = await get(SITEMAP_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`Albert store sitemap failed: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  // The file is gzip; a server or proxy may already have decompressed it.
  const xml = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8')
  const urls = parseAlbertHypermarketUrls(xml)
  if (urls.length === 0) throw new Error('Albert store sitemap lists no hypermarkets (its layout may have changed)')

  const hypermarkets: AlbertHypermarket[] = []
  let unreadable = 0
  for (const url of urls) {
    const page = await get(url, { headers: { 'User-Agent': USER_AGENT } })
    const store = page.ok ? parseAlbertStorePage(url, await page.text()) : null
    if (store) hypermarkets.push(store)
    else unreadable++
    await sleep(options.pauseMs ?? REQUEST_PAUSE_MS)
  }
  return { hypermarkets, unreadable }
}

export type AlbertBranch = { id: string; chain: string; address: string; city: string; lat: number | null; lng: number | null }

export type AlbertFormatPlan = {
  /** Branches of "Albert" that are hypermarkets: to be moved to "Albert Hypermarket". */
  move: string[]
  /** Hypermarkets already in "Albert Hypermarket". */
  alreadyMoved: number
  /** "Albert" branches that are hypermarkets but stand where "Albert Hypermarket" already has a branch
   *  (the same shop imported twice): not moved, since the database allows one branch of a chain per
   *  address; the import keeps new copies from arising (lib/stores/sync.ts). */
  blocked: string[]
  /** Hypermarkets no branch in the app matches (not created: the store import adds branches). */
  unmatched: AlbertHypermarket[]
}

const normalize = (value: string) => value.normalize('NFC').trim().toLocaleLowerCase('cs-CZ').replace(/\s+/g, ' ')

/** Does a branch without GPS stand at the hypermarket's address? Its address must begin with the
 *  hypermarket's street and number, and its town be the same. */
function sameAddress(branch: AlbertBranch, store: AlbertHypermarket): boolean {
  return normalize(branch.address).startsWith(normalize(store.street)) && normalize(branch.city).includes(normalize(store.town))
}

/** Which Albert branches are hypermarkets. Each hypermarket takes its nearest branch (GPS within
 *  ADOPT_RADIUS_KM, or the same address when the branch has no GPS); each branch goes to at most one
 *  hypermarket. Pure/testable. */
export function planAlbertFormats(hypermarkets: AlbertHypermarket[], branches: AlbertBranch[]): AlbertFormatPlan {
  const candidates = branches.filter((branch) => branch.chain === ALBERT_CHAIN || branch.chain === ALBERT_HYPERMARKET_CHAIN)
  const pairs: { store: AlbertHypermarket; branch: AlbertBranch; km: number }[] = []
  for (const store of hypermarkets) {
    for (const branch of candidates) {
      if (branch.lat != null && branch.lng != null) {
        const km = distanceKm({ lat: branch.lat, lng: branch.lng }, { lat: store.lat, lng: store.lng })
        if (km <= ADOPT_RADIUS_KM) pairs.push({ store, branch, km })
      } else if (sameAddress(branch, store)) {
        pairs.push({ store, branch, km: ADOPT_RADIUS_KM })
      }
    }
  }
  // Closest pairs first, so a branch between two stores goes to the nearer one whatever the order.
  pairs.sort((a, b) => a.km - b.km)
  const matchedStores = new Set<string>()
  const matchedBranches = new Set<string>()
  const plan: AlbertFormatPlan = { move: [], alreadyMoved: 0, blocked: [], unmatched: [] }
  // Addresses the hypermarket chain holds, as store_locations_store_address_city_unique_idx sees them.
  const addressKey = (branch: AlbertBranch) => `${normalize(branch.address)}\u0000${normalize(branch.city)}`
  const hypermarketAddresses = new Set(candidates.filter((branch) => branch.chain === ALBERT_HYPERMARKET_CHAIN).map(addressKey))
  for (const { store, branch } of pairs) {
    if (matchedStores.has(store.url) || matchedBranches.has(branch.id)) continue
    matchedStores.add(store.url)
    matchedBranches.add(branch.id)
    if (branch.chain === ALBERT_HYPERMARKET_CHAIN) plan.alreadyMoved++
    else if (hypermarketAddresses.has(addressKey(branch))) plan.blocked.push(branch.id)
    else {
      plan.move.push(branch.id)
      hypermarketAddresses.add(addressKey(branch))
    }
  }
  plan.unmatched = hypermarkets.filter((store) => !matchedStores.has(store.url))
  return plan
}
