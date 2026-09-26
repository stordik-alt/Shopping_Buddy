import { inArray, sql, type AnyColumn } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { ALBERT_HYPERMARKET_CHAIN, fetchAlbertHypermarkets, planAlbertFormats } from '@/lib/stores/albert-formats'
import { fetchOsmStoreElements } from '@/lib/stores/overpass'
import type { OverpassElement } from '@/lib/stores/osm'
import { parseOsmBranches, type OsmBranch, type OsmRejection } from '@/lib/stores/osm'
import { planStoreSync, type ExistingLocation } from '@/lib/stores/sync'
import { chainFamily } from '@/lib/stores/chain-family'

// Imports the store chains' branches from OpenStreetMap into `store_locations`: fetch
// (lib/stores/overpass.ts) → parse and validate (lib/stores/osm.ts) → plan (lib/stores/sync.ts) →
// write here. Run by `pnpm db:import-stores` (scripts/import-stores.ts) and weekly by the cron
// /api/cron/import-stores, so new branches appear and moved ones follow the map.

const SOURCE = 'osm'
const INSERT_CHUNK = 200

export type StoreImportReport = {
  found: number
  inserted: number
  updated: number
  adopted: number
  unchanged: number
  /** Found branches not written: a branch of their chain already has that address (lib/stores/sync.ts). */
  skipped: number
  rejected: Record<OsmRejection['reason'], number>
  /** Branches found for a chain the app has no `stores` row for (not imported). */
  unknownChain: number
  /** Imported branches the map no longer lists (kept, with their old `last_seen_at`). */
  notSeen: number
  perChain: Record<string, number>
  applied: boolean
  /** Chains the map servers did not answer for this time; their branches were left as they are. */
  failedChains: string[]
  /** Address batches that failed; those branches may be rejected for a missing address this time. */
  failedAddressBatches: number
}

async function loadExisting(): Promise<{ existing: ExistingLocation[]; storeIdByChain: Map<string, string> }> {
  const db = getDb()
  const [stores, locations] = await Promise.all([db.query.stores.findMany(), db.query.storeLocations.findMany({ with: { store: true } })])
  return {
    storeIdByChain: new Map(stores.filter((store) => !store.isOnline).map((store) => [store.chain, store.id])),
    existing: locations.map((location) => ({
      id: location.id,
      chain: location.store.chain,
      name: location.name,
      address: location.address,
      city: location.city,
      lat: location.lat != null ? Number(location.lat) : null,
      lng: location.lng != null ? Number(location.lng) : null,
      openingHours: location.openingHours,
      source: location.source,
      externalId: location.externalId,
    })),
  }
}

/** Fetches, validates and (with `apply`) writes the branches. Without `apply` nothing is written and
 *  the report says what would happen. */
export async function importOsmStores(options: { apply: boolean; elements?: OverpassElement[]; deadline?: number }): Promise<StoreImportReport> {
  const fetched = options.elements ? { elements: options.elements, failedChains: [], failedAddressBatches: 0 } : await fetchOsmStoreElements({ deadline: options.deadline })
  const elements = fetched.elements
  const { branches: parsed, rejected } = parseOsmBranches(elements)
  const { existing, storeIdByChain } = await loadExisting()

  const branches = parsed.filter((branch) => storeIdByChain.has(branch.chain))
  const plan = planStoreSync(branches, existing, SOURCE)
  // Compared by retailer: Albert's hypermarkets live under "Albert Hypermarket" (lib/stores/chain-family.ts).
  const failedFamilies = new Set(fetched.failedChains.map(chainFamily))
  const seenIds = new Set([...plan.unchanged, ...plan.update.map((entry) => entry.id), ...plan.adopt.map((entry) => entry.id)])
  const report: StoreImportReport = {
    found: parsed.length,
    inserted: plan.insert.length,
    updated: plan.update.length,
    adopted: plan.adopt.length,
    unchanged: plan.unchanged.length,
    skipped: plan.skipped.length,
    rejected: { 'no-address': 0, 'outside-cz': 0 },
    unknownChain: parsed.length - branches.length,
    // A chain the servers did not answer for is not "no longer on the map".
    notSeen: existing.filter((row) => row.source === SOURCE && !seenIds.has(row.id) && !failedFamilies.has(chainFamily(row.chain))).length,
    perChain: {},
    applied: options.apply,
    failedChains: fetched.failedChains,
    failedAddressBatches: fetched.failedAddressBatches,
  }
  for (const rejection of rejected) report.rejected[rejection.reason]++
  for (const branch of branches) report.perChain[branch.chain] = (report.perChain[branch.chain] ?? 0) + 1
  if (!options.apply) return report

  const db = getDb()
  const now = new Date()
  const imported = (branch: OsmBranch) => ({
    lat: branch.lat.toString(),
    lng: branch.lng.toString(),
    openingHours: branch.openingHours,
    source: SOURCE,
    externalId: branch.externalId,
    lastSeenAt: now,
  })

  for (let i = 0; i < plan.insert.length; i += INSERT_CHUNK) {
    const chunk = plan.insert.slice(i, i + INSERT_CHUNK)
    await db
      .insert(schema.storeLocations)
      .values(chunk.map((branch) => ({ storeId: storeIdByChain.get(branch.chain)!, name: branch.name, address: branch.address, city: branch.city, ...imported(branch) })))
      // A concurrent import got there first: the unique (source, external_id) index keeps one row.
      .onConflictDoNothing({ target: [schema.storeLocations.source, schema.storeLocations.externalId], where: sql`${schema.storeLocations.externalId} IS NOT NULL` })
  }
  for (const { id, branch } of plan.update) {
    await db
      .update(schema.storeLocations)
      .set({ name: branch.name, address: branch.address, city: branch.city, ...imported(branch) })
      .where(sql`${schema.storeLocations.id} = ${id}`)
  }
  // An adopted branch keeps its own name and address (from a real receipt or the seed); the map adds
  // its position, opening hours and source id.
  for (const { id, branch } of plan.adopt) {
    await db.update(schema.storeLocations).set(imported(branch)).where(sql`${schema.storeLocations.id} = ${id}`)
  }
  for (let i = 0; i < plan.unchanged.length; i += INSERT_CHUNK) {
    await db.update(schema.storeLocations).set({ lastSeenAt: now }).where(inArray(schema.storeLocations.id, plan.unchanged.slice(i, i + INSERT_CHUNK)))
  }
  return report
}

export type AlbertFormatReport = {
  hypermarkets: number
  /** Hypermarket pages that could not be read. */
  unreadable: number
  moved: number
  alreadyMoved: number
  /** Hypermarkets no branch in the app matches, as "street, town". */
  unmatched: string[]
  applied: boolean
}

/** Moves the Albert branches that are hypermarkets to the "Albert Hypermarket" chain
 *  (lib/stores/albert-formats.ts). Without `apply` nothing is written. Run after the OSM import, so
 *  newly imported branches are sorted in the same run. */
export async function syncAlbertStoreFormats(options: { apply: boolean; fetched?: Awaited<ReturnType<typeof fetchAlbertHypermarkets>> }): Promise<AlbertFormatReport> {
  const { hypermarkets, unreadable } = options.fetched ?? (await fetchAlbertHypermarkets())
  const db = getDb()
  const [stores, locations] = await Promise.all([db.query.stores.findMany(), db.query.storeLocations.findMany({ with: { store: true } })])
  const hypermarketStoreId = stores.find((store) => store.chain === ALBERT_HYPERMARKET_CHAIN)?.id
  if (!hypermarketStoreId) throw new Error(`Store chain "${ALBERT_HYPERMARKET_CHAIN}" is missing (migration 0029)`)
  const plan = planAlbertFormats(
    hypermarkets,
    locations.map((location) => ({
      id: location.id,
      chain: location.store.chain,
      address: location.address,
      city: location.city,
      lat: location.lat != null ? Number(location.lat) : null,
      lng: location.lng != null ? Number(location.lng) : null,
    })),
  )
  const report: AlbertFormatReport = {
    hypermarkets: hypermarkets.length,
    unreadable,
    moved: plan.move.length,
    alreadyMoved: plan.alreadyMoved,
    unmatched: plan.unmatched.map((store) => `${store.street}, ${store.town}`),
    applied: options.apply,
  }
  if (!options.apply || plan.move.length === 0) return report

  const ids = plan.move
  const inIds = (column: AnyColumn) => inArray(column, ids)
  // One batch = one transaction: the branch and every row that names its chain move together, so the
  // database is never left with a price, purchase or receipt of the branch under the old chain.
  // member_stores and deals follow the branch by ON UPDATE CASCADE (migration 0030). A member who had
  // chosen one of these branches also gets the new chain selected at chain level, which the app keeps
  // for every chosen branch (see member_stores); their "Albert" selection stays.
  await db.batch([
    db.execute(sql`
      INSERT INTO member_stores (member_id, store_id)
      SELECT DISTINCT member_id, ${hypermarketStoreId}::uuid FROM member_stores WHERE ${inIds(schema.memberStores.storeLocationId)}
      ON CONFLICT DO NOTHING
    `),
    db.update(schema.storeLocations).set({ storeId: hypermarketStoreId }).where(inIds(schema.storeLocations.id)),
    db.update(schema.prices).set({ storeId: hypermarketStoreId }).where(inIds(schema.prices.storeLocationId)),
    db.update(schema.purchases).set({ storeId: hypermarketStoreId }).where(inIds(schema.purchases.storeLocationId)),
    db.update(schema.receiptImports).set({ storeId: hypermarketStoreId }).where(inIds(schema.receiptImports.storeLocationId)),
  ])
  return report
}
