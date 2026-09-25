import { distanceKm } from '@/lib/geo'

// Branches of the store chains from OpenStreetMap — pure parsing, validation and matching, kept free
// of network and database code so it is deterministic and testable (CLAUDE.md section 5). The fetch
// is lib/stores/overpass.ts, the database write lib/db/store-directory.ts.
//
// Source and licence: OpenStreetMap data, © OpenStreetMap contributors, available under the Open
// Database License (ODbL). The app shows that attribution wherever branch data appears (the store
// directory). Branches are never invented (CLAUDE.md section 14): a map point without an address the
// data itself states — on the shop or on the address point it stands at — is rejected, not guessed.

/** OSM `brand` (lower-cased) → our `stores.chain`. Only chains the app already has with physical
 *  branches; online-only ones (Rohlík, Košík) have none by definition. */
export const OSM_BRAND_TO_CHAIN: Record<string, string> = {
  albert: 'Albert',
  billa: 'Billa',
  dm: 'dm',
  globus: 'Globus',
  jip: 'JIP',
  kaufland: 'Kaufland',
  lidl: 'Lidl',
  penny: 'Penny',
  tesco: 'Tesco',
}

// A shop point tagged `shop=no` / `vacant` is a closed branch; `mall` is the shopping centre around it.
const NOT_A_BRANCH = new Set(['no', 'vacant', 'mall', 'yes'])

// Czech Republic bounding box, generously rounded: a point outside it is a tagging error.
const CZ_BOUNDS = { minLat: 48.5, maxLat: 51.1, minLng: 12.0, maxLng: 18.9 }

// How far from a shop point an address point may be to count as the building it stands in. Shops are
// mapped inside or at the edge of their building; 60 m covers a supermarket's footprint without
// reaching across a street block.
export const ADDRESS_RADIUS_KM = 0.06

export type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export type OsmBranch = {
  /** `node/123`, `way/456` — OSM's own stable id: the import's idempotency key. */
  externalId: string
  chain: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  /** OSM `opening_hours` syntax, or null when the map does not state it. */
  openingHours: string | null
}

export type OsmRejection = { externalId: string; chain: string; reason: 'no-address' | 'outside-cz' }

type Address = { street: string | null; number: string | null; postcode: string | null; city: string | null }

function coords(element: OverpassElement): { lat: number; lng: number } | null {
  const lat = element.lat ?? element.center?.lat
  const lng = element.lon ?? element.center?.lon
  return lat != null && lng != null ? { lat, lng } : null
}

function addressOf(tags: Record<string, string>): Address {
  return {
    // A village without street names numbers its houses per place (`addr:place`).
    street: tags['addr:street'] ?? tags['addr:place'] ?? null,
    number: tags['addr:housenumber'] ?? tags['addr:conscriptionnumber'] ?? null,
    postcode: tags['addr:postcode'] ?? null,
    city: tags['addr:city'] ?? null,
  }
}

/** "14000" → "140 00", the Czech way of writing a postcode. */
export function formatPostcode(postcode: string): string {
  const digits = postcode.replace(/\s+/g, '')
  return /^\d{5}$/.test(digits) ? `${digits.slice(0, 3)} ${digits.slice(3)}` : postcode.trim()
}

/** "Zdislavická 583, 142 00 Praha 4" — the format the seeded and receipt branches already use. */
export function formatAddress(address: Address & { city: string }): string {
  const street = [address.street, address.number].filter(Boolean).join(' ')
  const town = [address.postcode ? formatPostcode(address.postcode) : null, address.city].filter(Boolean).join(' ')
  return [street, town].filter(Boolean).join(', ')
}

/** The branch's own display name: the chain (or a more specific OSM name such as "Tesco Express"),
 *  then the street — like the existing "Lidl Budějovická". Brand-only names in capitals ("PENNY")
 *  become the chain's own spelling. */
export function branchName(chain: string, osmName: string | undefined, street: string | null, city: string): string {
  const specific = osmName && osmName.trim().toLowerCase() !== chain.toLowerCase() && osmName.toLowerCase().startsWith(chain.toLowerCase()) ? osmName.trim() : chain
  const place = street ?? city
  return specific.toLowerCase().includes(place.toLowerCase()) ? specific : `${specific} ${place}`
}

/** Turns an Overpass response (shops of the chains, plus the address points around them) into
 *  validated branches. A shop without its own address takes the nearest address point within
 *  ADDRESS_RADIUS_KM — in Czechia every building's address is in OSM (the RÚIAN import), so this is
 *  the building the shop stands in. A shop still without street/number and town is rejected. */
export function parseOsmBranches(elements: OverpassElement[]): { branches: OsmBranch[]; rejected: OsmRejection[] } {
  const addressPoints: { at: { lat: number; lng: number }; address: Address }[] = []
  const shops: { element: OverpassElement; chain: string; at: { lat: number; lng: number } }[] = []
  for (const element of elements) {
    const tags = element.tags ?? {}
    const at = coords(element)
    if (!at) continue
    const chain = OSM_BRAND_TO_CHAIN[(tags.brand ?? '').trim().toLowerCase()]
    if (chain && tags.shop && !NOT_A_BRANCH.has(tags.shop)) shops.push({ element, chain, at })
    if (tags['addr:housenumber'] || tags['addr:conscriptionnumber']) addressPoints.push({ at, address: addressOf(tags) })
  }

  const branches: OsmBranch[] = []
  const rejected: OsmRejection[] = []
  const seen = new Set<string>()
  for (const { element, chain, at } of shops) {
    const externalId = `${element.type}/${element.id}`
    if (seen.has(externalId)) continue
    seen.add(externalId)
    if (at.lat < CZ_BOUNDS.minLat || at.lat > CZ_BOUNDS.maxLat || at.lng < CZ_BOUNDS.minLng || at.lng > CZ_BOUNDS.maxLng) {
      rejected.push({ externalId, chain, reason: 'outside-cz' })
      continue
    }
    const tags = element.tags ?? {}
    const own = addressOf(tags)
    // The nearest address point fills in only what the shop itself does not state.
    const nearest = own.street && own.number && own.city ? null : nearestAddress(at, addressPoints)
    const address: Address = {
      street: own.street ?? nearest?.street ?? null,
      // A number from the nearest point only when it is on the same street (or the shop names none).
      number: own.number ?? (nearest && (!own.street || nearest.street === own.street) ? nearest.number : null),
      postcode: own.postcode ?? nearest?.postcode ?? null,
      city: own.city ?? nearest?.city ?? null,
    }
    if (!address.street || !address.number || !address.city) {
      rejected.push({ externalId, chain, reason: 'no-address' })
      continue
    }
    branches.push({
      externalId,
      chain,
      name: branchName(chain, tags.name, address.street, address.city),
      address: formatAddress({ ...address, city: address.city }),
      city: address.city,
      lat: roundCoord(at.lat),
      lng: roundCoord(at.lng),
      openingHours: tags.opening_hours?.trim() || null,
    })
  }
  return { branches, rejected }
}

// numeric(9, 6) in the database: ~0.1 m, far below the map's own precision.
const roundCoord = (value: number) => Math.round(value * 1e6) / 1e6

function nearestAddress(at: { lat: number; lng: number }, points: { at: { lat: number; lng: number }; address: Address }[]): Address | null {
  let best: Address | null = null
  let bestKm = ADDRESS_RADIUS_KM
  for (const point of points) {
    // A cheap box test first: 0.001° is ~110 m, so anything outside it is beyond the radius.
    if (Math.abs(point.at.lat - at.lat) > 0.001 || Math.abs(point.at.lng - at.lng) > 0.0015) continue
    const km = distanceKm(at, point.at)
    if (km <= bestKm && point.address.street && point.address.city) {
      best = point.address
      bestKm = km
    }
  }
  return best
}

// --- Opening hours ---------------------------------------------------------------------------------

const DAY_NAMES: Record<string, string> = { Mo: 'Po', Tu: 'Út', We: 'St', Th: 'Čt', Fr: 'Pá', Sa: 'So', Su: 'Ne', PH: 'svátky' }

/** OSM `opening_hours` → Czech for display: "Mo-Sa 07:00-21:00; Su 08:00-20:00" → "Po–So 7:00–21:00 ·
 *  Ne 8:00–20:00". Covers the day/time rules shops use; anything richer (months, week numbers,
 *  comments) is returned unchanged rather than half-translated. */
export function formatOpeningHours(value: string): string {
  const raw = value.trim()
  if (raw === '24/7') return 'nonstop'
  // Rules are separated by ";" and, between whole rules, by a comma after a time and before a day
  // name ("Mo-Sa 07:00-21:00, Su 08:00-21:00") — not by the comma inside a day list ("Sa,Su").
  const rules = raw.split(/;\s*|(?<=\d),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/).map((rule) => rule.trim()).filter(Boolean)
  const formatted: string[] = []
  for (const rule of rules) {
    const match = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)*)(.*)$/.exec(rule)
    if (!match) return raw
    const days = match[1]
      .trim()
      .replace(/,$/, '')
      .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (day) => DAY_NAMES[day])
      .replace(/\s*-\s*/g, '–')
      .replace(/\s*,\s*/g, ', ')
    const rest = match[2].trim()
    let times: string
    if (rest === 'off' || rest === 'closed') times = 'zavřeno'
    else if (rest === '') times = ''
    else if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*$/.test(rest)) {
      times = rest
        .split(/\s*,\s*/)
        .map((range) => range.split(/\s*-\s*/).map((time) => time.replace(/^0(\d):/, '$1:')).join('–'))
        .join(', ')
    } else return raw
    formatted.push([days, times].filter(Boolean).join(' '))
  }
  return formatted.join(' · ')
}
