import { eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { findProductIdByExternalRef, getCanonicalStoreLocationId, joinHouseholdViaInvitation, resolveOrCreateProductFromExternal, upsertActiveDeal } from '@/lib/db/queries'

// Regression coverage for the "household events" notification work (docs/07_CHANGELOG.md,
// 2026-09-21) and for the join-via-invitation logic itself, which docs/01_CURRENT_STATE.md
// flagged as having no automated tests. Runs against the real dev database — everything it
// creates is deleted in afterAll. Needs a real neon_auth user id to satisfy
// household_members.user_id's foreign key; reuses whichever account is already signed in to this
// dev database rather than fabricating one (there is no local `users` table to insert into).
const db = getDb()

async function anyRealUserId(): Promise<string> {
  const result = await db.execute<{ id: string }>(`select id from neon_auth."user" limit 1`)
  const row = result.rows[0]
  if (!row) throw new Error('No neon_auth user exists in this database to run this test against')
  return row.id
}

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
    const userId = await anyRealUserId()

    const joined = await joinHouseholdViaInvitation(userId, 'Testovací Uživatel', invitation)
    expect(joined.id).toBe(household.id)

    const member = await db.query.householdMembers.findFirst({ where: eq(schema.householdMembers.householdId, household.id) })
    expect(member?.userId).toBe(userId)
    expect(member?.role).toBe('member')

    const updatedInvitation = await db.query.invitations.findFirst({ where: eq(schema.invitations.id, invitation.id) })
    expect(updatedInvitation?.status).toBe('accepted')

    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, household.id)) // don't leave this user in two households for later tests/real usage
  })

  it('raises a household-events notification naming the person who joined', async () => {
    const { household, invitation } = await makeInvitation()
    const userId = await anyRealUserId()

    await joinHouseholdViaInvitation(userId, 'Nový Člen', invitation)

    const notifications = await db.query.notifications.findMany({ where: eq(schema.notifications.householdId, household.id) })
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Nový člen domácnosti')
    expect(notifications[0].detail).toContain('Nový Člen')

    await db.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, household.id))
  })
})

// Coverage for the Lidl price-ingestion resolve/persist helpers (docs/01_CURRENT_STATE.md section
// 15, added 2026-09-23). `products.name` is unique and global (not household-scoped) — every test
// here uses a random throwaway name and cleans up its own product row afterward.
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
