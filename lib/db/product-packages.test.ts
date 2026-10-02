import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import { getProductPrices, persistNamedPackageEvidence, recordPriceObservation } from '@/lib/db/queries'
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

  it('promotes a price-consistent named weight to the persistent catalog', async () => {
    const productId = await addProduct(`__Test named weight 250 g ${tag}`)
    const storeId = (await db.query.stores.findFirst())!.id

    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 40,
      unit: 'kg',
      unitPrice: 160,
      observedAt: '2026-09-30',
      priceScope: 'CHAIN',
      sourceType: 'OFFICIAL',
      locationResolution: 'NOT_APPLICABLE',
      sourceReference: '__test_named_weight_' + tag + '_1',
    })

    await persistNamedPackageEvidence([{
      productId,
      name: `__Test named weight 250 g ${tag}`,
      regularPrice: 40,
      unit: 'kg',
      unitPrice: 160,
      observedAt: '2026-09-30',
    }])
    await persistNamedPackageEvidence([{
      productId,
      name: `__Test named weight 250 g ${tag}`,
      regularPrice: 40,
      unit: 'kg',
      unitPrice: 160,
      observedAt: '2026-09-30',
    }])

    const packages = await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })
    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({
      quantity: 0.25,
      unit: 'kg',
      source: 'name-extracted',
      confidence: 0.98,
      observationCount: 1,
      firstSeenAt: '2026-09-30',
      lastSeenAt: '2026-09-30',
    })

    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 42.5,
      unit: 'kg',
      unitPrice: 170,
      observedAt: '2026-10-01',
      priceScope: 'CHAIN',
      sourceType: 'OFFICIAL',
      locationResolution: 'NOT_APPLICABLE',
      sourceReference: '__test_named_weight_' + tag + '_2',
    })
    await persistNamedPackageEvidence([{
      productId,
      name: `__Test named weight 250 g ${tag}`,
      regularPrice: 42.5,
      unit: 'kg',
      unitPrice: 170,
      observedAt: '2026-10-01',
    }])

    const updated = await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })
    expect(updated[0]).toMatchObject({
      quantity: 0.25,
      unit: 'kg',
      source: 'name-extracted',
      confidence: 0.98,
      observationCount: 2,
      lastSeenAt: '2026-10-01',
    })
  })
  it('uses explicit piece package size from a product name when no catalog size exists', async () => {
    const productId = await addProduct('__Test named multipack ' + tag)
    const storeId = (await db.query.stores.findFirst())!.id
    const productName = 'Papírové kapesníky 6 ks ' + tag

    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 39.9,
      unit: 'ks',
      unitPrice: 6.65,
      observedAt: '2026-10-01',
      priceScope: 'CHAIN',
      sourceType: 'OFFICIAL',
      locationResolution: 'NOT_APPLICABLE',
      sourceReference: '__test_named_package_' + tag,
    })

    await db.update(schema.products)
      .set({ name: productName })
      .where(eq(schema.products.id, productId))

    const productPrice = (await getProductPrices({ names: [productName], runningDeals: false }))[0]
    expect(productPrice?.prices[0]?.packageSize).toMatchObject({
      quantity: 6,
      unit: 'ks',
      source: 'name-extracted',
      label: '6 ks',
    })
  })

  it('persists an explicit piece-count package and resolves it from the catalog', async () => {
    const productName = 'Papírové kapesníky 6 ks persistent ' + tag
    const productId = await addProduct(productName)
    const storeId = (await db.query.stores.findFirst())!.id

    await recordPriceObservation({
      productId,
      storeId,
      regularPrice: 39.9,
      unit: 'ks',
      unitPrice: 6.65,
      observedAt: '2026-10-01',
      priceScope: 'CHAIN',
      sourceType: 'OFFICIAL',
      locationResolution: 'NOT_APPLICABLE',
      sourceReference: '__test_persistent_piece_' + tag + '_1',
    })

    await persistNamedPackageEvidence([{
      productId,
      name: productName,
      regularPrice: 39.9,
      unit: 'ks',
      unitPrice: 6.65,
      observedAt: '2026-10-01',
    }])
    await persistNamedPackageEvidence([{
      productId,
      name: productName,
      regularPrice: 39.9,
      unit: 'ks',
      unitPrice: 6.65,
      observedAt: '2026-10-01',
    }])

    const first = await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      quantity: 6,
      unit: 'ks',
      source: 'name-extracted',
      confidence: 0.98,
      observationCount: 1,
      firstSeenAt: '2026-10-01',
      lastSeenAt: '2026-10-01',
    })

    const productPrice = (await getProductPrices({
      names: [productName],
      runningDeals: false,
    }))[0]
    expect(productPrice?.prices[0]?.packageSize).toMatchObject({
      quantity: 6,
      unit: 'ks',
      source: 'catalog',
      label: '6 ks',
    })

    await persistNamedPackageEvidence([{
      productId,
      name: productName,
      regularPrice: 42,
      unit: 'ks',
      unitPrice: 7,
      observedAt: '2026-10-02',
    }])

    const updated = await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })
    expect(updated[0]?.observationCount).toBe(2)
    expect(updated[0]?.lastSeenAt).toBe('2026-10-02')
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
