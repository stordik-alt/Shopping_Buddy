import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { GpsCoords } from '@/lib/geo'
import { boundingBox, clampPage, escapeLike, type Locality } from '@/lib/stores/branch-search'
import { formatOpeningHours } from '@/lib/stores/osm'
import { todayInPrague } from '@/lib/today'

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

/** Chains that have at least one branch in the locality, with how many, and today's promotions. The
 *  member's own chains (profile) come first, the rest alphabetically. */
export async function getChainTiles(locality: Locality, memberId: string): Promise<ChainTile[]> {
  const db = getDb()
  const today = todayInPrague()
  const [chains, deals, favouriteChains] = await Promise.all([
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
    db
      .select({ storeId: schema.memberStores.storeId })
      .from(schema.memberStores)
      .where(and(eq(schema.memberStores.memberId, memberId), sql`${schema.memberStores.storeLocationId} IS NULL`)),
  ])
  const dealsByChain = new Map(deals.map((row) => [row.storeId, Number(row.count)]))
  const favourites = new Set(favouriteChains.map((row) => row.storeId))
  return chains
    .map((row) => ({
      storeId: row.storeId,
      chain: row.chain,
      branchCount: Number(row.branchCount),
      dealsCount: dealsByChain.get(row.storeId) ?? 0,
      isFavorite: favourites.has(row.storeId),
    }))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.chain.localeCompare(b.chain, 'cs'))
}

/** One page of the branches of the chosen chains in the locality: the member's favourite branches
 *  first, then nearest (position search) or by town and name. `total` counts every match, so the UI
 *  can show "2/4" while only this page was read. A page past the end falls back to the last page. */
export async function searchBranches(input: { chainIds: string[]; locality: Locality; memberId: string; page: number; pageSize: number }): Promise<BranchPage> {
  const { chainIds, locality, memberId, pageSize } = input
  if (chainIds.length === 0) return { rows: [], total: 0, page: 1 }
  const db = getDb()

  const distance = locality.kind === 'gps' ? distanceSql(locality.center) : null
  const isFavorite = sql<boolean>`EXISTS (SELECT 1 FROM ${schema.memberStores} WHERE ${schema.memberStores.memberId} = ${memberId} AND ${schema.memberStores.storeLocationId} = ${schema.storeLocations.id})`
  const where = and(sql`${schema.storeLocations.storeId} IN (${sql.join(chainIds.map((id) => sql`${id}::uuid`), sql`, `)})`, ...localityConditions(locality))

  const load = (page: number) =>
    db
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
        isFavorite,
        // Window count over the whole filtered set: the total comes with the page, no second query.
        total: sql<number>`count(*) OVER ()::int`,
      })
      .from(schema.storeLocations)
      .innerJoin(schema.stores, eq(schema.stores.id, schema.storeLocations.storeId))
      .where(where)
      .orderBy(desc(isFavorite), ...(distance ? [asc(distance)] : [asc(schema.storeLocations.city)]), asc(schema.storeLocations.name), asc(schema.storeLocations.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

  let page = Math.max(1, Math.trunc(input.page))
  let rows = await load(page)
  // The result shrank since the page was requested (or a page number was made up): show the last page.
  if (rows.length === 0 && page > 1) {
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.storeLocations).where(where)
    page = clampPage(page, Number(total), pageSize)
    rows = await load(page)
  }
  return {
    page,
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    rows: rows.map((row) => ({
      id: row.id,
      storeId: row.storeId,
      chain: row.chain,
      name: row.name,
      address: row.address,
      city: row.city,
      gps: row.lat != null && row.lng != null ? { lat: Number(row.lat), lng: Number(row.lng) } : null,
      // Opening hours from the map win over the free-text ones of seeded and receipt branches.
      hours: row.openingHours ? formatOpeningHours(row.openingHours) : row.hours,
      distanceKm: row.distanceKm != null ? Number(row.distanceKm) : null,
      isFavorite: Boolean(row.isFavorite),
    })),
  }
}
