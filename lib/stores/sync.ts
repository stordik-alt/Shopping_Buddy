import { distanceKm } from '@/lib/geo'
import { chainFamily } from '@/lib/stores/chain-family'
import type { OsmBranch } from '@/lib/stores/osm'

// Deciding what an import does with each branch it found — pure, so the rules are testable without
// a database (lib/db/store-directory.ts applies the plan). Rules:
// - a branch already imported from the same source (same external id) is updated when something
//   changed, otherwise only marked as seen;
// - otherwise an existing branch of the same chain that no import owns yet — seeded, or created from
//   a receipt — is ADOPTED when it is the same shop: within ADOPT_RADIUS_KM, or at the same address.
//   Its id stays (purchases, prices and members' chosen stores point at it) and so do its name and
//   address, which came from a real receipt or the seed; the import adds what it lacked (GPS, opening
//   hours) and its source id. Each existing branch is adopted at most once, by its nearest match;
// - anything else is a new branch;
// - except that one chain has at most one branch per address — the database enforces it
//   (store_locations_store_address_city_unique_idx), so the plan must too, or the whole insert fails.
//   The map sometimes lists one shop twice (as a point and as its building), and it replaces ids
//   (node → way). A found branch whose address a branch of its chain already has therefore re-points
//   that branch when it is an earlier import this run no longer finds (the replaced id); otherwise it
//   is skipped. An update that would move a branch onto another one's address is skipped the same way.
// Nothing is deleted: a branch the source no longer lists keeps its old `last_seen_at`.

export const ADOPT_RADIUS_KM = 0.15

export type ExistingLocation = {
  id: string
  chain: string
  name: string
  address: string
  city: string
  lat: number | null
  lng: number | null
  openingHours: string | null
  source: string | null
  externalId: string | null
}

export type StoreSyncPlan = {
  insert: OsmBranch[]
  /** An imported branch whose data changed at the source. */
  update: { id: string; branch: OsmBranch }[]
  /** An existing seeded/receipt branch taken over by the import, or an earlier import of the same
   *  shop under an id the source has since replaced. */
  adopt: { id: string; branch: OsmBranch }[]
  /** Already imported and unchanged: only its `last_seen_at` is refreshed. */
  unchanged: string[]
  /** Found branches not written because another branch of the chain already has their address. */
  skipped: OsmBranch[]
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('cs-CZ').replace(/\s+/g, ' ')

// Mirrors store_locations_store_address_city_unique_idx: chain (one `stores` row each), address and
// city, trimmed, whitespace collapsed, case-insensitive.
const addressKey = (chain: string, address: string, city: string) => [chain, normalize(address), normalize(city)].join('\u0000')

function changed(existing: ExistingLocation, branch: OsmBranch): boolean {
  return (
    existing.name !== branch.name ||
    existing.address !== branch.address ||
    existing.city !== branch.city ||
    existing.lat !== branch.lat ||
    existing.lng !== branch.lng ||
    existing.openingHours !== branch.openingHours
  )
}

export function planStoreSync(branches: OsmBranch[], existing: ExistingLocation[], source: string): StoreSyncPlan {
  const plan: StoreSyncPlan = { insert: [], update: [], adopt: [], unchanged: [], skipped: [] }
  const bySourceId = new Map(existing.filter((row) => row.source === source && row.externalId).map((row) => [row.externalId!, row]))
  // Adoption candidates: branches no import owns, per chain.
  const unowned = existing.filter((row) => row.source == null)
  const adopted = new Set<string>()

  // Pair each unowned branch with its nearest found branch first, so a shop between two map points
  // goes to the closer one regardless of the order the source lists them in.
  const adoptions = new Map<string, ExistingLocation>() // externalId → existing row
  const pairs: { row: ExistingLocation; branch: OsmBranch; km: number }[] = []
  for (const row of unowned) {
    for (const branch of branches) {
      // Compared by retailer: the map knows a moved Albert hypermarket as "Albert" (lib/stores/chain-family.ts).
      if (chainFamily(branch.chain) !== chainFamily(row.chain) || bySourceId.has(branch.externalId)) continue
      const sameAddress = normalize(row.address) === normalize(branch.address)
      const km = row.lat != null && row.lng != null ? distanceKm({ lat: row.lat, lng: row.lng }, { lat: branch.lat, lng: branch.lng }) : Infinity
      if (sameAddress || km <= ADOPT_RADIUS_KM) pairs.push({ row, branch, km: sameAddress ? 0 : km })
    }
  }
  pairs.sort((a, b) => a.km - b.km)
  for (const { row, branch } of pairs) {
    if (adopted.has(row.id) || adoptions.has(branch.externalId)) continue
    adopted.add(row.id)
    adoptions.set(branch.externalId, row)
  }

  // Who holds each address: an existing row's id, or the external id of a branch this plan inserts.
  const holders = new Map<string, { id: string; row?: ExistingLocation }>()
  for (const row of existing) holders.set(addressKey(row.chain, row.address, row.city), { id: row.id, row })
  const foundIds = new Set(branches.map((branch) => branch.externalId))
  const repointed = new Set<string>()

  // Branches the import already owns go first: they keep their address even if a new map point
  // listed earlier claims the same one.
  const owned = branches.filter((branch) => bySourceId.has(branch.externalId))
  const others = branches.filter((branch) => !bySourceId.has(branch.externalId))
  for (const branch of owned) {
    const own = bySourceId.get(branch.externalId)!
    if (!changed(own, branch)) {
      plan.unchanged.push(own.id)
      continue
    }
    // An update keeps the row's chain (it never moves a branch to another `stores` row).
    const key = addressKey(own.chain, branch.address, branch.city)
    const holder = holders.get(key)
    if (holder && holder.id !== own.id) {
      plan.unchanged.push(own.id)
      plan.skipped.push(branch)
      continue
    }
    holders.delete(addressKey(own.chain, own.address, own.city))
    holders.set(key, { id: own.id })
    plan.update.push({ id: own.id, branch })
  }
  for (const branch of others) {
    const row = adoptions.get(branch.externalId)
    if (row) {
      plan.adopt.push({ id: row.id, branch })
      continue
    }
    const key = addressKey(branch.chain, branch.address, branch.city)
    const holder = holders.get(key)
    if (!holder) {
      holders.set(key, { id: branch.externalId })
      plan.insert.push(branch)
      continue
    }
    const stale = holder.row
    if (stale && stale.source === source && stale.externalId && !foundIds.has(stale.externalId) && !repointed.has(stale.id)) {
      repointed.add(stale.id)
      plan.adopt.push({ id: stale.id, branch })
    } else plan.skipped.push(branch)
  }
  return plan
}
