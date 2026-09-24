import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getStoreChains, saveMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { searchProductHits } from '@/lib/db/product-search'
import * as schema from '@/lib/db/schema'
import { SEARCH_ACCENTED, normalizeSearchText, searchTokens } from '@/lib/product-search'
import { searchProductsAction } from '@/app/actions/product-search'

// Product search against the real dev database: the generated `search_name` column, the query, and
// the Server Action that limits it to the user's chosen stores. Everything written is a throwaway
// product/user/household removed in afterAll.
let currentUserId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHousehold: () => Promise.resolve({ userId: currentUserId, userEmail: 'test@example.com', householdId: 'unused', role: 'member' }),
}))

const db = getDb()
// Letters only: a token with a digit is an optional size to the search ("1l"), and the tag must be a required word.
const tag = Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
const createdProductIds: string[] = []
const createdHouseholdIds: string[] = []
const createdUserIds: string[] = []

let lidlId: string
let albertId: string
let lidlLocationId: string
let categoryId: string
let milkId: string // present at Lidl and Albert
let cheeseId: string // present at Lidl only
let userId: string
let memberId: string

async function addProduct(name: string): Promise<string> {
  const [row] = await db.insert(schema.products).values({ name, categoryId }).returning()
  createdProductIds.push(row.id)
  return row.id
}

async function addPrice(productId: string, storeId: string, regularPrice: number, unitPrice: number, observedAt: string, unit: 'l' | 'kg' | 'ks' = 'l') {
  await db.insert(schema.prices).values({
    productId,
    storeId,
    priceScope: 'CHAIN',
    sourceType: 'OFFICIAL',
    locationResolution: 'NOT_APPLICABLE',
    regularPrice: regularPrice.toString(),
    unit,
    unitPrice: unitPrice.toString(),
    observedAt,
    validFrom: observedAt,
    sourceReference: `__test_${tag}_${productId}`,
  })
}

beforeAll(async () => {
  const chains = await getStoreChains()
  lidlId = chains.find((chain) => chain.chain === 'Lidl')!.id
  albertId = chains.find((chain) => chain.chain === 'Albert')!.id
  lidlLocationId = (await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.storeId, lidlId) }))!.id
  categoryId = (await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') }))!.id

  milkId = await addProduct(`__Test Čerstvé Mléko polotučné ${tag}`)
  cheeseId = await addProduct(`__Test Sýr Eidam ${tag}`)
  await addPrice(milkId, lidlId, 24.9, 24.9, '2026-09-20') // an older price ...
  await addPrice(milkId, lidlId, 22.9, 22.9, '2026-09-24') // ... superseded by this newer one
  await addPrice(milkId, albertId, 26.9, 26.9, '2026-09-24')
  await addPrice(cheeseId, lidlId, 39.9, 199.5, '2026-09-24', 'kg')
  // An active promotion on the milk at Lidl.
  await db.insert(schema.deals).values({ productId: milkId, storeLocationId: lidlLocationId, dealPrice: '19.9', validFrom: '2026-09-01', validUntil: '2099-01-01' })

  const result = await db.execute<{ id: string }>(sql`insert into neon_auth."user" (name, email, "emailVerified") values ('Hledání', ${`search-test-${crypto.randomUUID()}@example.com`}, false) returning id`)
  userId = result.rows[0].id
  createdUserIds.push(userId)
  const [household] = await db.insert(schema.households).values({ name: '__test_household_search__' }).returning()
  createdHouseholdIds.push(household.id)
  const [member] = await db.insert(schema.householdMembers).values({ householdId: household.id, userId, name: 'Test', role: 'owner' }).returning()
  memberId = member.id
  currentUserId = userId
})

afterAll(async () => {
  await db.delete(schema.products).where(inArray(schema.products.id, createdProductIds)) // cascades to prices and deals
  for (const id of createdHouseholdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
  for (const id of createdUserIds) await db.execute(sql`delete from neon_auth."user" where id = ${id}`)
})

describe('products.search_name', () => {
  it('is what normalizeSearchText() produces, for every accented character it maps', async () => {
    const samples = [`__Test ${SEARCH_ACCENTED} ${tag}`, `__Test Šťavnatý ŽLUŤOUČKÝ kůň 1,5% ${tag}`, `__Test plain ASCII ${tag}`]
    const ids: string[] = []
    for (const name of samples) ids.push(await addProduct(name))
    const rows = await db.query.products.findMany({ where: inArray(schema.products.id, ids) })
    for (const row of rows) expect(row.searchName).toBe(normalizeSearchText(row.name))
  })
})

describe('searchProductHits', () => {
  it('finds a product without its accents and in any case, with the latest price at each chain', async () => {
    const hits = await searchProductHits(searchTokens(`CERSTVE mleko ${tag}`))
    expect(hits.map((hit) => hit.chain).sort()).toEqual(['Albert', 'Lidl'])
    const lidl = hits.find((hit) => hit.chain === 'Lidl')!
    expect(lidl.productId).toBe(milkId)
    expect(lidl.regularPrice).toBe(22.9) // the newer observation, not 24.90
    expect(lidl.observedAt).toBe('2026-09-24')
    expect(lidl.unit).toBe('l')
    expect(lidl.score).toBeGreaterThan(0)
  })

  it('attaches the chain\'s active promotion', async () => {
    const hits = await searchProductHits(searchTokens(`mléko ${tag}`))
    const lidl = hits.find((hit) => hit.chain === 'Lidl')!
    const albert = hits.find((hit) => hit.chain === 'Albert')!
    expect(lidl.dealPrice).toBe(19.9)
    expect(lidl.dealValidUntil).toBe('2099-01-01')
    expect(albert.dealPrice).toBeNull()
  })

  it('does not require a size or strength the name omits, but ranks a name that has it higher', async () => {
    const sized = await addProduct(`__Test Mléko Čerstvé 1l ${tag}`)
    await addPrice(sized, lidlId, 20, 20, '2026-09-24')
    const hits = await searchProductHits(searchTokens(`mleko 1l ${tag}`))
    // The product without "1l" in its name is still found; the one that has it ranks first.
    expect(hits.map((hit) => hit.productId)).toContain(milkId)
    const lidl = hits.filter((hit) => hit.chain === 'Lidl').sort((a, b) => b.score - a.score)
    expect(lidl[0].productId).toBe(sized)
  })

  it('reports gram and millilitre prices per kilogram and per litre', async () => {
    const yogurt = await addProduct(`__Test Jogurt bílý ${tag}`)
    await addPrice(yogurt, lidlId, 14.9, 0.1, '2026-09-24', 'g' as never)
    const [hit] = await searchProductHits(searchTokens(`jogurt bily ${tag}`))
    expect(hit.unit).toBe('kg')
    expect(hit.unitPrice).toBe(100)
  })

  it('can be limited to one category', async () => {
    const drugstore = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Drogerie') })
    const [body] = await db.insert(schema.products).values({ name: `__Test tělové mléko ${tag}`, categoryId: drugstore!.id }).returning()
    createdProductIds.push(body.id)
    await addPrice(body.id, lidlId, 99, 99, '2026-09-24', 'ks')
    const all = await searchProductHits(searchTokens(`mleko ${tag}`))
    expect(all.map((hit) => hit.productId)).toContain(body.id)
    const food = await searchProductHits(searchTokens(`mleko ${tag}`), { category: 'Potraviny' })
    expect(food.map((hit) => hit.productId)).not.toContain(body.id)
    expect(food.map((hit) => hit.productId)).toContain(milkId)
  })

  it('requires every word to match', async () => {
    expect(await searchProductHits(searchTokens(`mleko syr ${tag}`))).toEqual([]) // words are required
    expect((await searchProductHits(searchTokens(`syr eidam ${tag}`))).map((hit) => hit.productId)).toEqual([cheeseId])
  })

  it('restricts the chains when asked, and returns nothing for an empty chain list', async () => {
    const onlyAlbert = await searchProductHits(searchTokens(`mleko ${tag}`), { storeIds: [albertId] })
    expect(onlyAlbert.map((hit) => hit.chain)).toEqual(['Albert'])
    expect(await searchProductHits(searchTokens(`mleko ${tag}`), { storeIds: [] })).toEqual([])
  })

  it('returns nothing without tokens', async () => {
    expect(await searchProductHits([])).toEqual([])
  })

  it('treats % and _ in the query as literal characters, never as wildcards', async () => {
    const underscoreId = await addProduct(`__Test a_b ${tag}`)
    await addPrice(underscoreId, lidlId, 10, 10, '2026-09-24', 'ks')
    const literal = await searchProductHits(searchTokens(`a_b ${tag}`))
    expect(literal.map((hit) => hit.productId)).toEqual([underscoreId])
    // "a?b" would match "a_b" if underscore were a wildcard; and a lone "%" must not match everything.
    expect(await searchProductHits(['a%b'])).toEqual([])
    // A lone "%" is a literal percent sign: it finds only names that contain one, not every product.
    const percent = await searchProductHits(['%'])
    expect(percent.every((hit) => hit.name.includes('%'))).toBe(true)
    expect(percent.some((hit) => hit.productId === underscoreId)).toBe(false)
  })

  it('does not fail on quote-like input (parameterized, not spliced into SQL)', async () => {
    await expect(searchProductHits(["x'); drop table products; --"])).resolves.toEqual([])
    expect((await db.query.products.findFirst({ where: eq(schema.products.id, milkId) }))?.id).toBe(milkId)
  })
})

describe('searchProductsAction', () => {
  it('searches every chain when the user has chosen none', async () => {
    const result = await searchProductsAction({ query: `mleko ${tag}`, onlyNearby: true })
    expect(result.hasNearbySelection).toBe(false)
    expect(result.nearbyOnly).toBe(false) // nothing to restrict to
    expect(result.groups.map((group) => group.chain)).toEqual(['Albert', 'Lidl'])
  })

  it('limits the search to the user\'s chosen chains, and can be switched to all', async () => {
    await saveMemberStoreSelection(memberId, { maxDistanceKm: 2, chainIds: [lidlId], locationIds: [] })
    const nearby = await searchProductsAction({ query: `mleko ${tag}`, onlyNearby: true })
    expect(nearby).toMatchObject({ hasNearbySelection: true, nearbyOnly: true })
    expect(nearby.groups.map((group) => group.chain)).toEqual(['Lidl'])

    const all = await searchProductsAction({ query: `mleko ${tag}`, onlyNearby: false })
    expect(all.nearbyOnly).toBe(false)
    expect(all.groups.map((group) => group.chain)).toEqual(['Albert', 'Lidl'])
  })

  it('passes the category filter through, and rejects an unknown category', async () => {
    const food = await searchProductsAction({ query: `mleko ${tag}`, onlyNearby: false, category: 'Potraviny' })
    expect(food.groups.length).toBeGreaterThan(0)
    const drugstore = await searchProductsAction({ query: `mleko ${tag}`, onlyNearby: false, category: 'Drogerie' })
    expect(drugstore.groups.every((group) => group.hits.every((hit) => hit.category === 'Drogerie'))).toBe(true)
    await expect(searchProductsAction({ query: 'mleko', onlyNearby: false, category: 'Nesmysl' as never })).rejects.toThrow('Neplatná kategorie.')
  })

  it('returns nothing for a query that is too short or has no usable words', async () => {
    expect((await searchProductsAction({ query: 'a', onlyNearby: false })).groups).toEqual([])
    expect((await searchProductsAction({ query: '  ?! ', onlyNearby: false })).groups).toEqual([])
    expect((await searchProductsAction({ query: '', onlyNearby: false })).groups).toEqual([])
  })

  it('rejects an over-long or non-text query', async () => {
    await expect(searchProductsAction({ query: 'x'.repeat(81), onlyNearby: false })).rejects.toThrow('nejvýše 80')
    await expect(searchProductsAction({ query: 42 as unknown as string, onlyNearby: false })).rejects.toThrow('Neplatné hledání.')
  })

  it('works for an account without a household member (no selection, all chains)', async () => {
    currentUserId = crypto.randomUUID()
    const result = await searchProductsAction({ query: `mleko ${tag}`, onlyNearby: true })
    expect(result.hasNearbySelection).toBe(false)
    expect(result.groups.length).toBeGreaterThan(0)
    currentUserId = userId
  })
})
