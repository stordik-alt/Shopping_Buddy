import { fetchWithTimeout } from '@/lib/ingestion/http'
import { OSM_BRAND_TO_CHAIN, type OverpassElement } from '@/lib/stores/osm'

// Fetcher for the store import (docs/02_ARCHITECTURE.md: External Source -> Fetcher). Overpass is
// OpenStreetMap's public read-only query service; its usage policy asks for occasional queries with
// an identifying User-Agent, which a weekly import is. The public instances are often busy, so:
// - two light queries instead of one heavy one: first the branches of our chains in Czechia, then
//   only the address points around the branches mapped without a full address (in batches) — a
//   combined country-wide query timed out on every instance (2026-09-25);
// - a busy or failing instance is followed by the next one;
// - when all fail, the import fails as a whole and writes nothing (the next run tries again).

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const USER_AGENT = 'ShoppingBuddy-store-import/0.1 (+https://github.com/stordik-alt/Shopping_Buddy)'

// The server-side limit of one query; the request itself gets a little more.
const QUERY_TIMEOUT_S = 120
const REQUEST_TIMEOUT_MS = (QUERY_TIMEOUT_S + 15) * 1000

// Branches per address query: small enough that one batch is quick for a busy server.
const ADDRESS_BATCH = 400

/** Branches whose `brand` is one of our chains (case-insensitive), in Czechia. */
export function buildShopQuery(): string {
  const brands = Object.keys(OSM_BRAND_TO_CHAIN).join('|')
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}];`,
    'area["ISO3166-1"="CZ"][admin_level=2]->.cz;',
    `nwr["shop"]["brand"~"^(${brands})$",i](area.cz);`,
    'out tags center;',
  ].join('\n')
}

/** Address points within 60 m (ADDRESS_RADIUS_KM) of the given map objects. */
export function buildAddressQuery(shops: Pick<OverpassElement, 'type' | 'id'>[]): string {
  const ids = (type: OverpassElement['type']) => shops.filter((shop) => shop.type === type).map((shop) => shop.id)
  const sets = (['node', 'way', 'relation'] as const)
    .map((type) => ({ type, list: ids(type) }))
    .filter(({ list }) => list.length > 0)
    .map(({ type, list }) => `${type}(id:${list.join(',')});`)
    .join('')
  return [`[out:json][timeout:${QUERY_TIMEOUT_S}];`, `(${sets})->.s;`, 'nwr(around.s:60)["addr:housenumber"];', 'out tags center;'].join('\n')
}

/** Whether a branch's own tags already give a full address (street or place, number, town). */
export function hasOwnAddress(tags: Record<string, string> = {}): boolean {
  return Boolean((tags['addr:street'] || tags['addr:place']) && (tags['addr:housenumber'] || tags['addr:conscriptionnumber']) && tags['addr:city'])
}

async function runQuery(query: string): Promise<OverpassElement[]> {
  const body = new URLSearchParams({ data: query })
  const failures: string[] = []
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, { method: 'POST', body, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, REQUEST_TIMEOUT_MS)
      const text = await response.text()
      // A busy server answers 200 with an HTML error page instead of JSON.
      if (!response.ok || !text.trimStart().startsWith('{')) {
        failures.push(`${endpoint}: HTTP ${response.status}${text.includes('too busy') ? ' (server busy)' : ''}`)
        continue
      }
      const parsed = JSON.parse(text) as { elements?: OverpassElement[]; remark?: string }
      // A query that ran out of time or memory still returns 200, with a remark and partial data —
      // importing that would look like closed branches, so it counts as a failure.
      if (!Array.isArray(parsed.elements) || parsed.remark?.includes('error')) {
        failures.push(`${endpoint}: incomplete result${parsed.remark ? ` (${parsed.remark.slice(0, 120)})` : ''}`)
        continue
      }
      return parsed.elements
    } catch (err) {
      failures.push(`${endpoint}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(`OpenStreetMap query failed on every server — ${failures.join('; ')}`)
}

/** The branches plus the address points needed to complete their addresses. Throws (writing
 *  nothing downstream) when a query fails on every server. */
export async function fetchOsmStoreElements(): Promise<OverpassElement[]> {
  const shops = await runQuery(buildShopQuery())
  const incomplete = shops.filter((shop) => !hasOwnAddress(shop.tags))
  const addressPoints: OverpassElement[] = []
  for (let i = 0; i < incomplete.length; i += ADDRESS_BATCH) {
    addressPoints.push(...(await runQuery(buildAddressQuery(incomplete.slice(i, i + ADDRESS_BATCH)))))
  }
  return [...shops, ...addressPoints]
}
