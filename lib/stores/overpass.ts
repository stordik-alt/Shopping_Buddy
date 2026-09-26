import { OSM_BRAND_TO_CHAIN, type OverpassElement } from '@/lib/stores/osm'

// Fetcher for the store import (docs/02_ARCHITECTURE.md: External Source -> Fetcher). Overpass is
// OpenStreetMap's public read-only query service; its usage policy asks for occasional queries with
// an identifying User-Agent, which a weekly import is. The public instances are often busy — the
// owner's first imports failed on every instance (2026-09-25) — so the import is built to get
// through a bad day instead of failing whole:
// - one light query per chain instead of one country-wide query for all of them, then the address
//   points around branches mapped without a full address, in small batches;
// - a busy or failing instance is followed by the next one, and when all of them fail the round is
//   repeated after a pause (30 s, then 90 s), as the servers are usually busy only for minutes;
// - a chain whose query still fails is skipped and reported (`failedChains`) while the others are
//   imported. Skipping is safe: the import never deletes a branch, so a missing chain only means its
//   branches are not refreshed this time. Likewise a failed address batch only leaves those branches
//   without a completed address, which the parser then rejects (nothing is invented);
// - only when every chain fails does the import fail and write nothing.

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const USER_AGENT = 'ShoppingBuddy-store-import/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'

// The server-side limit of one query; the request itself gets a little more.
const QUERY_TIMEOUT_S = 90
const REQUEST_TIMEOUT_MS = (QUERY_TIMEOUT_S + 15) * 1000

// Branches per address query: small enough that one batch is quick for a busy server.
const ADDRESS_BATCH = 150

// Pauses before the second and third round over all instances.
const ROUND_PAUSES_MS = [30_000, 90_000]

/** Branches whose `brand` is one of the given OSM brands (all of ours by default), in Czechia. */
export function buildShopQuery(brands: string[] = Object.keys(OSM_BRAND_TO_CHAIN)): string {
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}];`,
    'area["ISO3166-1"="CZ"][admin_level=2]->.cz;',
    `nwr["shop"]["brand"~"^(${brands.join('|')})$",i](area.cz);`,
    'out tags center;',
  ].join('\n')
}

/** Address points within 60 m (ADDRESS_RADIUS_KM) of the given map objects, then — for each of them —
 *  its own id followed by the municipalities (obec, admin_level 8) it stands in, which
 *  readAddressResult() pairs back up. A way is located by its nodes. */
export function buildAddressQuery(shops: Pick<OverpassElement, 'type' | 'id'>[]): string {
  const ids = (type: OverpassElement['type']) => shops.filter((shop) => shop.type === type).map((shop) => shop.id)
  const sets = (['node', 'way', 'relation'] as const)
    .map((type) => ({ type, list: ids(type) }))
    .filter(({ list }) => list.length > 0)
    .map(({ type, list }) => `${type}(id:${list.join(',')});`)
    .join('')
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}];`,
    `(${sets})->.s;`,
    'nwr(around.s:60)["addr:housenumber"];',
    'out tags center;',
    'foreach.s->.shop(',
    '  .shop out ids;',
    '  (node.shop; node(w.shop);)->.points;',
    '  .points is_in->.inside;',
    '  area.inside["boundary"="administrative"]["admin_level"="8"];',
    '  out tags;',
    ');',
  ].join('\n')
}

type AreaElement = { type: 'area'; id: number; tags?: Record<string, string> }

/** Splits an address query's answer (buildAddressQuery) into the address points and, per shop, the
 *  municipality it stands in — only when exactly one is named (a shop drawn across a boundary gets
 *  none). The shop markers come without tags, each followed by its municipalities. Pure. */
export function readAddressResult(elements: (OverpassElement | AreaElement)[]): { addressPoints: OverpassElement[]; municipalities: Map<string, string> } {
  const addressPoints: OverpassElement[] = []
  const names = new Map<string, Set<string>>()
  let current: string | null = null
  for (const element of elements) {
    if (element.type === 'area') {
      const name = element.tags?.name?.trim()
      if (current && name) names.get(current)!.add(name)
    } else if (!element.tags) {
      current = `${element.type}/${element.id}`
      names.set(current, names.get(current) ?? new Set())
    } else {
      addressPoints.push(element)
    }
  }
  const municipalities = new Map<string, string>()
  for (const [key, set] of names) if (set.size === 1) municipalities.set(key, [...set][0])
  return { addressPoints, municipalities }
}

/** Whether a branch's own tags already give a full address (street or place, number, town). */
export function hasOwnAddress(tags: Record<string, string> = {}): boolean {
  return Boolean((tags['addr:street'] || tags['addr:place']) && (tags['addr:housenumber'] || tags['addr:conscriptionnumber']) && tags['addr:city'])
}

export type OverpassDeps = {
  fetchImpl?: typeof fetch
  /** Waits between rounds; replaced in tests. */
  sleep?: (ms: number) => Promise<void>
  /** Epoch ms after which no new attempt starts (the cron's function time limit). */
  deadline?: number
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** One query, tried on every instance, in up to three rounds. Throws with every failure when none
 *  answered with a complete result. */
export async function runQuery(query: string, deps: OverpassDeps = {}): Promise<OverpassElement[]> {
  const body = new URLSearchParams({ data: query }).toString()
  const doFetch = deps.fetchImpl ?? fetch
  const sleep = deps.sleep ?? defaultSleep
  const failures: string[] = []
  const now = deps.now ?? Date.now
  const outOfTime = (extraMs = 0) => deps.deadline != null && now() + extraMs >= deps.deadline
  for (let round = 0; round <= ROUND_PAUSES_MS.length; round++) {
    if (round > 0) {
      if (outOfTime(ROUND_PAUSES_MS[round - 1])) break
      await sleep(ROUND_PAUSES_MS[round - 1])
    }
    for (const endpoint of ENDPOINTS) {
      if (outOfTime()) {
        failures.push('out of time')
        break
      }
      try {
        const response = await doFetch(endpoint, {
          method: 'POST',
          body,
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        const text = await response.text()
        // A busy server answers 429/504, or 200 with an HTML error page instead of JSON.
        if (!response.ok || !text.trimStart().startsWith('{')) {
          failures.push(`${new URL(endpoint).host}: HTTP ${response.status}${/too busy|rate_limited|timeout/i.test(text) ? ' (server busy)' : ''}`)
          continue
        }
        const parsed = JSON.parse(text) as { elements?: OverpassElement[]; remark?: string }
        // A query that ran out of time or memory still returns 200, with a remark and partial data —
        // importing that would look like closed branches, so it counts as a failure.
        if (!Array.isArray(parsed.elements) || parsed.remark?.includes('error')) {
          failures.push(`${new URL(endpoint).host}: incomplete result${parsed.remark ? ` (${parsed.remark.slice(0, 120)})` : ''}`)
          continue
        }
        return parsed.elements
      } catch (err) {
        const message = err instanceof DOMException && err.name === 'TimeoutError' ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : err instanceof Error ? err.message : String(err)
        failures.push(`${new URL(endpoint).host}: ${message}`)
      }
    }
  }
  throw new Error(`OpenStreetMap query failed on every server — ${failures.slice(-ENDPOINTS.length).join('; ')}`)
}

export type OsmFetchResult = {
  elements: OverpassElement[]
  /** Chains whose branches could not be read this time (nothing of theirs is changed). */
  failedChains: string[]
  /** Address batches that failed; their branches stay without a completed address this time. */
  failedAddressBatches: number
}

/** The branches of every chain plus the address points needed to complete their addresses. A chain
 *  that fails on every server is skipped and reported; throws only when every chain fails. */
export async function fetchOsmStoreElements(deps: OverpassDeps = {}): Promise<OsmFetchResult> {
  const brandsByChain = new Map<string, string[]>()
  for (const [brand, chain] of Object.entries(OSM_BRAND_TO_CHAIN)) brandsByChain.set(chain, [...(brandsByChain.get(chain) ?? []), brand])

  const shops: OverpassElement[] = []
  const failedChains: string[] = []
  const errors: string[] = []
  for (const [chain, brands] of brandsByChain) {
    try {
      shops.push(...(await runQuery(buildShopQuery(brands), deps)))
    } catch (err) {
      failedChains.push(chain)
      errors.push(`${chain}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (failedChains.length === brandsByChain.size) throw new Error(`OpenStreetMap store import failed for every chain — ${errors[0]}`)

  const incomplete = shops.filter((shop) => !hasOwnAddress(shop.tags))
  const addressPoints: OverpassElement[] = []
  let failedAddressBatches = 0
  for (let i = 0; i < incomplete.length; i += ADDRESS_BATCH) {
    try {
      const batch = incomplete.slice(i, i + ADDRESS_BATCH)
      const result = readAddressResult(await runQuery(buildAddressQuery(batch), deps))
      addressPoints.push(...result.addressPoints)
      for (const shop of batch) {
        const municipality = result.municipalities.get(`${shop.type}/${shop.id}`)
        if (municipality) shop.municipality = municipality
      }
    } catch (err) {
      failedAddressBatches++
      console.error(JSON.stringify({ event: 'osm_address_batch_failed', error: err instanceof Error ? err.message : String(err) }))
    }
  }
  return { elements: [...shops, ...addressPoints], failedChains, failedAddressBatches }
}
