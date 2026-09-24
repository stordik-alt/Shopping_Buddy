import { asc, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { splitCollapsedExternalProducts } from '@/lib/db/split-collapsed-products'
import { findProductIdByExternalRef, getCanonicalStoreLocationId, getHouseholdData, getProductPrices, getStoreByChain, getStoreIdByChain, joinHouseholdViaInvitation, loadExternalProductContext, loadLatestOfficialPrices, recordOfficialPrice, resolveOrCreateProductFromExternal, touchExternalRefs, upsertActiveDeal } from '@/lib/db/queries'

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

// Regression: Penny lists several flavours as "Raw tyčinka Crip Crop" and Lidl several sizes as
// "Olivový olej extra panenský". Matching by name alone merged those distinct SKUs into one product,
// mixing their prices and overwriting each other's promotions.
describe('resolveOrCreateProductFromExternal keeps a source\'s SKUs apart', () => {
  const cleanup = async (ids: string[]) => {
    await db.delete(schema.products).where(inArray(schema.products.id, ids))
  }

  it('gives two SKUs of the same source and name their own products, stably across runs', async () => {
    const name = `__test_same_name_${crypto.randomUUID()}`
    const skuA = `__test_erp_a_${crypto.randomUUID()}`
    const skuB = `__test_erp_b_${crypto.randomUUID()}`
    const make = (externalId: string) => ({ externalId, source: 'penny' as const, name, category: 'Potraviny' as const, unit: 'ks' as const })

    const context = await loadExternalProductContext('penny')
    const idA = await resolveOrCreateProductFromExternal(make(skuA), context)
    const idB = await resolveOrCreateProductFromExternal(make(skuB), context)
    try {
      expect(idB).not.toBe(idA)
      const [productA, productB] = await Promise.all([db.query.products.findFirst({ where: eq(schema.products.id, idA) }), db.query.products.findFirst({ where: eq(schema.products.id, idB) })])
      expect(productA?.name).toBe(name)
      expect(productB?.name).toBe(`${name} (${skuB})`) // distinct by its SKU

      // A later run (fresh context) resolves each SKU to its own product again, creating nothing new.
      const again = await loadExternalProductContext('penny')
      expect(await resolveOrCreateProductFromExternal(make(skuA), again)).toBe(idA)
      expect(await resolveOrCreateProductFromExternal(make(skuB), again)).toBe(idB)
      expect(await findProductIdByExternalRef('penny', skuA)).toBe(idA)
      expect(await findProductIdByExternalRef('penny', skuB)).toBe(idB)
    } finally {
      await cleanup([idA, idB])
    }
  })

  it('does the same when each SKU is resolved without a shared context (one-off callers)', async () => {
    const name = `__test_same_name_${crypto.randomUUID()}`
    const make = (externalId: string) => ({ externalId, source: 'lidl' as const, name, category: 'Potraviny' as const, unit: 'kg' as const })
    const idA = await resolveOrCreateProductFromExternal(make(`__test_erp_a_${crypto.randomUUID()}`))
    const idB = await resolveOrCreateProductFromExternal(make(`__test_erp_b_${crypto.randomUUID()}`))
    try {
      expect(idB).not.toBe(idA)
    } finally {
      await cleanup([idA, idB])
    }
  })

  it('still links the same-named product of a different source (one product, several stores)', async () => {
    const name = `__test_cross_store_${crypto.randomUUID()}`
    const billaSku = `__test_erp_billa_${crypto.randomUUID()}`
    const pennySku = `__test_erp_penny_${crypto.randomUUID()}`
    const billaId = await resolveOrCreateProductFromExternal({ externalId: billaSku, source: 'billa', name, category: 'Potraviny', unit: 'ks' })
    const pennyId = await resolveOrCreateProductFromExternal({ externalId: pennySku, source: 'penny', name, category: 'Potraviny', unit: 'ks' })
    try {
      expect(pennyId).toBe(billaId)
    } finally {
      await cleanup([billaId])
    }
  })
})

describe('splitCollapsedExternalProducts', () => {
  it('reports in a dry run, then splits SKUs merged into one product, moving their prices, idempotently', async () => {
    const store = await db.query.stores.findFirst({ where: eq(schema.stores.chain, 'dm') })
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const name = `__test_collapsed_${crypto.randomUUID()}`
    const [original] = await db.insert(schema.products).values({ name, categoryId: category!.id, defaultUnit: 'kg' }).returning()
    const skuA = `__test_sku_a_${crypto.randomUUID()}`
    const skuB = `__test_sku_b_${crypto.randomUUID()}`
    await db.insert(schema.productExternalRefs).values([
      { productId: original.id, source: 'lidl', externalId: skuA },
      { productId: original.id, source: 'lidl', externalId: skuB },
    ])
    const price = (sourceReference: string, regularPrice: string) => ({
      productId: original.id,
      storeId: store!.id,
      priceScope: 'CHAIN' as const,
      sourceType: 'OFFICIAL' as const,
      locationResolution: 'NOT_APPLICABLE' as const,
      regularPrice,
      unit: 'kg' as const,
      unitPrice: regularPrice,
      observedAt: '2026-09-24',
      validFrom: '2026-09-24',
      sourceReference,
    })
    await db.insert(schema.prices).values([price(skuA, '10'), price(skuB, '20')])
    const splitName = `${name} (${skuB})`

    try {
      // Dry run: reports the plan, changes nothing.
      const dry = await splitCollapsedExternalProducts({ apply: false, onlyProductIds: [original.id] })
      expect(dry.groups).toHaveLength(1)
      expect(dry.groups[0]).toMatchObject({ productId: original.id, keep: skuA })
      expect(dry.groups[0].split.map((part) => part.externalId)).toEqual([skuB])
      expect(await db.query.products.findFirst({ where: eq(schema.products.name, splitName) })).toBeUndefined()

      const applied = await splitCollapsedExternalProducts({ apply: true, onlyProductIds: [original.id] })
      expect(applied).toMatchObject({ productsCreated: 1, refsMoved: 1, pricesMoved: 1 })

      const created = await db.query.products.findFirst({ where: eq(schema.products.name, splitName) })
      expect(created).toMatchObject({ categoryId: category!.id, defaultUnit: 'kg' })
      expect(await findProductIdByExternalRef('lidl', skuA)).toBe(original.id) // the kept SKU stays
      expect(await findProductIdByExternalRef('lidl', skuB)).toBe(created!.id)
      const originalPrices = await db.query.prices.findMany({ where: eq(schema.prices.productId, original.id) })
      const createdPrices = await db.query.prices.findMany({ where: eq(schema.prices.productId, created!.id) })
      expect(originalPrices.map((row) => row.sourceReference)).toEqual([skuA])
      expect(createdPrices.map((row) => row.sourceReference)).toEqual([skuB])
      expect(Number(createdPrices[0].regularPrice)).toBe(20) // the price moved with its SKU, unchanged

      // Idempotent: nothing is collapsed any more, so a re-run does nothing.
      const rerun = await splitCollapsedExternalProducts({ apply: true, onlyProductIds: [original.id, created!.id] })
      expect(rerun.groups).toHaveLength(0)
      expect(rerun).toMatchObject({ productsCreated: 0, refsMoved: 0, pricesMoved: 0 })
    } finally {
      await db.delete(schema.products).where(inArray(schema.products.name, [name, splitName])) // cascades to refs and prices
    }
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

describe('recordOfficialPrice', () => {
  // Uses the seeded `dm` chain and a throwaway product; deleting the product cascades to its prices.
  async function setup() {
    const store = await db.query.stores.findFirst({ where: eq(schema.stores.chain, 'dm') })
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Drogerie') })
    const [product] = await db.insert(schema.products).values({ name: `__test_official_${crypto.randomUUID()}`, categoryId: category!.id }).returning()
    const sourceReference = `__test_sku_${crypto.randomUUID()}`
    const observation = (observedAt: string, regularPrice: number, unitPrice = regularPrice * 10) => ({
      productId: product.id,
      storeId: store!.id,
      sourceReference,
      regularPrice,
      currency: 'CZK',
      unit: 'kg' as const,
      unitPrice,
      observedAt,
    })
    const rows = () => db.query.prices.findMany({ where: eq(schema.prices.productId, product.id), orderBy: asc(schema.prices.observedAt) })
    return { store: store!, product, sourceReference, observation, rows, cleanup: () => db.delete(schema.products).where(eq(schema.products.id, product.id)) }
  }

  it('stores the first observation as an open CHAIN/OFFICIAL price valid from its date', async () => {
    const t = await setup()
    try {
      const result = await recordOfficialPrice(t.observation('2026-09-20', 50), undefined)
      expect(result).toMatchObject({ action: 'insert', closedPrevious: false })
      const [row] = await t.rows()
      expect(row).toMatchObject({ priceScope: 'CHAIN', sourceType: 'OFFICIAL', storeLocationId: null, observedAt: '2026-09-20', validFrom: '2026-09-20', validUntil: null, sourceReference: t.sourceReference })
      expect(Number(row.regularPrice)).toBe(50)
    } finally {
      await t.cleanup()
    }
  })

  it('a repeat the same day writes nothing when identical and refreshes the one row when the values differ', async () => {
    const t = await setup()
    try {
      const first = await recordOfficialPrice(t.observation('2026-09-20', 50), undefined)
      const same = await recordOfficialPrice(t.observation('2026-09-20', 50), first.latest)
      expect(same.action).toBe('unchanged')
      const changed = await recordOfficialPrice(t.observation('2026-09-20', 45), same.latest)
      expect(changed.action).toBe('update-same-day')
      const rows = await t.rows()
      expect(rows).toHaveLength(1) // never a duplicate for the same SKU and day
      expect(Number(rows[0].regularPrice)).toBe(45)
    } finally {
      await t.cleanup()
    }
  })

  it('keeps the previous price as an old price, closed with the date the new price was first seen', async () => {
    const t = await setup()
    try {
      const first = await recordOfficialPrice(t.observation('2026-09-20', 50), undefined)
      const second = await recordOfficialPrice(t.observation('2026-09-24', 45), first.latest)
      expect(second).toMatchObject({ action: 'insert', closedPrevious: true })
      const [old, current] = await t.rows()
      expect(Number(old.regularPrice)).toBe(50)
      expect(old.observedAt).toBe('2026-09-20')
      expect(old.validUntil).toBe('2026-09-24') // old price, with the date it ended
      expect(Number(current.regularPrice)).toBe(45)
      expect(current.validUntil).toBeNull() // the current price stays open
    } finally {
      await t.cleanup()
    }
  })

  it('adds a new day\'s observation without closing the previous one when the price is unchanged', async () => {
    const t = await setup()
    try {
      const first = await recordOfficialPrice(t.observation('2026-09-20', 50), undefined)
      const second = await recordOfficialPrice(t.observation('2026-09-24', 50), first.latest)
      expect(second).toMatchObject({ action: 'insert', closedPrevious: false })
      const rows = await t.rows()
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.validUntil)).toEqual([null, null])
    } finally {
      await t.cleanup()
    }
  })

  it('never lets an older observation displace a newer one', async () => {
    const t = await setup()
    try {
      const newer = await recordOfficialPrice(t.observation('2026-09-24', 45), undefined)
      const older = await recordOfficialPrice(t.observation('2026-09-10', 99), newer.latest)
      expect(older.action).toBe('stale')
      const rows = await t.rows()
      expect(rows).toHaveLength(1)
      expect(Number(rows[0].regularPrice)).toBe(45)
    } finally {
      await t.cleanup()
    }
  })

  it('loadLatestOfficialPrices returns the latest observation per SKU, with its close state', async () => {
    const t = await setup()
    try {
      const first = await recordOfficialPrice(t.observation('2026-09-20', 50), undefined)
      await recordOfficialPrice(t.observation('2026-09-24', 45), first.latest)
      const latest = (await loadLatestOfficialPrices(t.store.id)).get(t.sourceReference)
      expect(latest).toMatchObject({ observedAt: '2026-09-24', regularPrice: 45, unit: 'kg', currency: 'CZK', validUntil: null })
    } finally {
      await t.cleanup()
    }
  })

  it('the database itself refuses a second official observation for the same SKU and day', async (ctx) => {
    const index = await db.execute<{ indexname: string }>(sql`select indexname from pg_indexes where indexname = 'prices_official_daily_unique'`)
    if (index.rows.length === 0) ctx.skip() // migration 0018 not applied to this database yet
    const t = await setup()
    try {
      const values = {
        productId: t.product.id,
        storeId: t.store.id,
        priceScope: 'CHAIN' as const,
        sourceType: 'OFFICIAL' as const,
        locationResolution: 'NOT_APPLICABLE' as const,
        regularPrice: '50',
        unit: 'kg' as const,
        unitPrice: '500',
        observedAt: '2026-09-20',
        validFrom: '2026-09-20',
        sourceReference: t.sourceReference,
      }
      await db.insert(schema.prices).values(values)
      await expect(db.insert(schema.prices).values(values)).rejects.toThrow()
      // A racing writer that hits the index falls back to refreshing the existing row.
      const raced = await recordOfficialPrice(t.observation('2026-09-20', 45), undefined)
      expect(raced.action).toBe('update-same-day')
      expect(await t.rows()).toHaveLength(1)
      // Receipt-based observations are not covered by the index.
      await db.insert(schema.prices).values({ ...values, sourceType: 'RECEIPT', sourceReference: null, priceScope: 'STORE', locationResolution: 'UNKNOWN' })
      await db.insert(schema.prices).values({ ...values, sourceType: 'RECEIPT', sourceReference: null, priceScope: 'STORE', locationResolution: 'UNKNOWN' })
    } finally {
      await t.cleanup()
    }
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
    const storeId = await getStoreIdByChain('Lidl')

    await upsertActiveDeal({ productId: product.id, storeId, storeLocationId, dealPrice: 19.9, validFrom: '2026-09-01', validUntil: '2099-01-01' })
    await upsertActiveDeal({ productId: product.id, storeId, storeLocationId, dealPrice: 15.9, validFrom: '2026-09-10', validUntil: '2099-01-01' })

    const deals = await db.query.deals.findMany({ where: eq(schema.deals.productId, product.id) })
    expect(deals).toHaveLength(1)
    expect(Number(deals[0].dealPrice)).toBe(15.9)

    await db.delete(schema.deals).where(inArray(schema.deals.id, deals.map((d) => d.id)))
    await db.delete(schema.products).where(eq(schema.products.id, product.id))
  })

  describe('online-only chains (no branches)', () => {
    async function createOnlineStore() {
      const [store] = await db.insert(schema.stores).values({ chain: `__test_online_${crypto.randomUUID()}`, isOnline: true }).returning()
      return store
    }
    async function createProduct() {
      const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
      const [product] = await db.insert(schema.products).values({ name: `__test_online_deal_${crypto.randomUUID()}`, categoryId: category!.id }).returning()
      return product
    }

    it('reports whether a chain is online-only', async () => {
      expect((await getStoreByChain('Lidl')).isOnline).toBe(false)
      const store = await createOnlineStore()
      try {
        expect(await getStoreByChain(store.chain)).toEqual({ id: store.id, isOnline: true })
      } finally {
        await db.delete(schema.stores).where(eq(schema.stores.id, store.id))
      }
    })

    it('stores a chain-wide deal with no branch and updates it in place on a repeat call', async () => {
      const store = await createOnlineStore()
      const product = await createProduct()
      try {
        await upsertActiveDeal({ productId: product.id, storeId: store.id, storeLocationId: null, dealPrice: 19.9, validFrom: '2026-09-01', validUntil: '2099-01-01' })
        await upsertActiveDeal({ productId: product.id, storeId: store.id, storeLocationId: null, dealPrice: 15.9, validFrom: '2026-09-10', validUntil: '2099-01-01' })

        const deals = await db.query.deals.findMany({ where: eq(schema.deals.productId, product.id) })
        expect(deals).toHaveLength(1)
        expect(deals[0]).toMatchObject({ storeId: store.id, storeLocationId: null })
        expect(Number(deals[0].dealPrice)).toBe(15.9)
      } finally {
        await db.delete(schema.products).where(eq(schema.products.id, product.id))
        await db.delete(schema.stores).where(eq(schema.stores.id, store.id))
      }
    })

    it('refuses a deal whose branch belongs to a different chain than the deal says', async () => {
      const store = await createOnlineStore()
      const product = await createProduct()
      try {
        const lidlLocationId = await getCanonicalStoreLocationId('Lidl')
        await expect(
          db.insert(schema.deals).values({ productId: product.id, storeId: store.id, storeLocationId: lidlLocationId, dealPrice: '10', validFrom: '2026-09-01', validUntil: '2099-01-01' }),
        ).rejects.toThrow()
      } finally {
        await db.delete(schema.products).where(eq(schema.products.id, product.id))
        await db.delete(schema.stores).where(eq(schema.stores.id, store.id))
      }
    })

    it("shows an online chain's active deal on its chain-wide price", async () => {
      const store = await createOnlineStore()
      const product = await createProduct()
      try {
        await db.insert(schema.prices).values({
          productId: product.id,
          storeId: store.id,
          storeLocationId: null,
          priceScope: 'CHAIN',
          sourceType: 'OFFICIAL',
          locationResolution: 'NOT_APPLICABLE',
          regularPrice: '24.90',
          unit: 'ks',
          unitPrice: '24.90',
          observedAt: '2026-09-24',
          validFrom: '2026-09-24',
        })
        await upsertActiveDeal({ productId: product.id, storeId: store.id, storeLocationId: null, dealPrice: 16.9, validFrom: '2026-09-24', validUntil: '2099-01-01' })

        const found = (await getProductPrices()).find((entry) => entry.productName === product.name)
        expect(found?.prices).toHaveLength(1)
        expect(found?.prices[0]).toMatchObject({ regularPrice: 24.9, dealPrice: 16.9, dealValidUntil: '2099-01-01' })
      } finally {
        await db.delete(schema.products).where(eq(schema.products.id, product.id))
        await db.delete(schema.stores).where(eq(schema.stores.id, store.id))
      }
    })
  })
})
