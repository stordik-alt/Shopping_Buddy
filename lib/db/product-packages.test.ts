import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getProductPrices, recordPriceObservation } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'

const db = getDb()
const tag = crypto.randomUUID()
const createdProductIds: string[] = []
let categoryId = ''

async function addProduct(name: string): Promise<string> {
  const [row] = await db.insert(schema.products).values({ name, categoryId }).returning()
  createdProductIds.push(row.id)
  return row.id
}

describe('automatic product package catalog', () => {
  beforeAll(async () => {
    categoryId = (await db.query.productCategories.findFirst({
      where: eq(schema.productCategories.name, 'Potraviny'),
    }))!.id
  })

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await db.delete(schema.products).where(inArray(schema.products.id, createdProductIds))
    }
  })

  it('creates and accumulates a canonical package from official price observations', async () => {
    const productId = await addProduct(`__Test balení máslo ${tag}`)
    const storeId = (await db.query.stores.findFirst())!.id

    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 39.9,
      unit: 'kg',
      unitPrice: 159.6,
      observedAt: '2026-09-30',
      priceScope: 'CHAIN',
      sourceType: 'OFFICIAL',
      locationResolution: 'NOT_APPLICABLE',
      sourceReference: `__test_package_${tag}_1`,
    })
    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 44.9,
      unit: 'kg',
      unitPrice: 179.6,
      observedAt: '2026-10-01',
      priceScope: 'CHAIN',
      sourceType: 'OFFICIAL',
      locationResolution: 'NOT_APPLICABLE',
      sourceReference: `__test_package_${tag}_2`,
    })

    const packages = await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })
    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({
      quantity: 0.25,
      unit: 'kg',
      source: 'derived-from-price',
      confidence: 0.95,
      observationCount: 2,
      firstSeenAt: '2026-09-30',
      lastSeenAt: '2026-10-01',
    })

    const productPrice = (await getProductPrices({ names: [`__Test balení máslo ${tag}`], runningDeals: false }))[0]
    expect(productPrice?.prices[0]?.packageSize).toMatchObject({
      quantity: 0.25,
      unit: 'kg',
      source: 'catalog',
      label: '250 g',
    })
  })

  it('uses explicit package size from a product name when the ratio agrees', async () => {
    const productId = await addProduct('__Test named multipack ' + tag)
    const storeId = (await db.query.stores.findFirst())!.id

    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 119.2,
      unit: 'kg',
      unitPrice: 149,
      observedAt: '2026-10-01',
      priceScope: 'CHAIN',
      sourceType: 'OFFICIAL',
      locationResolution: 'NOT_APPLICABLE',
      sourceReference: '__test_named_package_' + tag,
    })

    await db.update(schema.products)
      .set({ name: 'Actimel Kids 8x 100 g ' + tag })
      .where(eq(schema.products.id, productId))

    const productPrice = (await getProductPrices({ names: ['Actimel Kids 8x 100 g ' + tag], runningDeals: false }))[0]
    expect(productPrice?.prices[0]?.packageSize).toMatchObject({
      quantity: 0.8,
      unit: 'kg',
      source: 'name-extracted',
      label: '800 g',
    })
  })

  it('does not learn a package size from receipt prices', async () => {
    const productId = await addProduct(`__Test receipt balení ${tag}`)
    const storeId = (await db.query.stores.findFirst())!.id

    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 40,
      unit: 'kg',
      unitPrice: 40,
      observedAt: '2026-10-01',
      priceScope: 'STORE',
      sourceType: 'RECEIPT',
      locationResolution: 'UNKNOWN',
    })

    expect(await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })).toHaveLength(0)
  })
})
