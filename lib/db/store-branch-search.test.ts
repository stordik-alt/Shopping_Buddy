import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { getChainTiles, searchBranches } from '@/lib/db/store-branch-search'

// Integration coverage of the store directory's server-side search against the real test database.
// Everything is written under a chain, household and auth user created (and deleted) in this file, so
// the real branches are untouched; the searches are restricted to that chain.
const db = getDb()
const CITY = 'Testovice-Branchsearch'
// A point in the middle of nowhere used only by this file; branches sit at known offsets from it.
const CENTER = { lat: 49.5, lng: 15.5 }

let chainId: string
let memberId: string
let householdId: string
let userId: string
// Names in nearest-first order: Blizko (~1 km), Stred (~3 km), Daleko (~4.5 km), Mimo (~20 km).
const branchIds: Record<string, string> = {}

beforeAll(async () => {
  const [chain] = await db.insert(schema.stores).values({ chain: `__test_chain_${crypto.randomUUID().slice(0, 8)}` }).returning()
  chainId = chain.id
  const auth = await db.execute<{ id: string }>(
    sql`insert into neon_auth."user" (name, email, "emailVerified") values ('Branch search', ${`branch-search-${crypto.randomUUID()}@example.com`}, false) returning id`,
  )
  userId = auth.rows[0].id
  const [household] = await db.insert(schema.households).values({ name: '__test_household_branch_search__' }).returning()
  householdId = household.id
  const [member] = await db.insert(schema.householdMembers).values({ householdId, userId, name: 'Test', role: 'owner' }).returning()
  memberId = member.id

  // ~111.2 km per degree of latitude; offsets move the branch due north of CENTER.
  const km = (distance: number) => CENTER.lat + distance / 111.2
  const rows = [
    { name: 'Blizko', address: 'Ulice 1', lat: km(1), lng: CENTER.lng, city: CITY },
    { name: 'Stred', address: 'Ulice 2', lat: km(3), lng: CENTER.lng, city: CITY },
    { name: 'Daleko', address: 'Ulice 3', lat: km(4.5), lng: CENTER.lng, city: CITY },
    { name: 'Mimo', address: 'Ulice 4', lat: km(20), lng: CENTER.lng, city: 'Jinde-Branchsearch' },
    // No coordinates: found by town, never by position.
    { name: 'Bez GPS', address: 'Ulice 5', lat: null, lng: null, city: CITY },
  ]
  const inserted = await db
    .insert(schema.storeLocations)
    .values(rows.map((row) => ({ storeId: chainId, name: row.name, address: row.address, city: row.city, lat: row.lat?.toFixed(6) ?? null, lng: row.lng?.toFixed(6) ?? null })))
    .returning()
  for (const row of inserted) branchIds[row.name] = row.id
})

afterAll(async () => {
  await db.delete(schema.households).where(eq(schema.households.id, householdId))
  await db.execute(sql`delete from neon_auth."user" where id = ${userId}::uuid`)
  await db.delete(schema.stores).where(eq(schema.stores.id, chainId)) // cascades to its branches and member_stores
}, 60_000)

const gps = { kind: 'gps', center: CENTER, radiusKm: 5 } as const

describe('searchBranches', () => {
  it('a position search returns only branches within the radius, nearest first, with their distance', async () => {
    const result = await searchBranches({ chainIds: [chainId], locality: gps, memberId, page: 1, pageSize: 10 })
    expect(result.rows.map((row) => row.name)).toEqual(['Blizko', 'Stred', 'Daleko'])
    expect(result.total).toBe(3)
    expect(result.rows[0].distanceKm).toBeCloseTo(1, 1)
    expect(result.rows[2].distanceKm).toBeCloseTo(4.5, 1)
  })

  it('a town search matches city text case-insensitively, including branches without coordinates', async () => {
    const result = await searchBranches({ chainIds: [chainId], locality: { kind: 'city', text: 'testovice-branch' }, memberId, page: 1, pageSize: 10 })
    expect(result.rows.map((row) => row.name).sort()).toEqual(['Bez GPS', 'Blizko', 'Daleko', 'Stred'])
    expect(result.rows.every((row) => row.distanceKm === null)).toBe(true)
  })

  it('treats % and _ in the town text literally', async () => {
    const result = await searchBranches({ chainIds: [chainId], locality: { kind: 'city', text: '%' }, memberId, page: 1, pageSize: 10 })
    expect(result.total).toBe(0)
  })

  it('pages the result, reporting the full total with every page', async () => {
    const first = await searchBranches({ chainIds: [chainId], locality: { kind: 'city', text: 'Testovice-Branchsearch' }, memberId, page: 1, pageSize: 3 })
    const second = await searchBranches({ chainIds: [chainId], locality: { kind: 'city', text: 'Testovice-Branchsearch' }, memberId, page: 2, pageSize: 3 })
    expect(first.rows).toHaveLength(3)
    expect(second.rows).toHaveLength(1)
    expect(first.total).toBe(4)
    expect(second.total).toBe(4)
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(4)
  })

  it('falls back to the last page when the asked page no longer exists', async () => {
    const result = await searchBranches({ chainIds: [chainId], locality: gps, memberId, page: 9, pageSize: 2 })
    expect(result.page).toBe(2)
    expect(result.rows).toHaveLength(1)
  })

  it("puts the member's favourite branch first, even when it is the farthest", async () => {
    await db.insert(schema.memberStores).values({ memberId, storeId: chainId, storeLocationId: branchIds.Daleko })
    try {
      const result = await searchBranches({ chainIds: [chainId], locality: gps, memberId, page: 1, pageSize: 10 })
      expect(result.rows.map((row) => row.name)).toEqual(['Daleko', 'Blizko', 'Stred'])
      expect(result.rows[0].isFavorite).toBe(true)
      expect(result.rows[1].isFavorite).toBe(false)
    } finally {
      await db.delete(schema.memberStores).where(eq(schema.memberStores.memberId, memberId))
    }
  })

  it('returns nothing without chains', async () => {
    expect(await searchBranches({ chainIds: [], locality: gps, memberId, page: 1, pageSize: 5 })).toEqual({ rows: [], total: 0, page: 1 })
  })
})

describe('getChainTiles', () => {
  it('counts the chain branches in the locality; a chain with none there is not listed', async () => {
    const near = (await getChainTiles(gps, memberId)).find((tile) => tile.storeId === chainId)
    expect(near?.branchCount).toBe(3)
    expect(near?.isFavorite).toBe(false)
    const elsewhere = await getChainTiles({ kind: 'city', text: 'Neexistujici-mesto-xyz' }, memberId)
    expect(elsewhere.find((tile) => tile.storeId === chainId)).toBeUndefined()
  })

  it('lists the member\'s chosen chains first, marked as favourites', async () => {
    await db.insert(schema.memberStores).values({ memberId, storeId: chainId, storeLocationId: null })
    try {
      const tiles = await getChainTiles({ kind: 'all' }, memberId)
      expect(tiles[0].storeId).toBe(chainId)
      expect(tiles[0].isFavorite).toBe(true)
    } finally {
      await db.delete(schema.memberStores).where(inArray(schema.memberStores.memberId, [memberId]))
    }
  })
})
