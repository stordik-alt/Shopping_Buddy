import { distanceKm } from '@/lib/geo'
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
// - anything else is a new branch.
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
  /** An existing seeded/receipt branch taken over by the import. */
  adopt: { id: string; branch: OsmBranch }[]
  /** Already imported and unchanged: only its `last_seen_at` is refreshed. */
  unchanged: string[]
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('cs-CZ').replace(/\s+/g, ' ')

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
  const plan: StoreSyncPlan = { insert: [], update: [], adopt: [], unchanged: [] }
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
      if (branch.chain !== row.chain || bySourceId.has(branch.externalId)) continue
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

  for (const branch of branches) {
    const own = bySourceId.get(branch.externalId)
    if (own) {
      if (changed(own, branch)) plan.update.push({ id: own.id, branch })
      else plan.unchanged.push(own.id)
      continue
    }
    const row = adoptions.get(branch.externalId)
    if (row) plan.adopt.push({ id: row.id, branch })
    else plan.insert.push(branch)
  }
  return plan
}
