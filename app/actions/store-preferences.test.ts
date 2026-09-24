import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getMemberIdForUser, getMemberStoreSelection, getStoreChains } from '@/lib/db/member-store-preferences'
import * as schema from '@/lib/db/schema'
import { saveMyStorePreferencesAction } from '@/app/actions/store-preferences'

// Integration coverage for the per-user store preferences (lib/db/member-store-preferences.ts and the
// Server Action in front of it), against the real dev database. Everything written is scoped to
// households and auth users created and deleted within this file.
//
// A Server Action's session lookup and `revalidatePath()` cannot run outside a Next request, so both
// are mocked; the member lookup, validation and every database write are the real code.
let currentUserId = ''
vi.mock('@/lib/auth/authorize', () => {
  class ForbiddenError extends Error {}
  return { ForbiddenError, requireHousehold: () => Promise.resolve({ userId: currentUserId, userEmail: 'test@example.com', householdId: 'unused', role: 'member' }) }
})
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const db = getDb()

type TestUser = { userId: string; memberId: string; householdId: string }
const createdHouseholdIds: string[] = []
const createdUserIds: string[] = []

async function createAuthUser(): Promise<string> {
  const result = await db.execute<{ id: string }>(
    sql`insert into neon_auth."user" (name, email, "emailVerified") values (${'Obchody ' + crypto.randomUUID().slice(0, 8)}, ${`stores-test-${crypto.randomUUID()}@example.com`}, false) returning id`,
  )
  createdUserIds.push(result.rows[0].id)
  return result.rows[0].id
}

async function createMember(): Promise<TestUser> {
  const userId = await createAuthUser()
  const [household] = await db.insert(schema.households).values({ name: '__test_household_store_prefs__' }).returning()
  createdHouseholdIds.push(household.id)
  const [member] = await db.insert(schema.householdMembers).values({ householdId: household.id, userId, name: 'Test', role: 'owner' }).returning()
  return { userId, memberId: member.id, householdId: household.id }
}

let lidlId: string
let albertId: string
let lidlBranches: string[]
let albertBranch: string
let user: TestUser
let other: TestUser

beforeAll(async () => {
  const chains = await getStoreChains()
  lidlId = chains.find((chain) => chain.chain === 'Lidl')!.id
  albertId = chains.find((chain) => chain.chain === 'Albert')!.id
  lidlBranches = (await db.query.storeLocations.findMany({ where: eq(schema.storeLocations.storeId, lidlId), limit: 2 })).map((row) => row.id)
  albertBranch = (await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.storeId, albertId) }))!.id
  expect(lidlBranches.length).toBe(2) // the seeded directory has several Lidl branches
})

beforeEach(async () => {
  user = await createMember()
  other = await createMember()
  currentUserId = user.userId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) await db.delete(schema.households).where(eq(schema.households.id, id)) // cascades to members and member_stores
  for (const id of createdUserIds) await db.execute(sql`delete from neon_auth."user" where id = ${id}`)
})

describe('saveMyStorePreferencesAction', () => {
  it('saves the chosen chains and the distance for the signed-in member', async () => {
    const saved = await saveMyStorePreferencesAction({ maxDistanceKm: 2.5, chainIds: [lidlId, albertId], locationIds: [] })
    expect(saved.maxDistanceKm).toBe(2.5)
    expect(saved.chainIds.sort()).toEqual([albertId, lidlId].sort())
    expect(await getMemberStoreSelection(user.memberId)).toEqual(saved)
  })

  it('a picked branch also selects its chain', async () => {
    const saved = await saveMyStorePreferencesAction({ maxDistanceKm: null, chainIds: [], locationIds: [lidlBranches[0]] })
    expect(saved.chainIds).toEqual([lidlId])
    expect(saved.branches).toEqual([{ storeId: lidlId, storeLocationId: lidlBranches[0] }])
    expect(saved.maxDistanceKm).toBeNull()
  })

  it('replaces the previous selection, keeping unchanged rows and removing what was unselected', async () => {
    await saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: [lidlId, albertId], locationIds: [lidlBranches[0], albertBranch] })
    const before = await db.query.memberStores.findMany({ where: eq(schema.memberStores.memberId, user.memberId) })
    const lidlChainRowBefore = before.find((row) => row.storeId === lidlId && row.storeLocationId === null)!

    const saved = await saveMyStorePreferencesAction({ maxDistanceKm: 3, chainIds: [lidlId], locationIds: [lidlBranches[1]] })
    expect(saved.chainIds).toEqual([lidlId]) // Albert and its branch are gone
    expect(saved.branches.map((branch) => branch.storeLocationId)).toEqual([lidlBranches[1]]) // the other Lidl branch swapped
    expect(saved.maxDistanceKm).toBe(3)

    const after = await db.query.memberStores.findMany({ where: eq(schema.memberStores.memberId, user.memberId) })
    expect(after.find((row) => row.storeId === lidlId && row.storeLocationId === null)!.id).toBe(lidlChainRowBefore.id) // untouched rows are not rewritten
  })

  it('clears everything when nothing is selected', async () => {
    await saveMyStorePreferencesAction({ maxDistanceKm: 2, chainIds: [lidlId], locationIds: [lidlBranches[0]] })
    const saved = await saveMyStorePreferencesAction({ maxDistanceKm: null, chainIds: [], locationIds: [] })
    expect(saved).toEqual({ maxDistanceKm: null, chainIds: [], branches: [] })
  })

  it('is personal: it never changes another member\'s choices', async () => {
    await db.insert(schema.memberStores).values({ memberId: other.memberId, storeId: albertId, storeLocationId: null })
    await saveMyStorePreferencesAction({ maxDistanceKm: 4, chainIds: [lidlId], locationIds: [] })
    const otherSelection = await getMemberStoreSelection(other.memberId)
    expect(otherSelection.chainIds).toEqual([albertId])
    expect(otherSelection.maxDistanceKm).toBeNull()
  })

  it('rejects an unknown chain or branch and leaves the existing selection alone', async () => {
    await saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: [lidlId], locationIds: [] })
    const unknown = crypto.randomUUID()
    await expect(saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: [unknown], locationIds: [] })).rejects.toThrow('Vybraný obchod neexistuje.')
    await expect(saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: [], locationIds: [unknown] })).rejects.toThrow('Vybraná prodejna neexistuje.')
    expect((await getMemberStoreSelection(user.memberId)).chainIds).toEqual([lidlId])
  })

  it('reports an invalid distance instead of silently dropping it', async () => {
    for (const bad of [0, -2, 51, Number.NaN]) {
      await expect(saveMyStorePreferencesAction({ maxDistanceKm: bad, chainIds: [lidlId], locationIds: [] })).rejects.toThrow('Vzdálenost musí být mezi 0,1 a 50 km.')
    }
  })

  it('rejects malformed and oversized input', async () => {
    await expect(saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: 'x' as unknown as string[], locationIds: [] })).rejects.toThrow('Neplatný výběr obchodů.')
    await expect(saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: Array.from({ length: 501 }, () => lidlId), locationIds: [] })).rejects.toThrow('Příliš mnoho')
  })

  it('refuses an account that has no household member', async () => {
    currentUserId = await createAuthUser()
    await expect(saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: [lidlId], locationIds: [] })).rejects.toThrow('No household member for this account')
  })

  it('two identical concurrent saves are harmless and leave one row per choice', async () => {
    const input = { maxDistanceKm: 2, chainIds: [lidlId, albertId], locationIds: [lidlBranches[0]] }
    await Promise.all([saveMyStorePreferencesAction(input), saveMyStorePreferencesAction(input)])
    const rows = await db.query.memberStores.findMany({ where: eq(schema.memberStores.memberId, user.memberId) })
    expect(rows).toHaveLength(3) // 2 chain rows + 1 branch row, no duplicates
  })
})

describe('getMemberIdForUser', () => {
  it('finds the member of a user, and null for an unknown user', async () => {
    expect(await getMemberIdForUser(user.userId)).toBe(user.memberId)
    expect(await getMemberIdForUser(crypto.randomUUID())).toBeNull()
  })
})

describe('database constraints of member_stores', () => {
  it('refuses a branch that belongs to a different chain than the row states', async () => {
    await expect(db.insert(schema.memberStores).values({ memberId: user.memberId, storeId: albertId, storeLocationId: lidlBranches[0] })).rejects.toThrow()
  })

  it('refuses a duplicate chain row and a duplicate branch row', async () => {
    await db.insert(schema.memberStores).values({ memberId: user.memberId, storeId: lidlId, storeLocationId: null })
    await expect(db.insert(schema.memberStores).values({ memberId: user.memberId, storeId: lidlId, storeLocationId: null })).rejects.toThrow()
    await db.insert(schema.memberStores).values({ memberId: user.memberId, storeId: lidlId, storeLocationId: lidlBranches[0] })
    await expect(db.insert(schema.memberStores).values({ memberId: user.memberId, storeId: lidlId, storeLocationId: lidlBranches[0] })).rejects.toThrow()
  })

  it('refuses a distance outside 0–50 km', async () => {
    for (const bad of ['0', '-1', '50.1', '60']) {
      await expect(db.update(schema.householdMembers).set({ maxDistanceKm: bad }).where(eq(schema.householdMembers.id, user.memberId))).rejects.toThrow()
    }
    await db.update(schema.householdMembers).set({ maxDistanceKm: '50' }).where(eq(schema.householdMembers.id, user.memberId)) // the limit itself is allowed
  })

  it('deletes a member\'s selections together with the member', async () => {
    await saveMyStorePreferencesAction({ maxDistanceKm: 1, chainIds: [lidlId], locationIds: [lidlBranches[0]] })
    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, user.memberId))
    expect(await db.query.memberStores.findMany({ where: eq(schema.memberStores.memberId, user.memberId) })).toHaveLength(0)
  })

  it('deletes selections that point at a chain that is removed', async () => {
    const [chain] = await db.insert(schema.stores).values({ chain: `__test_chain_${crypto.randomUUID()}` }).returning()
    await db.insert(schema.memberStores).values({ memberId: user.memberId, storeId: chain.id, storeLocationId: null })
    await db.delete(schema.stores).where(eq(schema.stores.id, chain.id))
    expect(await db.query.memberStores.findMany({ where: and(eq(schema.memberStores.memberId, user.memberId), eq(schema.memberStores.storeId, chain.id)) })).toHaveLength(0)
  })
})
