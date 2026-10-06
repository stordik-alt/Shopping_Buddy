import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { announceNewFlyers } from '@/lib/db/deal-announcements'
import * as schema from '@/lib/db/schema'

// New flyer notifications against the test database (local PostgreSQL). Dated far ahead so no other
// deals fall into the window; the throwaway stores, products and households are removed afterwards.
const db = getDb()
const TODAY = '2031-03-10'

describe('announceNewFlyers', () => {
  it('notifies only the households that chose the chain, once, and never for an online shop', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const [flyerChain, onlineChain] = await db
      .insert(schema.stores)
      .values([{ chain: `__test Leták ${suffix}` }, { chain: `__test Online ${suffix}`, isOnline: true }])
      .returning()
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const products = await db
      .insert(schema.products)
      .values(Array.from({ length: 31 }, (_, i) => ({ name: `__test flyer product ${suffix} ${i}`, categoryId: category!.id })))
      .returning({ id: schema.products.id })
    const deal = (storeId: string, productId: string) => ({ storeId, productId, dealPrice: '10', validFrom: '2031-03-12', validUntil: '2031-03-18' })
    await db.insert(schema.deals).values([...products.map((p) => deal(flyerChain.id, p.id)), ...products.map((p) => deal(onlineChain.id, p.id))])

    const households = await db
      .insert(schema.households)
      .values([{ name: '__test_household_flyer_member__' }, { name: '__test_household_flyer_pref__' }, { name: '__test_household_flyer_none__' }])
      .returning()
    const [byMember, byPreference, none] = households
    try {
      const [member] = await db.insert(schema.householdMembers).values({ householdId: byMember.id, name: 'Test' }).returning()
      await db.insert(schema.memberStores).values({ memberId: member.id, storeId: flyerChain.id })
      await db.insert(schema.preferences).values({ householdId: byPreference.id, preferredStores: [flyerChain.chain.toUpperCase()] })

      const run = await announceNewFlyers(TODAY)
      expect(run.flyers).toEqual([{ chain: flyerChain.chain, validFrom: '2031-03-12', deals: 31, households: 2 }])
      const notes = await db.query.notifications.findMany({ where: inArray(schema.notifications.householdId, households.map((h) => h.id)) })
      expect(notes.map((note) => [note.householdId, note.title, note.kind]).sort()).toEqual(
        [[byMember.id, `Nové akce v ${flyerChain.chain}`, 'new_deals'], [byPreference.id, `Nové akce v ${flyerChain.chain}`, 'new_deals']].sort(),
      )
      expect(notes.some((note) => note.householdId === none.id)).toBe(false)

      // A second run the same morning (or the next) announces nothing again.
      expect((await announceNewFlyers(TODAY)).flyers).toEqual([])
      expect(await db.query.notifications.findMany({ where: inArray(schema.notifications.householdId, households.map((h) => h.id)) })).toHaveLength(2)
    } finally {
      await db.delete(schema.households).where(inArray(schema.households.id, households.map((h) => h.id)))
      await db.delete(schema.stores).where(inArray(schema.stores.id, [flyerChain.id, onlineChain.id]))
      await db.delete(schema.products).where(inArray(schema.products.id, products.map((p) => p.id)))
    }
  })
})
