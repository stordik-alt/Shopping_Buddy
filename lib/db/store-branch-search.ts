import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { GpsCoords } from '@/lib/geo'
import { boundingBox, clampPage, escapeLike, type Locality } from '@/lib/stores/branch-search'
import { formatOpeningHours } from '@/lib/stores/osm'
import { todayInPrague } from '@/lib/today'
import { GLOBAL_CACHE_TAGS } from '@/lib/db/cache-tags'

// The store directory's server-side search: chain tiles for a locality, and one page of branches for
// the chosen chains. The old directory shipped every branch (~1,800) to the browser on each page
// render, which used up Neon's monthly network transfer; now only the chains' counts and the branches
// of the page being looked at leave the database. Store data is global (not household-scoped); the
// caller resolves the member, whose own favourites are the only personal data here.

export type ChainTile = {
  storeId: string
  chain: string
  /** Branches of the chain in the locality. */
  branchCount: number
  /** Promotions running today for the whole chain — retailers publish them chain-wide. */
  dealsCount: number
  /** The signed-in member has chosen the chain in their profile. */
  isFavorite: boolean
}

export type BranchRow = {
  id: string
  storeId: string
  chain: string
  name: string
  address: string
  city: string
  gps: GpsCoords | null
  hours: string | null
  /** Straight-line distance from the search centre; only set for a position search. */
  distanceKm: number | null
  /** The signed-in member has chosen this very branch in their profile. */
  isFavorite: boolean
}

export type BranchPage = { rows: BranchRow[]; total: number; page: number }

// Great-circle distance (km) of a branch from a point, in SQL, so the database orders and filters by
// it without sending branches out. The `least(1, …)` guards asin() against rounding just above 1.
function distanceSql(center: GpsCoords): SQL<number> {
  const lat = sql`${schema.storeLocations.lat}::float8`
  const lng = sql`${schema.storeLocations.lng}::float8`
  return sql<number>`(6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(${lat} - ${center.lat}::float8) / 2), 2)
    + cos(radians(${center.lat}::float8)) * cos(radians(${lat})) * power(sin(radians(${lng} - ${center.lng}::float8) / 2), 2)
  ))))`
}

// Online-only chains have no branches, so the locality conditions are the only extra filter.
function localityConditions(locality: Locality): SQL[] {
  if (locality.kind === 'city') {
    const pattern = `%${escapeLike(locality.text.trim())}%`
    return [sql`(${schema.storeLocations.city} ILIKE ${pattern} OR ${schema.storeLocations.address} ILIKE ${pattern})`]
  }
  if (locality.kind === 'gps') {
    const box = boundingBox(locality.center, locality.radiusKm)
    return [
      sql`${schema.storeLocations.lat} IS NOT NULL AND ${schema.storeLocations.lng} IS NOT NULL`,
      sql`${schema.storeLocations.lat} BETWEEN ${box.minLat} AND ${box.maxLat}`,
      sql`${schema.storeLocations.lng} BETWEEN ${box.minLng} AND ${box.maxLng}`,
      sql`${distanceSql(locality.center)} <= ${locality.radiusKm}`,
    ]
  }
  return []
}

type GlobalChainTile = Omit<ChainTile, 'isFavorite'>
type GlobalBranchRow = Omit<BranchRow, 'isFavorite'>
type GlobalBranchPage = { rows: GlobalBranchRow[]; total: number; page: number }

const ONE_DAY = 24 * 60 * 60

function localityKey(locality: Locality): string {
  return JSON.stringify(locality)
}

const getChainTilesGlobal = unstable_cache(
  async (serializedLocality: string, today: string): Promise<GlobalChainTile[]> => {
    const db = getDb()
    const locality = JSON.parse(serializedLocality) as Locality
    const [chains, deals] = await Promise.all([
      db
        .select({ storeId: schema.stores.id, chain: schema.stores.chain, branchCount: sql<number>`count(*)::int` })
        .from(schema.storeLocations)
        .innerJoin(schema.stores, eq(schema.stores.id, schema.storeLocations.storeId))
        .where(and(...localityConditions(locality)))
        .groupBy(schema.stores.id, schema.stores.chain),
      db
        .select({ storeId: schema.deals.storeId, count: sql<number>`count(DISTINCT ${schema.deals.productId})::int` })
        .from(schema.deals)
        .where(and(sql`${schema.deals.validFrom} <= ${today}`, sql`${schema.deals.validUntil} >= ${today}`))
        .groupBy(schema.deals.storeId),
    ])
    const dealsByChain = new Map(deals.map((row) => [row.storeId, Number(row.count)]))
    return chains.map((row) => ({
      storeId: row.storeId,
      chain: row.chain,
      branchCount: Number(row.branchCount),
      dealsCount: dealsByChain.get(row.storeId) ?? 0,
    }))
  },
  ['store-chain-tiles-v1'],
  { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.stores, GLOBAL_CACHE_TAGS.deals] },
)

/** Chains with branch counts and today's promotions are global; only member favourites stay outside the shared cache. */
export async function getChainTiles(locality: Locality, memberId: string): Promise<ChainTile[]> {
  const db = getDb()
  const [chains, favouriteChains] = await Promise.all([
    getChainTilesGlobal(localityKey(locality), todayInPrague()),
    db
      .select({ storeId: schema.memberStores.storeId })
      .from(schema.memberStores)
      .where(and(eq(schema.memberStores.memberId, memberId), sql`${schema.memberStores.storeLocationId} IS NULL`)),
  ])
  const favourites = new Set(favouriteChains.map((row) => row.storeId))
  return chains
    .map((row) => ({ ...row, isFavorite: favourites.has(row.storeId) }))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.chain.localeCompare(b.chain, 'cs'))
}

const searchBranchesGlobal = unstable_cache(
  async (serializedChainIds: string, serializedLocality: string): Promise<GlobalBranchPage> => {
    const db = getDb()
    const chainIds = JSON.parse(serializedChainIds) as string[]
    const locality = JSON.parse(serializedLocality) as Locality
    const distance = locality.kind === 'gps' ? distanceSql(locality.center) : null
    const where = and(sql`${schema.storeLocations.storeId} IN (${sql.join(chainIds.map((id) => sql`${id}::uuid`), sql`, `)})`, ...localityConditions(locality))

    const rows = await db
      .select({
        id: schema.storeLocations.id,
        storeId: schema.storeLocations.storeId,
        chain: schema.stores.chain,
        name: schema.storeLocations.name,
        address: schema.storeLocations.address,
        city: schema.storeLocations.city,
        lat: schema.storeLocations.lat,
        lng: schema.storeLocations.lng,
        hours: schema.storeLocations.hours,
        openingHours: schema.storeLocations.openingHours,
        distanceKm: distance ?? sql<null>`NULL`,
      })
      .from(schema.storeLocations)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.storeLocations.storeId))
      .where(where)
      .orderBy(...(distance ? [asc(distance)] : [asc(schema.storeLocations.city)]), asc(schema.storeLocations.name), asc(schema.storeLocations.id))

    return {
      page: 1,
      total: rows.length,
      rows: rows.map((row) => ({
        id: row.id,
        storeId: row.storeId,
        chain: row.chain,
        name: row.name,
        address: row.address,
        city: row.city,
        gps: row.lat != null && row.lng != null ? { lat: Number(row.lat), lng: Number(row.lng) } : null,
        hours: row.openingHours ? formatOpeningHours(row.openingHours) : row.hours,
        distanceKm: row.distanceKm != null ? Number(row.distanceKm) : null,
      })),
    }
  },
  ['store-branch-search-v2'],
  { revalidate: ONE_DAY, tags: [GLOBAL_CACHE_TAGS.stores] },
)

/** Branch rows are global and cached; favourite-branch flags are member-specific and queried separately. */
export async function searchBranches(input: { chainIds: string[]; locality: Locality; memberId: string; page: number; pageSize: number }): Promise<BranchPage> {
  const { chainIds, locality, memberId, pageSize } = input
  if (chainIds.length === 0) return { rows: [], total: 0, page: 1 }
  const db = getDb()
  const canonicalChainIds = [...new Set(chainIds)].sort()
  const global = await searchBranchesGlobal(JSON.stringify(canonicalChainIds), localityKey(locality))
  const locationIds = global.rows.map((row) => row.id)
  const favouriteRows = locationIds.length
    ? await db
        .select({ storeLocationId: schema.memberStores.storeLocationId })
        .from(schema.memberStores)
        .where(and(eq(schema.memberStores.memberId, memberId), inArray(schema.memberStores.storeLocationId, locationIds)))
    : []
  const favourites = new Set(favouriteRows.map((row) => row.storeLocationId).filter((id): id is string => id != null))
  const orderedRows = [...global.rows].sort(
    (a, b) => Number(favourites.has(b.id)) - Number(favourites.has(a.id))
      || (locality.kind === 'gps'
        ? (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)
        : a.city.localeCompare(b.city, 'cs'))
      || a.name.localeCompare(b.name, 'cs')
      || a.id.localeCompare(b.id),
  )
  const page = clampPage(input.page, orderedRows.length, pageSize)
  const start = (page - 1) * pageSize
  return {
    page,
    total: orderedRows.length,
    rows: orderedRows.slice(start, start + pageSize).map((row) => ({ ...row, isFavorite: favourites.has(row.id) })),
  }
}
