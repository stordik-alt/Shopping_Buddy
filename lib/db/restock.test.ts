import { eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getRestockCandidates } from '@/lib/db/restock'
import * as schema from '@/lib/db/schema'
import type { StockLevel } from '@/lib/pantry-restock'
import type { PantryItem } from '@/lib/types'

// The database side of "Dokoupit do zásoby": which running promotions are read for the pantry rows near
// their minimum. Which one is worth suggesting is lib/pantry-restock.test.ts's job.
const db = getDb()
const today = '2026-10-11'
const productIds: string[] = []
const storeIds: string[] = []

afterAll(async () => {
  await db.delete(schema.deals).where(inArray(schema.deals.productId, productIds))
  await db.delete(schema.prices).where(inArray(schema.prices.productId, productIds))
  await db.delete(schema.products).where(inArray(schema.products.id, productIds))
  await db.delete(schema.stores).where(inArray(schema.stores.id, storeIds))
}, 60_000)

const row = (over: Partial<PantryItem>): PantryItem => ({ id: 'i', name: 'X', category: 'Potraviny', location: 'Spíž', quantity: 0, unit: 'ks', addedAt: '2026-10-01T00:00:00.000Z', ...over })
const levelOf = (productTypeKey: string): StockLevel => ({ id: 'l', productTypeKey, typeName: 'Typ', minQuantity: 2, maxQuantity: 6, unit: 'ks' })

describe('getRestockCandidates', () => {
  it('reads running promotions of every product of the type, only at the asked chains, with the regular price', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const type = (await db.query.productTypes.findFirst())!
    const [lidl, albert] = await db.insert(schema.stores).values([{ chain: `__test_restock_${crypto.randomUUID()}`, isOnline: true }, { chain: `__test_restock_${crypto.randomUUID()}`, isOnline: true }]).returning()
    storeIds.push(lidl.id, albert.id)
    const [typed, other] = await db.insert(schema.products).values([
      { name: `__test_restock_typed_${crypto.randomUUID()}`, categoryId: category!.id, productTypeId: type.id },
      { name: `__test_restock_other_${crypto.randomUUID()}`, categoryId: category!.id },
    ]).returning()
    productIds.push(typed.id, other.id)
    await db.insert(schema.prices).values({ productId: typed.id, storeId: lidl.id, storeLocationId: null, priceScope: 'CHAIN', locationResolution: 'NOT_APPLICABLE', regularPrice: '50', unit: 'ks', unitPrice: '50', observedAt: '2026-09-01', validFrom: '2026-09-01' })
    await db.insert(schema.deals).values([
      { productId: typed.id, storeId: lidl.id, storeLocationId: null, dealPrice: '40', unit: 'ks', unitPrice: '40', validFrom: '2026-10-01', validUntil: '2026-10-31' },
      { productId: typed.id, storeId: albert.id, storeLocationId: null, dealPrice: '42', validFrom: '2026-10-01', validUntil: '2026-10-31' },
      { productId: other.id, storeId: lidl.id, storeLocationId: null, dealPrice: '10', validFrom: '2026-10-01', validUntil: '2026-10-31' },
    ])

    const levels = [levelOf(type.key)]
    const byType = await getRestockCandidates(levels, [row({ productTypeKey: type.key })], today, [lidl.id])
    const mine = byType.filter((c) => c.productId === typed.id)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ chain: lidl.chain, dealPrice: 40, unit: 'ks', unitPrice: 40, regularPrice: 50, validUntil: '2026-10-31' })
    expect(byType.some((c) => c.productId === other.id)).toBe(false)

    // Any chain: the other chain's promotion on a product of the same type is read too.
    expect((await getRestockCandidates(levels, [row({ productTypeKey: type.key })], today, null)).filter((c) => c.productId === typed.id)).toHaveLength(2)

    // Not near its minimum, no chain allowed, no level, or an ended promotion: nothing read.
    expect(await getRestockCandidates(levels, [row({ productTypeKey: type.key, quantity: 9 })], today, null)).toEqual([])
    expect(await getRestockCandidates(levels, [row({ productTypeKey: type.key })], today, [])).toEqual([])
    expect(await getRestockCandidates([], [row({ productTypeKey: type.key })], today, null)).toEqual([])
    expect(await getRestockCandidates(levels, [row({ productTypeKey: type.key })], '2026-12-01', null)).toEqual([])
  })
})
