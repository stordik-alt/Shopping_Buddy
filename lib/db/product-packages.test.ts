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

  // docs/37_SECURITY_REMEDIATION_PLAN.md, S5: a receipt's printed "Kč" must be stored as the ISO code.
  it("stores a price observation's printed currency as its ISO code", async () => {
    const productId = await addProduct(`__Test měna ${tag}`)
    const storeId = (await db.query.stores.findFirst())!.id
    for (const [printed, reference] of [['Kč', 'a'], ['kc', 'b'], [undefined, 'c']] as const) {
      await recordPriceObservation({
        productId,
        storeId,
        regularPrice: 10,
        currency: printed,
        unit: 'ks',
        unitPrice: 10,
        observedAt: '2026-10-01',
        sourceType: 'RECEIPT',
        sourceReference: `__test_currency_${tag}_${reference}`,
        priceScope: 'CHAIN',
        locationResolution: 'NOT_APPLICABLE',
      })
    }
    const rows = await db.query.prices.findMany({ where: eq(schema.prices.productId, productId) })
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map((row) => row.currency))).toEqual(new Set(['CZK']))
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

  it('prefers retailer-published package facts and keeps multiple package sizes on one product', async () => {
    const productId = await addProduct('__Test retailer packages ' + tag)

    await persistNamedPackageEvidence([{
      productId,
      name: '__Test retailer packages 250 g ' + tag,
      regularPrice: 40,
      unit: 'kg',
      unitPrice: 160,
      observedAt: '2026-10-01',
      package: { quantity: 0.25, unit: 'kg' },
    }])
    await persistNamedPackageEvidence([{
      productId,
      name: '__Test retailer packages 500 g ' + tag,
      regularPrice: 70,
      unit: 'kg',
      unitPrice: 140,
      observedAt: '2026-10-02',
      package: { quantity: 0.5, unit: 'kg' },
    }])
    await persistNamedPackageEvidence([{
      productId,
      name: '__Test retailer packages 250 g ' + tag,
      regularPrice: 42,
      unit: 'kg',
      unitPrice: 168,
      observedAt: '2026-10-03',
      package: { quantity: 0.25, unit: 'kg', packageCount: 2, packageUnitQuantity: 0.125, packageUnit: 'kg', packageType: 'multipack' },
    }])

    const packages = await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })
    expect(packages).toHaveLength(2)
    expect(packages.find((row) => row.quantity === 0.25)).toMatchObject({
      unit: 'kg',
      source: 'retailer-published',
      confidence: 1,
      packageCount: 2,
      packageUnitQuantity: 0.125,
      packageUnit: 'kg',
      packageType: 'multipack',
    })
    expect(packages.find((row) => row.quantity === 0.5)).toMatchObject({
      unit: 'kg',
      source: 'retailer-published',
      confidence: 1,
    })
  })

  it('stores a small package size and drops a broken inner structure', async () => {
    // A stated size smaller than a gram is still a size: 4,8 g is 0,0048 kg, not 0 kg. The
    // inner structure of a pack is only stored when it is complete — the database requires the
    // piece count and the unit quantity to be positive and stated together.
    const productId = await addProduct('__Test small package ' + tag)

    await persistNamedPackageEvidence([{
      productId,
      name: '__Test small package 4,8 g ' + tag,
      regularPrice: 60,
      unit: 'ks',
      unitPrice: 60,
      observedAt: '2026-10-05',
      package: { quantity: 0.0048, unit: 'kg' },
    }])
    await persistNamedPackageEvidence([{
      productId,
      name: '__Test small package 2 x 4,5 g ' + tag,
      regularPrice: 60,
      unit: 'ks',
      unitPrice: 60,
      observedAt: '2026-10-05',
      package: { quantity: 0.009, unit: 'kg', packageCount: 2, packageUnitQuantity: 0, packageUnit: 'kg' },
    }])

    const packages = await db.query.productPackages.findMany({
      where: eq(schema.productPackages.productId, productId),
    })
    expect(packages.map((row) => row.quantity).sort((a, b) => a - b)).toEqual([0.005, 0.009])
    const multipack = packages.find((row) => row.quantity === 0.009)
    expect(multipack).toMatchObject({ unit: 'kg', source: 'retailer-published' })
    expect(multipack?.packageCount).toBeNull()
    expect(multipack?.packageUnitQuantity).toBeNull()
    expect(multipack?.packageUnit).toBeNull()
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
