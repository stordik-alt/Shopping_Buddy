import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getStoreChains, saveMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { getPinsForItems } from '@/lib/db/shopping-plan'
import * as schema from '@/lib/db/schema'
import { buildShoppingPlanAction, pinProductAction, unpinProductAction } from '@/app/actions/shopping-plan'

// The shopping planner against the real dev database: pins, the plan builder and the Server Actions.
// Everything written is a throwaway household/user/list/product removed in afterAll. A Server Action's
// session lookup and revalidatePath() cannot run outside a Next request, so both are mocked; the
// member lookup, pricing, matching and every database write are the real code.
let session = { userId: '', householdId: '' }
vi.mock('@/lib/auth/authorize', () => ({
  requireHousehold: () => Promise.resolve({ userId: session.userId, userEmail: 'test@example.com', householdId: session.householdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const db = getDb()
// Letters only: the search treats a token with a digit as an optional size, and the tag must be a required word.
// A new tag for every test: products from earlier tests stay in the catalog until afterAll and must not
// match the next test's items.
const newTag = () => Array.from({ length: 10 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
let tag = newTag()
const createdProductIds: string[] = []
const createdHouseholdIds: string[] = []
const createdUserIds: string[] = []

let lidlId: string
let albertId: string
let billaId: string
let categoryId: string
let listId: string
let memberId: string
let otherHouseholdId: string
let otherItemId: string

async function addProduct(name: string): Promise<string> {
  const [row] = await db.insert(schema.products).values({ name, categoryId }).returning()
  createdProductIds.push(row.id)
  return row.id
}

async function addPrice(productId: string, storeId: string, regularPrice: number, unitPrice: number, unit: 'l' | 'kg' | 'ks' = 'l') {
  await db.insert(schema.prices).values({
    productId,
    storeId,
    priceScope: 'CHAIN',
    sourceType: 'OFFICIAL',
    locationResolution: 'NOT_APPLICABLE',
    regularPrice: regularPrice.toString(),
    unit,
    unitPrice: unitPrice.toString(),
    observedAt: '2026-09-24',
    validFrom: '2026-09-24',
    sourceReference: `__test_${tag}_${productId}_${storeId}`,
  })
}

async function addItem(name: string, quantity = 1, unit: 'ks' | 'kg' | 'l' = 'ks', extra: Partial<typeof schema.shoppingListItems.$inferInsert> = {}): Promise<string> {
  const [row] = await db.insert(schema.shoppingListItems).values({ listId, name, quantity, unit, category: 'Potraviny', ...extra }).returning()
  return row.id
}

beforeAll(async () => {
  const chains = await getStoreChains()
  lidlId = chains.find((chain) => chain.chain === 'Lidl')!.id
  albertId = chains.find((chain) => chain.chain === 'Albert')!.id
  billaId = chains.find((chain) => chain.chain === 'Billa')!.id
  categoryId = (await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') }))!.id

  const result = await db.execute<{ id: string }>(sql`insert into neon_auth."user" (name, email, "emailVerified") values ('Plán', ${`plan-test-${crypto.randomUUID()}@example.com`}, false) returning id`)
  const userId = result.rows[0].id
  createdUserIds.push(userId)
  const [household] = await db.insert(schema.households).values({ name: '__test_household_plan__' }).returning()
  createdHouseholdIds.push(household.id)
  const [member] = await db.insert(schema.householdMembers).values({ householdId: household.id, userId, name: 'Test', role: 'owner' }).returning()
  memberId = member.id
  const [list] = await db.insert(schema.shoppingLists).values({ householdId: household.id, name: 'Test' }).returning()
  listId = list.id
  session = { userId, householdId: household.id }

  const [other] = await db.insert(schema.households).values({ name: '__test_household_plan_other__' }).returning()
  createdHouseholdIds.push(other.id)
  otherHouseholdId = other.id
  const [otherList] = await db.insert(schema.shoppingLists).values({ householdId: other.id, name: 'Other' }).returning()
  const [otherItem] = await db.insert(schema.shoppingListItems).values({ listId: otherList.id, name: 'cizí', category: 'Potraviny' }).returning()
  otherItemId = otherItem.id
})

beforeEach(async () => {
  tag = newTag()
  // Every test starts from an empty list and no chosen stores, so tests do not depend on each other.
  await db.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.listId, listId))
  await saveMemberStoreSelection(memberId, { maxDistanceKm: null, chainIds: [], locationIds: [] })
})

afterAll(async () => {
  await db.delete(schema.products).where(inArray(schema.products.id, createdProductIds)) // cascades to prices and pins
  if (createdHouseholdIds.length > 0) await db.delete(schema.households).where(inArray(schema.households.id, createdHouseholdIds))
  if (createdUserIds.length > 0) await db.execute(sql`delete from neon_auth."user" where id in (${sql.join(createdUserIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
}, 60_000)

const linesOf = (plan: Awaited<ReturnType<typeof buildShoppingPlanAction>>['plan']) => plan.stores.flatMap((store) => store.lines)

describe('buildShoppingPlanAction', () => {
  it('plans a need at the store that is cheapest for it, pro rata by unit price', async () => {
    const lidl = await addProduct(`Mléko ${tag} lidlské`)
    const albert = await addProduct(`Mléko ${tag} albertí`)
    await addPrice(lidl, lidlId, 20, 20)
    await addPrice(albert, albertId, 25, 25)
    await addItem(`mleko ${tag}`, 2, 'l')

    const { plan } = await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })
    expect(plan.stores).toHaveLength(1)
    expect(plan.stores[0].chain).toBe('Lidl')
    expect(plan.total).toBe(40) // 2 l at 20 Kč/l
    const line = linesOf(plan)[0]
    expect(line.productId).toBe(lidl)
    expect(line.source).toBe('auto')
    // What buying it here saves against the other store.
    expect(line.alternatives.find((alt) => alt.chain === 'Albert')).toMatchObject({ cost: 50, difference: 10 })
  })

  it('splits the list over two stores when that is clearly cheaper, and keeps to one when asked', async () => {
    const milkLidl = await addProduct(`Mléko ${tag} a`)
    const milkAlbert = await addProduct(`Mléko ${tag} b`)
    const breadLidl = await addProduct(`Chléb ${tag} a`)
    const breadAlbert = await addProduct(`Chléb ${tag} b`)
    await addPrice(milkLidl, lidlId, 20, 20)
    await addPrice(milkAlbert, albertId, 60, 60)
    await addPrice(breadLidl, lidlId, 70, 70, 'kg')
    await addPrice(breadAlbert, albertId, 30, 30, 'kg')
    await addItem(`mleko ${tag}`, 1, 'l')
    await addItem(`chleb ${tag}`, 1, 'kg')

    const two = (await buildShoppingPlanAction({ maxStores: 2, priorityChainIds: [] })).plan
    expect(two.stores.map((store) => store.chain).sort()).toEqual(['Albert', 'Lidl'])
    expect(two.total).toBe(50) // milk at Lidl, bread at Albert
    const one = (await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })).plan
    expect(one.stores).toHaveLength(1)
    expect(one.total).toBeGreaterThan(two.total)
    expect(two.savingVsSingleStore).toBe(one.total - two.total)
  })

  it('uses a pinned product instead of the automatic pick', async () => {
    const cheap = await addProduct(`Máslo ${tag} levné`)
    const chosen = await addProduct(`Máslo ${tag} vybrané`)
    await addPrice(cheap, lidlId, 30, 30, 'ks')
    await addPrice(chosen, lidlId, 45, 45, 'ks')
    const itemId = await addItem(`maslo ${tag}`, 1, 'ks')

    const auto = linesOf((await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })).plan)[0]
    expect(auto.productId).toBe(cheap)

    await pinProductAction({ itemId, storeId: lidlId, productId: chosen })
    const pinned = linesOf((await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })).plan)[0]
    expect(pinned).toMatchObject({ productId: chosen, source: 'pinned', cost: 45 })

    await unpinProductAction({ itemId, storeId: lidlId })
    expect(linesOf((await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })).plan)[0].productId).toBe(cheap)
  })

  it('a pin at one chain does not change what another chain offers', async () => {
    const lidlProduct = await addProduct(`Sýr ${tag} lidl`)
    const albertProduct = await addProduct(`Sýr ${tag} albert`)
    const albertOther = await addProduct(`Sýr ${tag} albert dražší`)
    await addPrice(lidlProduct, lidlId, 50, 50, 'ks')
    await addPrice(albertProduct, albertId, 40, 40, 'ks')
    await addPrice(albertOther, albertId, 80, 80, 'ks')
    const itemId = await addItem(`syr ${tag}`, 1, 'ks')
    await pinProductAction({ itemId, storeId: albertId, productId: albertOther })
    const { plan } = await buildShoppingPlanAction({ maxStores: 2, priorityChainIds: [] })
    const line = linesOf(plan)[0]
    expect(line.chain).toBe('Lidl') // Albert's pinned 80 loses to Lidl's automatic 50
    expect(line.alternatives.find((alt) => alt.chain === 'Albert')?.cost).toBe(80)
  })

  it('restricts the plan to the user\'s chosen stores', async () => {
    const lidl = await addProduct(`Rýže ${tag} l`)
    const albert = await addProduct(`Rýže ${tag} a`)
    await addPrice(lidl, lidlId, 60, 60, 'kg')
    await addPrice(albert, albertId, 30, 30, 'kg')
    await addItem(`ryze ${tag}`, 1, 'kg')
    await saveMemberStoreSelection(memberId, { maxDistanceKm: null, chainIds: [lidlId], locationIds: [] })

    const result = await buildShoppingPlanAction({ maxStores: 2, priorityChainIds: [] })
    expect(result.usedNearbySelection).toBe(true)
    expect(result.allowedChains.map((chain) => chain.chain)).toEqual(['Lidl'])
    expect(result.plan.stores.map((store) => store.chain)).toEqual(['Lidl']) // Albert is cheaper but not in the user's area
    expect(result.plan.total).toBe(60)
  })

  it('prefers a priority store when it costs only a little more', async () => {
    const lidl = await addProduct(`Čaj ${tag} l`)
    const albert = await addProduct(`Čaj ${tag} a`)
    await addPrice(lidl, lidlId, 100, 100, 'ks')
    await addPrice(albert, albertId, 103, 103, 'ks')
    await addItem(`caj ${tag}`, 1, 'ks')

    const plain = (await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })).plan
    expect(plain.stores[0].chain).toBe('Lidl')
    const preferred = (await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [albertId] })).plan
    expect(preferred.stores[0].chain).toBe('Albert')
    expect(preferred.stores[0].isPriority).toBe(true)
    expect(preferred.costOfPriority).toBe(3)
  })

  it('reports an item that cannot be priced anywhere instead of inventing a price', async () => {
    const piece = await addProduct(`Banán ${tag}`)
    await addPrice(piece, lidlId, 20, 20, 'ks')
    await addItem(`banan ${tag}`, 1, 'kg') // a weight need against a piece-priced product
    await addItem(`nikdyneexistuje${tag}`, 1, 'ks')

    const { plan } = await buildShoppingPlanAction({ maxStores: 2, priorityChainIds: [] })
    expect(plan.plannedCount).toBe(0)
    expect(plan.unplanned.map((entry) => entry.name).sort()).toEqual([`banan ${tag}`, `nikdyneexistuje${tag}`].sort())
    expect(plan.total).toBe(0)
  })

  it('does not restrict the search by category for an item of unknown category', async () => {
    const product = await addProduct(`Zvláštnost ${tag}`)
    await addPrice(product, lidlId, 10, 10, 'ks')
    await addItem(`zvlastnost ${tag}`, 1, 'ks', { category: 'Ostatní' })
    const { plan } = await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })
    expect(plan.plannedCount).toBe(1)
  })

  it('leaves out items that are already done', async () => {
    const product = await addProduct(`Hotovo ${tag}`)
    await addPrice(product, lidlId, 10, 10, 'ks')
    await addItem(`hotovo ${tag}`, 1, 'ks', { done: true })
    const { plan } = await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })
    expect(plan.needCount).toBe(0)
  })

  it('falls back to the automatic pick, and says so, when a pinned product lost its price', async () => {
    const pinnedProduct = await addProduct(`Džem ${tag} vybraný`)
    const other = await addProduct(`Džem ${tag} jiný`)
    await addPrice(pinnedProduct, lidlId, 50, 50, 'ks')
    await addPrice(other, lidlId, 60, 60, 'ks')
    const itemId = await addItem(`dzem ${tag}`, 1, 'ks')
    await pinProductAction({ itemId, storeId: lidlId, productId: pinnedProduct })
    await db.delete(schema.prices).where(eq(schema.prices.productId, pinnedProduct))

    const { plan } = await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })
    expect(linesOf(plan)[0]).toMatchObject({ productId: other, source: 'auto' })
    expect(plan.notes.join(' ')).toContain('připnutý produkt')
  })

  it('rejects a store count outside 1-6 and a malformed request', async () => {
    for (const bad of [0, 7, 2.5]) await expect(buildShoppingPlanAction({ maxStores: bad, priorityChainIds: [] })).rejects.toThrow('celé číslo od 1 do 6')
    await expect(buildShoppingPlanAction({ maxStores: 2, priorityChainIds: 'x' as unknown as string[] })).rejects.toThrow('Neplatný požadavek')
  })

  it('plans only the caller\'s household\'s items, and covers all of its lists', async () => {
    const mine = await addProduct(`Moje ${tag}`)
    const mineToo = await addProduct(`Druhé ${tag}`)
    const theirs = await addProduct(`Cizí ${tag}`)
    for (const product of [mine, mineToo, theirs]) await addPrice(product, lidlId, 10, 10, 'ks')
    await addItem(`moje ${tag}`, 1, 'ks')
    // A second list of the same household is planned too ...
    const [secondList] = await db.insert(schema.shoppingLists).values({ householdId: session.householdId, name: 'Druhý' }).returning()
    await db.insert(schema.shoppingListItems).values({ listId: secondList.id, name: `druhe ${tag}`, category: 'Potraviny' })
    // ... another household's list never is.
    const [otherList] = await db.query.shoppingLists.findMany({ where: eq(schema.shoppingLists.householdId, otherHouseholdId) })
    await db.insert(schema.shoppingListItems).values({ listId: otherList.id, name: `cizi ${tag}`, category: 'Potraviny' })

    const { plan } = await buildShoppingPlanAction({ maxStores: 1, priorityChainIds: [] })
    expect(linesOf(plan).map((line) => line.name).sort()).toEqual([`druhe ${tag}`, `moje ${tag}`].sort())
    expect(plan.needCount).toBe(2)
    await db.delete(schema.shoppingLists).where(eq(schema.shoppingLists.id, secondList.id))
  })
})

describe('pinning', () => {
  it('replaces the pin for the same item and chain, and keeps one pin per item and chain', async () => {
    const a = await addProduct(`Med ${tag} a`)
    const b = await addProduct(`Med ${tag} b`)
    await addPrice(a, lidlId, 10, 10, 'ks')
    await addPrice(b, lidlId, 20, 20, 'ks')
    const itemId = await addItem(`med ${tag}`, 1, 'ks')
    await pinProductAction({ itemId, storeId: lidlId, productId: a })
    await pinProductAction({ itemId, storeId: lidlId, productId: b })
    expect((await getPinsForItems(session.householdId, [itemId])).get(itemId)?.get(lidlId)).toBe(b)
    expect(await db.query.shoppingListItemPins.findMany({ where: eq(schema.shoppingListItemPins.itemId, itemId) })).toHaveLength(1)
  })

  it('refuses a product the chain has no price for', async () => {
    const product = await addProduct(`Nikde ${tag}`)
    await addPrice(product, lidlId, 10, 10, 'ks')
    const itemId = await addItem(`nikde ${tag}`, 1, 'ks')
    await expect(pinProductAction({ itemId, storeId: billaId, productId: product })).rejects.toThrow('nemá v tomto obchodě cenu')
    expect((await getPinsForItems(session.householdId, [itemId])).size).toBe(0)
  })

  it('never lets one household pin or unpin another household\'s item', async () => {
    const product = await addProduct(`Cizí ${tag}`)
    await addPrice(product, lidlId, 10, 10, 'ks')
    await expect(pinProductAction({ itemId: otherItemId, storeId: lidlId, productId: product })).rejects.toThrow('Položka nenalezena.')
    await expect(unpinProductAction({ itemId: otherItemId, storeId: lidlId })).rejects.toThrow('Položka nenalezena.')
    expect(await db.query.shoppingListItemPins.findMany({ where: eq(schema.shoppingListItemPins.itemId, otherItemId) })).toHaveLength(0)
  })

  it('does not return pins of another household\'s items', async () => {
    const product = await addProduct(`Skrytý ${tag}`)
    await addPrice(product, lidlId, 10, 10, 'ks')
    await db.insert(schema.shoppingListItemPins).values({ itemId: otherItemId, storeId: lidlId, productId: product })
    expect((await getPinsForItems(session.householdId, [otherItemId])).size).toBe(0)
  })

  it('removes a pin together with its item, and unpinning something not pinned is harmless', async () => {
    const product = await addProduct(`Zmizí ${tag}`)
    await addPrice(product, lidlId, 10, 10, 'ks')
    const itemId = await addItem(`zmizi ${tag}`, 1, 'ks')
    await unpinProductAction({ itemId, storeId: lidlId }) // nothing pinned: no error
    await pinProductAction({ itemId, storeId: lidlId, productId: product })
    await db.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, itemId))
    expect(await db.query.shoppingListItemPins.findMany({ where: eq(schema.shoppingListItemPins.itemId, itemId) })).toHaveLength(0)
  })
})
