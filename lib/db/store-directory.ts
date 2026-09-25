import { inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { fetchOsmStoreElements } from '@/lib/stores/overpass'
import { parseOsmBranches, type OsmBranch, type OsmRejection } from '@/lib/stores/osm'
import { planStoreSync, type ExistingLocation } from '@/lib/stores/sync'

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
  rejected: Record<OsmRejection['reason'], number>
  /** Branches found for a chain the app has no `stores` row for (not imported). */
  unknownChain: number
  /** Imported branches the map no longer lists (kept, with their old `last_seen_at`). */
  notSeen: number
  perChain: Record<string, number>
  applied: boolean
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
export async function importOsmStores(options: { apply: boolean; elements?: Awaited<ReturnType<typeof fetchOsmStoreElements>> }): Promise<StoreImportReport> {
  const elements = options.elements ?? (await fetchOsmStoreElements())
  const { branches: parsed, rejected } = parseOsmBranches(elements)
  const { existing, storeIdByChain } = await loadExisting()

  const branches = parsed.filter((branch) => storeIdByChain.has(branch.chain))
  const plan = planStoreSync(branches, existing, SOURCE)
  const seenIds = new Set([...plan.unchanged, ...plan.update.map((entry) => entry.id), ...plan.adopt.map((entry) => entry.id)])
  const report: StoreImportReport = {
    found: parsed.length,
    inserted: plan.insert.length,
    updated: plan.update.length,
    adopted: plan.adopt.length,
    unchanged: plan.unchanged.length,
    rejected: { 'no-address': 0, 'outside-cz': 0 },
    unknownChain: parsed.length - branches.length,
    notSeen: existing.filter((row) => row.source === SOURCE && !seenIds.has(row.id)).length,
    perChain: {},
    applied: options.apply,
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
