import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { findProductIdByExternalRef, getCanonicalStoreLocationId, getHouseholdData, joinHouseholdViaInvitation, loadExternalProductContext, resolveOrCreateProductFromExternal, touchExternalRefs, upsertActiveDeal } from '@/lib/db/queries'

// Regression coverage for the "household events" notification work (docs/07_CHANGELOG.md,
// 2026-09-21) and for the join-via-invitation logic itself, which docs/01_CURRENT_STATE.md
// flagged as having no automated tests. Runs against the real dev database — everything it
// creates is deleted in afterAll. household_members.user_id has a foreign key to neon_auth.user and
// is unique (one account, one household), so tests that need a member create a throwaway
// neon_auth user (createTempAuthUser below) and delete it afterwards, rather than borrowing the
// real signed-in account, which already belongs to a household.
const db = getDb()

const createdHouseholdIds: string[] = []

afterAll(async () => {
  for (const householdId of createdHouseholdIds) {
    await db.delete(schema.notifications).where(eq(schema.notifications.householdId, householdId))
    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, householdId))
    await db.delete(schema.invitations).where(eq(schema.invitations.householdId, householdId))
    await db.delete(schema.households).where(eq(schema.households.id, householdId))
  }
})

async function makeInvitation() {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_join__' }).returning()
  createdHouseholdIds.push(household.id)
  const [invitation] = await db
    .insert(schema.invitations)
    .values({ householdId: household.id, email: 'join-test@example.com', token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) })
    .returning()
  return { household, invitation }
}

describe('joinHouseholdViaInvitation', () => {
  it('creates a member row, marks the invitation accepted, and does both for the right household', async () => {
    const { household, invitation } = await makeInvitation()
    // A throwaway account: the real dev user already has a household, and one account can only
    // belong to one (unique index, migration 0014).
    const { userId } = await createTempAuthUser()
    try {
      const joined = await joinHouseholdViaInvitation(userId, 'Testovací Uživatel', invitation)
      expect(joined.id).toBe(household.id)

      const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.householdId, household.id) })
      expect(member?.userId).toBe(userId)
      expect(member?.role).toBe('member')

      const updatedInvitation = await db.query.invitations.findFirst({ where: eq(schema.invitations.id, invitation.id) })
      expect(updatedInvitation?.status).toBe('accepted')
    } finally {
      await deleteTempAuthUser(userId, [])
    }
  })

  it('raises a household-events notification naming the person who joined', async () => {
    const { household, invitation } = await makeInvitation()
    const { userId } = await createTempAuthUser()
    try {
      await joinHouseholdViaInvitation(userId, 'Nový Člen', invitation)

      const notifications = await db.query.notifications.findMany({ where: eq(schema.notifications.householdId, household.id) })
      expect(notifications).toHaveLength(1)
      expect(notifications[0].title).toBe('Nový člen domácnosti')
      expect(notifications[0].detail).toContain('Nový Člen')
    } finally {
      await deleteTempAuthUser(userId, [])
    }
  })
})

// Coverage for the Lidl price-ingestion resolve/persist helpers (docs/01_CURRENT_STATE.md section
// 15, added 2026-09-23). `products.name` is unique and global (not household-scoped) — every test
// here uses a random throwaway name and cleans up its own product row afterward.
// A signed-in page render and a `router.refresh()` (or React's dev double render) can both reach
// `getHouseholdData` for a brand-new account before either has finished creating its household.
// Found in a real browser pass: one sign-up produced two "Domácnost – <name>" households, and
// because `household_members.user_id` was not unique, `findFirst(userId)` could then return
// either of them. The contract: one account -> exactly one household, however many requests race.
async function createTempAuthUser() {
  const name = `Souběh ${crypto.randomUUID().slice(0, 8)}`
  const email = `race-test-${crypto.randomUUID()}@example.com`
  const result = await db.execute<{ id: string }>(sql`insert into neon_auth."user" (name, email, "emailVerified") values (${name}, ${email}, false) returning id`)
  return { userId: result.rows[0].id, name, email }
}

async function deleteTempAuthUser(userId: string, householdIds: string[]) {
  for (const id of householdIds) await db.delete(schema.households).where(eq(schema.households.id, id)) // cascades to members/lists/preferences
  await db.execute(sql`delete from neon_auth."user" where id = ${userId}`)
}

describe('one account, one household under concurrency', () => {
  it('getHouseholdData creates exactly one household when several first-login renders race', async () => {
    const { userId, name, email } = await createTempAuthUser()
    let householdIds: string[] = []
    try {
      const results = await Promise.all(Array.from({ length: 6 }, () => getHouseholdData(userId, name, email)))
      householdIds = (await db.query.households.findMany({ where: eq(schema.households.name, `Domácnost – ${name}`) })).map((row) => row.id)

      expect(new Set(results.map((result) => result.household.id)).size).toBe(1)
      expect(householdIds).toHaveLength(1) // no orphan households left behind by the requests that lost the race
      const members = await db.query.householdMembers.findMany({ where: eq(schema.householdMembers.userId, userId) })
      expect(members).toHaveLength(1)
      expect(members[0].role).toBe('owner')
      expect(results.every((result) => result.shoppingLists.length > 0)).toBe(true) // the loser must not see a half-built household
    } finally {
      await deleteTempAuthUser(userId, householdIds)
    }
  }, 60_000)

  it('joinHouseholdViaInvitation puts a user in the invited household once when two joins race', async () => {
    const { household, invitation } = await makeInvitation()
    const { userId, name } = await createTempAuthUser()
    try {
      const joined = await Promise.all([joinHouseholdViaInvitation(userId, name, invitation), joinHouseholdViaInvitation(userId, name, invitation)])
      expect(joined.map((row) => row.id)).toEqual([household.id, household.id])
      const members = await db.query.householdMembers.findMany({ where: eq(schema.householdMembers.userId, userId) })
      expect(members).toHaveLength(1)
    } finally {
      await deleteTempAuthUser(userId, [])
    }
  }, 60_000)

  it('the database itself refuses a second household membership for the same account', async () => {
    const { userId, name } = await createTempAuthUser()
    const created: string[] = []
    try {
      for (let i = 0; i < 2; i += 1) {
        const [household] = await db.insert(schema.households).values({ name: `__test_unique_member_${i}__` }).returning()
        created.push(household.id)
      }
      await db.insert(schema.householdMembers).values({ householdId: created[0], userId, name, role: 'owner' })
      await expect(db.insert(schema.householdMembers).values({ householdId: created[1], userId, name, role: 'member' })).rejects.toThrow()
    } finally {
      await deleteTempAuthUser(userId, created)
    }
  }, 60_000)
})

describe('resolveOrCreateProductFromExternal', () => {
  it('creates a new product and external ref on first sight, reusing them on a repeat call with the same externalId', async () => {
    const externalId = `__test_erp_${crypto.randomUUID()}`
    const name = `__test_external_product_${crypto.randomUUID()}`

    const firstId = await resolveOrCreateProductFromExternal({ externalId, source: 'lidl', name, category: 'Potraviny', unit: 'ks' })
    const secondId = await resolveOrCreateProductFromExternal({ externalId, source: 'lidl', name, category: 'Potraviny', unit: 'ks' })

    expect(secondId).toBe(firstId)
    expect(await findProductIdByExternalRef('lidl', externalId)).toBe(firstId)

    const productRow = await db.query.products.findFirst({ where: eq(schema.products.id, firstId) })
    expect(productRow?.name).toBe(name)

    await db.delete(schema.products).where(eq(schema.products.id, firstId)) // cascades to product_external_refs
  })

  it('attaches to an existing catalog product by exact name instead of creating a duplicate', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const name = `__test_existing_product_${crypto.randomUUID()}`
    const [existingProduct] = await db.insert(schema.products).values({ name, categoryId: category!.id, defaultUnit: 'kg' }).returning()

    const externalId = `__test_erp_${crypto.randomUUID()}`
    const resolvedId = await resolveOrCreateProductFromExternal({ externalId, source: 'lidl', name, category: 'Potraviny', unit: 'kg' })

    expect(resolvedId).toBe(existingProduct.id)
    const allWithThatName = await db.query.products.findMany({ where: eq(schema.products.name, name) })
    expect(allWithThatName).toHaveLength(1) // no duplicate created

    await db.delete(schema.products).where(eq(schema.products.id, existingProduct.id))
  })
})

describe('ingestion lookup context', () => {
  it('loads the source\'s refs, the catalog and the category ids in one go', async () => {
    const context = await loadExternalProductContext('lidl')
    expect(context.categoryIds.has('Potraviny')).toBe(true)
    expect(context.catalog.length).toBeGreaterThan(0)
    // Only this source's refs are in the map: every id in it resolves to a real product.
    const [anyRef] = context.refs.entries()
    if (anyRef) expect(await findProductIdByExternalRef('lidl', anyRef[0])).toBe(anyRef[1])
  })

  it('resolves with a shared context, updating it so a later product in the same run sees the earlier one', async () => {
    const context = await loadExternalProductContext('lidl')
    const externalId = `__test_erp_${crypto.randomUUID()}`
    const name = `__test_context_product_${crypto.randomUUID()}`
    const product = { externalId, source: 'lidl' as const, name, category: 'Potraviny' as const, unit: 'ks' as const }

    const firstId = await resolveOrCreateProductFromExternal(product, context)
    expect(context.refs.get(externalId)).toBe(firstId)
    expect(context.catalog.some((entry) => entry.id === firstId && entry.name === name)).toBe(true)

    // A repeat resolves from the context alone: no second product, same id.
    const secondId = await resolveOrCreateProductFromExternal(product, context)
    expect(secondId).toBe(firstId)
    expect(await db.query.products.findMany({ where: eq(schema.products.name, name) })).toHaveLength(1)

    await db.delete(schema.products).where(eq(schema.products.id, firstId)) // cascades to product_external_refs
  })

  it('rejects an unknown category rather than inserting a product without one', async () => {
    const context = await loadExternalProductContext('lidl')
    const name = `__test_bad_category_${crypto.randomUUID()}`
    await expect(
      resolveOrCreateProductFromExternal({ externalId: `__test_erp_${crypto.randomUUID()}`, source: 'lidl', name, category: '__nope__' as never, unit: 'ks' }, context),
    ).rejects.toThrow('Unknown product category')
    expect(await db.query.products.findMany({ where: eq(schema.products.name, name) })).toHaveLength(0)
  })

  it('touchExternalRefs refreshes last_seen_at for the given ids only', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const [product] = await db.insert(schema.products).values({ name: `__test_touch_${crypto.randomUUID()}`, categoryId: category!.id }).returning()
    const old = new Date('2020-01-01T00:00:00Z')
    const touchedId = `__test_erp_${crypto.randomUUID()}`
    const untouchedId = `__test_erp_${crypto.randomUUID()}`
    await db.insert(schema.productExternalRefs).values([
      { productId: product.id, source: 'lidl', externalId: touchedId, lastSeenAt: old },
      { productId: product.id, source: 'lidl', externalId: untouchedId, lastSeenAt: old },
    ])

    await touchExternalRefs('lidl', [touchedId])
    const refs = await db.query.productExternalRefs.findMany({ where: eq(schema.productExternalRefs.productId, product.id) })
    expect(refs.find((ref) => ref.externalId === touchedId)!.lastSeenAt.getTime()).toBeGreaterThan(old.getTime())
    expect(refs.find((ref) => ref.externalId === untouchedId)!.lastSeenAt.getTime()).toBe(old.getTime())

    await touchExternalRefs('lidl', []) // an empty batch is a no-op, not an error
    await db.delete(schema.products).where(eq(schema.products.id, product.id))
  })
})

describe('getCanonicalStoreLocationId', () => {
  it('returns a real seeded location id for a known chain', async () => {
    const locationId = await getCanonicalStoreLocationId('Lidl')
    const location = await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.id, locationId) })
    expect(location).toBeDefined()
  })

  it('throws for a chain with no seeded store, rather than silently returning nothing', async () => {
    await expect(getCanonicalStoreLocationId('__no_such_chain__')).rejects.toThrow()
  })
})

describe('upsertActiveDeal', () => {
  it('creates a new deal row, then updates the same row on a repeat call instead of duplicating it', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const name = `__test_deal_product_${crypto.randomUUID()}`
    const [product] = await db.insert(schema.products).values({ name, categoryId: category!.id }).returning()
    const storeLocationId = await getCanonicalStoreLocationId('Lidl')

    await upsertActiveDeal({ productId: product.id, storeLocationId, dealPrice: 19.9, validFrom: '2026-09-01', validUntil: '2099-01-01' })
    await upsertActiveDeal({ productId: product.id, storeLocationId, dealPrice: 15.9, validFrom: '2026-09-10', validUntil: '2099-01-01' })

    const deals = await db.query.deals.findMany({ where: eq(schema.deals.productId, product.id) })
    expect(deals).toHaveLength(1)
    expect(Number(deals[0].dealPrice)).toBe(15.9)

    await db.delete(schema.deals).where(inArray(schema.deals.id, deals.map((d) => d.id)))
    await db.delete(schema.products).where(eq(schema.products.id, product.id))
  })
})
