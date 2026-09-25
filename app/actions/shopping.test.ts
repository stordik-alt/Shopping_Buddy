import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getProductCatalog, getProductPrices } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'
import { assessDealQuality } from '@/lib/prices'
import { addShoppingItemAction, removeShoppingItemAction, toggleShoppingItemAction } from '@/app/actions/shopping'

// Integration coverage for the household-scoping gap noted in docs/01_CURRENT_STATE.md ("Server
// Actions and the auto-provision/auto-join logic ... still have no automated tests"). Runs
// against a real database — the separate test branch (TEST_DATABASE_URL, see
// test/setup-test-database.ts), not a mock, so it actually exercises the same Drizzle queries production traffic does. Everything it
// writes is scoped to households created and deleted within this file.
//
// Two things a Server Action does that can't run outside a real Next.js request need mocking:
// `requireHouseholdId()` reads a session cookie that doesn't exist in a test process, and
// `revalidatePath()` throws outside Next's request-scoped cache store. Both are mocked below;
// everything else (authorization checks, DB writes, notification logic) is the real code.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const db = getDb()

let householdId: string
let listId: string
let otherHouseholdId: string
let otherListId: string

beforeAll(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_shopping__' }).returning()
  const [list] = await db.insert(schema.shoppingLists).values({ householdId: household.id, name: 'Test list' }).returning()
  householdId = household.id
  listId = list.id
  currentHouseholdId = householdId

  const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_shopping_other__' }).returning()
  const [otherList] = await db.insert(schema.shoppingLists).values({ householdId: otherHousehold.id, name: 'Other list' }).returning()
  otherHouseholdId = otherHousehold.id
  otherListId = otherList.id
})

afterAll(async () => {
  await db.delete(schema.notifications).where(eq(schema.notifications.householdId, householdId))
  await db.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.listId, listId))
  await db.delete(schema.shoppingLists).where(eq(schema.shoppingLists.id, listId))
  await db.delete(schema.households).where(eq(schema.households.id, householdId))
  await db.delete(schema.shoppingLists).where(eq(schema.shoppingLists.id, otherListId))
  await db.delete(schema.households).where(eq(schema.households.id, otherHouseholdId))
})

describe('addShoppingItemAction', () => {
  it('adds an item to a list the caller\'s household actually owns', async () => {
    currentHouseholdId = householdId
    const { item } = await addShoppingItemAction(listId, 'Testovací položka')
    expect(item.name).toBe('Testovací položka')

    const row = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, item.id) })
    expect(row?.listId).toBe(listId)
  })

  it('rejects a list that belongs to a different household, rather than trusting the client-supplied id', async () => {
    currentHouseholdId = householdId // caller is household A
    await expect(addShoppingItemAction(otherListId, 'x')).rejects.toThrow('Shopping list not found')
  })

  it('fires the price/deal-alert notification for a product with a genuinely best-price deal, using real seeded catalog data', async () => {
    const products = await getProductPrices({ names: [], runningDeals: true })
    const bestDeal = assessDealQuality(products, todayInPrague()).find((assessment) => assessment.isBestPrice)
    if (!bestDeal) {
      // No currently-active best-price deal in the seeded catalog right now — nothing to assert
      // without inventing one, which docs/03_DATABASE.md forbids. Skip rather than fake it.
      return
    }
    currentHouseholdId = householdId
    const { notification } = await addShoppingItemAction(listId, bestDeal.product.productName)
    expect(notification).not.toBeNull()
    expect(notification?.title).toBe('Skvělá cena na vašem seznamu')
  })
})

describe('addShoppingItemAction — product identity', () => {
  it('resolves the real productId for a name matching the catalog, case/whitespace-insensitively', async () => {
    const catalog = await getProductCatalog()
    if (catalog.length === 0) return // nothing seeded to match against
    const [product] = catalog
    currentHouseholdId = householdId
    const { item } = await addShoppingItemAction(listId, `  ${product.name.toUpperCase()}  `)
    const row = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, item.id) })
    expect(row?.productId).toBe(product.id)
  })

  it('leaves productId null for a name with no catalog match, rather than guessing', async () => {
    currentHouseholdId = householdId
    const { item } = await addShoppingItemAction(listId, 'Zcela neznámá položka xyz123')
    const row = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, item.id) })
    expect(row?.productId).toBeNull()
  })

  it('uses the matched product\'s real category instead of the schema default, when no override is given', async () => {
    const catalog = await getProductCatalog()
    if (catalog.length === 0) return // nothing seeded to match against
    const [product] = catalog
    currentHouseholdId = householdId
    const { item } = await addShoppingItemAction(listId, product.name)
    expect(item.category).toBe(product.category)
  })

  it('uses the matched product\'s real unit instead of the schema default, when the product is known', async () => {
    const catalog = await getProductCatalog()
    const nonKsProduct = catalog.find((product) => product.defaultUnit !== 'ks')
    if (!nonKsProduct) return // nothing seeded with a non-'ks' unit to assert against
    currentHouseholdId = householdId
    const { item } = await addShoppingItemAction(listId, nonKsProduct.name)
    expect(item.unit).toBe(nonKsProduct.defaultUnit)
  })

  it('lets an explicit category override win over the matched product\'s category', async () => {
    const catalog = await getProductCatalog()
    const foodProduct = catalog.find((product) => product.category === 'Potraviny')
    if (!foodProduct) return // nothing seeded to match against
    currentHouseholdId = householdId
    const { item } = await addShoppingItemAction(listId, foodProduct.name, { category: 'Ostatní' })
    expect(item.category).toBe('Ostatní')
  })

  it('still fires the deal alert when the typed name differs in case/whitespace from the catalog', async () => {
    const products = await getProductPrices({ names: [], runningDeals: true })
    const bestDeal = assessDealQuality(products, todayInPrague()).find((assessment) => assessment.isBestPrice)
    if (!bestDeal) return // no currently-active best-price deal to test against; see note above
    currentHouseholdId = householdId
    const { notification } = await addShoppingItemAction(listId, `  ${bestDeal.product.productName.toUpperCase()}  `)
    expect(notification).not.toBeNull()
  })
})

describe('toggleShoppingItemAction / removeShoppingItemAction', () => {
  it('reject an item id that belongs to a different household', async () => {
    currentHouseholdId = otherHouseholdId
    const [item] = await db.insert(schema.shoppingListItems).values({ listId, name: 'Cizí položka' }).returning()
    try {
      await expect(toggleShoppingItemAction(item.id, true)).rejects.toThrow('Shopping list item not found')
      await expect(removeShoppingItemAction(item.id)).rejects.toThrow('Shopping list item not found')
    } finally {
      await db.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, item.id))
    }
  })

  it('let the owning household toggle and remove its own item', async () => {
    currentHouseholdId = householdId
    const { item } = await addShoppingItemAction(listId, 'Ke smazání')
    await toggleShoppingItemAction(item.id, true)
    const toggled = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, item.id) })
    expect(toggled?.done).toBe(true)

    await removeShoppingItemAction(item.id)
    const removed = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, item.id) })
    expect(removed).toBeUndefined()
  })
})
