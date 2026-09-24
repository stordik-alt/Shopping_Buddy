import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { EMPTY_STORE_SELECTION, normalizeStoreSelection, type StoreSelection } from '@/lib/nearby-stores'

// Personal store preferences of a household member: the chains (and optionally branches) they have
// "in their area" and how far they are willing to go (lib/nearby-stores.ts). Authorization is the
// caller's job (`app/actions/store-preferences.ts` resolves the member from the session); nothing
// here trusts a client-supplied member id.

/** Every store chain, for the picker — including chains that have no branch in the directory yet
 *  (e.g. dm) and online-only chains (`isOnline`, e.g. Rohlík), which `getStores()` (branch-based)
 *  cannot list. */
export async function getStoreChains(): Promise<{ id: string; chain: string; isOnline: boolean }[]> {
  const db = getDb()
  const rows = await db.select({ id: schema.stores.id, chain: schema.stores.chain, isOnline: schema.stores.isOnline }).from(schema.stores)
  return rows.sort((a, b) => a.chain.localeCompare(b.chain, 'cs'))
}

/** The member row of a signed-in user, or `null`. */
export async function getMemberIdForUser(userId: string): Promise<string | null> {
  const db = getDb()
  const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.userId, userId), columns: { id: true } })
  return member?.id ?? null
}

/** The member's saved selection; empty (no filtering) when they have not chosen anything. */
export async function getMemberStoreSelection(memberId: string): Promise<StoreSelection> {
  const db = getDb()
  const [member, rows] = await Promise.all([
    db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.id, memberId), columns: { maxDistanceKm: true, maxShopStores: true } }),
    db
      .select({ storeId: schema.memberStores.storeId, storeLocationId: schema.memberStores.storeLocationId, isPriority: schema.memberStores.isPriority })
      .from(schema.memberStores)
      .where(eq(schema.memberStores.memberId, memberId)),
  ])
  if (!member) return EMPTY_STORE_SELECTION
  return {
    maxDistanceKm: member.maxDistanceKm != null ? Number(member.maxDistanceKm) : null,
    chainIds: rows.filter((row) => row.storeLocationId === null).map((row) => row.storeId),
    branches: rows.filter((row) => row.storeLocationId !== null).map((row) => ({ storeId: row.storeId, storeLocationId: row.storeLocationId as string })),
    priorityChainIds: rows.filter((row) => row.storeLocationId === null && row.isPriority).map((row) => row.storeId),
    maxShopStores: member.maxShopStores,
  }
}

export class InvalidStoreSelectionError extends Error {}

/** Saves a member's selection, replacing the previous one.
 *
 *  Every id is checked against the database (an unknown chain or branch is rejected, not ignored),
 *  a picked branch implies its chain, and the distance must be valid. The change is applied as a
 *  difference — new rows are inserted before obsolete ones are deleted — so there is no moment in
 *  which a member's selection is empty (which would mean "no filtering") and a failure part-way
 *  leaves a superset of the old selection instead of losing it. `onConflictDoNothing` makes a
 *  concurrent identical save harmless. Returns the selection as stored. */
export async function saveMemberStoreSelection(
  memberId: string,
  input: { maxDistanceKm?: number | null; chainIds?: string[]; locationIds?: string[]; priorityChainIds?: string[]; maxShopStores?: number | null },
): Promise<StoreSelection> {
  const db = getDb()
  const chainIds = [...new Set(input.chainIds ?? [])]
  const locationIds = [...new Set(input.locationIds ?? [])]

  const [knownChains, knownBranches] = await Promise.all([
    chainIds.length > 0 ? db.select({ id: schema.stores.id }).from(schema.stores).where(inArray(schema.stores.id, chainIds)) : Promise.resolve([]),
    locationIds.length > 0
      ? db.select({ id: schema.storeLocations.id, storeId: schema.storeLocations.storeId }).from(schema.storeLocations).where(inArray(schema.storeLocations.id, locationIds))
      : Promise.resolve([]),
  ])
  if (knownChains.length !== chainIds.length) throw new InvalidStoreSelectionError('Vybraný obchod neexistuje.')
  if (knownBranches.length !== locationIds.length) throw new InvalidStoreSelectionError('Vybraná prodejna neexistuje.')

  const desired = normalizeStoreSelection(input, new Map(knownBranches.map((branch) => [branch.id, branch.storeId])))
  const current = await getMemberStoreSelection(memberId)

  const currentChains = new Set(current.chainIds)
  const currentBranches = new Set(current.branches.map((branch) => branch.storeLocationId))
  const desiredChains = new Set(desired.chainIds)
  const desiredBranches = new Set(desired.branches.map((branch) => branch.storeLocationId))

  const toInsert = [
    ...desired.chainIds.filter((storeId) => !currentChains.has(storeId)).map((storeId) => ({ memberId, storeId, storeLocationId: null as string | null, isPriority: desired.priorityChainIds.includes(storeId) })),
    ...desired.branches.filter((branch) => !currentBranches.has(branch.storeLocationId)).map((branch) => ({ memberId, storeId: branch.storeId, storeLocationId: branch.storeLocationId as string | null })),
  ]
  if (toInsert.length > 0) await db.insert(schema.memberStores).values(toInsert).onConflictDoNothing()

  await db
    .update(schema.householdMembers)
    .set({ maxDistanceKm: desired.maxDistanceKm != null ? desired.maxDistanceKm.toString() : null, maxShopStores: desired.maxShopStores })
    .where(eq(schema.householdMembers.id, memberId))

  // Chains that stay selected but whose priority changed (new rows above already carry theirs).
  const currentPriority = new Set(current.priorityChainIds)
  for (const storeId of desired.chainIds.filter((id) => currentChains.has(id))) {
    const wanted = desired.priorityChainIds.includes(storeId)
    if (wanted !== currentPriority.has(storeId)) {
      await db
        .update(schema.memberStores)
        .set({ isPriority: wanted })
        .where(and(eq(schema.memberStores.memberId, memberId), eq(schema.memberStores.storeId, storeId), isNull(schema.memberStores.storeLocationId)))
    }
  }

  const staleChains = current.chainIds.filter((storeId) => !desiredChains.has(storeId))
  if (staleChains.length > 0) {
    // Removing a chain also removes its branch rows (a branch cannot outlive its chain).
    await db.delete(schema.memberStores).where(and(eq(schema.memberStores.memberId, memberId), inArray(schema.memberStores.storeId, staleChains)))
  }
  const staleBranches = current.branches.map((branch) => branch.storeLocationId).filter((id) => !desiredBranches.has(id))
  if (staleBranches.length > 0) {
    await db.delete(schema.memberStores).where(and(eq(schema.memberStores.memberId, memberId), inArray(schema.memberStores.storeLocationId, staleBranches)))
  }

  return getMemberStoreSelection(memberId)
}
