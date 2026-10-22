import { eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { importTetaCatalog, TETA_SOURCE } from '@/lib/ingestion/teta-import'
import type { TetaCatalogProduct } from '@/lib/ingestion/teta-catalog'

// The import writes real rows (products, packages, trade items, retailer references, prices) into
// the test branch, and cleans them up afterwards.

const db = getDb()
const tag = crypto.randomUUID()
const externalIds: string[] = []
const productIds: string[] = []

function record(overrides: Partial<TetaCatalogProduct> & { externalId: string; name: string }): TetaCatalogProduct {
  externalIds.push(overrides.externalId)
  return {
    slug: 'test',
    url: `https://www.tetadrogerie.cz/eshop/katalog/${overrides.externalId}`,
    categoryPath: ['Hygiena'],
    categoryCodes: ['HYGIENA'],
    category: 'Drogerie',
    price: 17.9,
    unit: 'ks',
    unitPrice: 0.18,
    regularUnitPrice: 0.18,
    available: true,
    images: [],
    tags: [],
    warnings: [],
    ...overrides,
  }
}

async function createdProductId(externalId: string): Promise<string | null> {
  const rows = await db
    .select({ productId: schema.productExternalRefs.productId })
    .from(schema.productExternalRefs)
    .where(eq(schema.productExternalRefs.externalId, externalId))
  return rows[0]?.productId ?? null
}

describe('Teta catalog import', () => {
  afterAll(async () => {
    // The prices point at the retailer reference, so they go first.
    for (const externalId of externalIds) {
      const productId = await createdProductId(externalId)
      if (!productId) continue
      productIds.push(productId)
      await db.delete(schema.prices).where(eq(schema.prices.productId, productId))
    }
    if (externalIds.length > 0) {
      await db.delete(schema.retailerProductRefs).where(inArray(schema.retailerProductRefs.externalId, externalIds))
    }
    if (productIds.length > 0) {
      await db.delete(schema.products).where(inArray(schema.products.id, productIds))
    }
  })

  it('writes a product, its package, a trade item, a reference and a price', async () => {
    const externalId = `__test_teta_${tag}_1`
    const result = await importTetaCatalog([
      record({
        externalId,
        name: `__Test Teta ${tag} kapesníky 100 ks`,
        brand: 'Tip Line',
        package: { quantity: 100, unit: 'ks', packageCount: 100, packageUnitQuantity: 1, packageUnit: 'ks' },
        packageText: '100 ks',
        unitPrice: 0.179,
        regularUnitPrice: 0.179,
      }),
    ], { apply: true, observedAt: '2026-10-20' })

    expect(result.errors).toEqual([])
    expect(result.products.created).toBe(1)

    const productId = await createdProductId(externalId)
    expect(productId).not.toBeNull()

    // The product the SKU points at.
    const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId!) })
    expect(product?.name).toContain('__Test Teta')
    expect(product?.brand).toBe('Tip Line')

    // The package the retailer states.
    const packages = await db.query.productPackages.findMany({ where: eq(schema.productPackages.productId, productId!) })
    expect(packages.some((row) => row.unit === 'ks' && Number(row.quantity) === 100)).toBe(true)

    // The trade item of that product and package.
    const tradeItems = await db.query.tradeItems.findMany({ where: eq(schema.tradeItems.productId, productId!) })
    expect(tradeItems).toHaveLength(1)

    // The retailer reference.
    const refs = await db.query.retailerProductRefs.findMany({
      where: eq(schema.retailerProductRefs.externalId, externalId),
    })
    expect(refs).toHaveLength(1)
    expect(refs[0].source).toBe(TETA_SOURCE)
    expect(refs[0].productId).toBe(productId)
    expect(refs[0].tradeItemId).toBe(tradeItems[0].id)
    expect(refs[0].rawBrand).toBe('Tip Line')
    expect(refs[0].rawPackage).toBe('100 ks')

    // The price: the everyday price, at the Teta chain, with no branch.
    const prices = await db.query.prices.findMany({ where: eq(schema.prices.productId, productId!) })
    expect(prices).toHaveLength(1)
    expect(Number(prices[0].regularPrice)).toBeCloseTo(17.9, 2)
    expect(prices[0].sourceReference).toBe(externalId)
    expect(prices[0].storeLocationId).toBeNull()
    expect(prices[0].priceScope).toBe('CHAIN')
    expect(prices[0].currency).toBe('CZK')
  })

  it('stores the everyday price of a discounted product, not the action price', async () => {
    const externalId = `__test_teta_${tag}_2`
    await importTetaCatalog([
      record({
        externalId,
        name: `__Test Teta ${tag} toaletní papír 8 ks`,
        price: 59.9,
        regularPrice: 69.9,
        discountPercent: 14,
        unitPrice: 7.49,
        regularUnitPrice: 8.74,
        package: { quantity: 8, unit: 'ks', packageCount: 8, packageUnitQuantity: 1, packageUnit: 'ks' },
        packageText: '8 ks',
      }),
    ], { apply: true, observedAt: '2026-10-20' })

    const productId = await createdProductId(externalId)
    const prices = await db.query.prices.findMany({ where: eq(schema.prices.productId, productId!) })
    expect(prices).toHaveLength(1)
    // The shopper pays 59,90 now, but the action has no end date, so the stored price is the
    // everyday one.
    expect(Number(prices[0].regularPrice)).toBeCloseTo(69.9, 2)
    expect(Number(prices[0].unitPrice)).toBeCloseTo(8.74, 2)
  })

  it('writes the same rows when the same file is imported twice', async () => {
    const externalId = `__test_teta_${tag}_3`
    const records = [record({
      externalId,
      name: `__Test Teta ${tag} mýdlo 250 ml`,
      package: { quantity: 0.25, unit: 'l' },
      packageText: '250 ml',
      unit: 'l',
      unitPrice: 199.6,
      regularUnitPrice: 199.6,
    })]
    await importTetaCatalog(records, { apply: true, observedAt: '2026-10-20' })
    const firstProductId = await createdProductId(externalId)
    const second = await importTetaCatalog(records, { apply: true, observedAt: '2026-10-20' })

    // The second run finds the product the first one created instead of creating another.
    expect(await createdProductId(externalId)).toBe(firstProductId)
    expect(second.products.created).toBe(0)
    const products = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.name, records[0].name))
    expect(products).toHaveLength(1)
    const prices = await db.query.prices.findMany({ where: eq(schema.prices.productId, firstProductId!) })
    expect(prices).toHaveLength(1)
  })

  it('keeps a name that is already taken by another product apart', async () => {
    const externalId = `__test_teta_${tag}_4`
    const name = `__Test Teta ${tag} sdílený název`
    const [existing] = await db.insert(schema.products).values({
      name,
      categoryId: (await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Drogerie') }))!.id,
      defaultUnit: 'ks',
    }).returning()
    productIds.push(existing.id)

    await importTetaCatalog([record({ externalId, name })], { apply: true, observedAt: '2026-10-20' })
    const productId = await createdProductId(externalId)
    // The SKU is attached to the product that already had the name — a name is the app's own
    // identity rule for the catalog, and a second product with the same name cannot exist.
    expect(productId).toBe(existing.id)
  })

  it('reports a record it cannot use and keeps going', async () => {
    const externalId = `__test_teta_${tag}_5`
    const result = await importTetaCatalog([
      record({ externalId, name: `__Test Teta ${tag} bez kategorie`, category: null }),
      record({ externalId: `${externalId}_b`, name: `__Test Teta ${tag} s cenou`, price: 0 }),
    ], { apply: true, observedAt: '2026-10-20' })

    expect(result.skipped).toBe(2)
    expect(result.errors.map((error) => error.externalId)).toEqual([externalId, `${externalId}_b`])
    expect(await createdProductId(externalId)).toBeNull()
  })

  it('writes in batches, one record at a time', async () => {
    const records = [
      record({ externalId: `__test_teta_${tag}_6a`, name: `__Test Teta ${tag} dávka A` }),
      record({ externalId: `__test_teta_${tag}_6b`, name: `__Test Teta ${tag} dávka B` }),
    ]
    const result = await importTetaCatalog(records, { apply: true, batchSize: 1, observedAt: '2026-10-20' })
    expect(result.products.created).toBe(2)
    expect(await createdProductId(records[0].externalId)).not.toBeNull()
    expect(await createdProductId(records[1].externalId)).not.toBeNull()
  })

  it('keeps the decision it made when the product was first imported', async () => {
    // The product the import creates for a SKU is not evidence that the SKU matches a catalog
    // product: the second run would find it, match it perfectly and call the match unambiguous.
    // The decision is made once, and the review queue does not empty itself.
    const externalId = `__test_teta_${tag}_8`
    const records = [record({ externalId, name: `__Test Teta ${tag} vlastní produkt 100 ml` })]
    const statusOf = async () => {
      const refs = await db.query.retailerProductRefs.findMany({
        where: eq(schema.retailerProductRefs.externalId, externalId),
      })
      return refs[0]?.identityStatus
    }

    const first = await importTetaCatalog(records, { apply: true, observedAt: '2026-10-20' })
    const firstStatus = await statusOf()
    expect(firstStatus).toBeTruthy()

    const second = await importTetaCatalog(records, { apply: true, observedAt: '2026-10-20' })
    expect(second.decisions).toEqual(first.decisions)
    expect(second.decisions.auto).toBe(0)
    expect(await statusOf()).toBe(firstStatus)
  })

  it('keeps an automatic link after the next import', async () => {
    const name = `Nivea __Test Teta ${tag} automatický spoj 200 ml`
    const [existing] = await db.insert(schema.products).values({
      name,
      categoryId: (await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Drogerie') }))!.id,
      defaultUnit: 'ks',
    }).returning()
    productIds.push(existing.id)

    const externalId = `__test_teta_${tag}_9`
    const records = [record({
      externalId,
      name: `__Test Teta ${tag} automatický spoj 200 ml`,
      brand: 'Nivea',
      package: { quantity: 0.2, unit: 'l' },
      packageText: '200 ml',
      unit: 'l',
      unitPrice: 199.6,
      regularUnitPrice: 199.6,
    })]

    const first = await importTetaCatalog(records, { apply: true, observedAt: '2026-10-20' })
    expect(first.decisions.auto).toBe(1)

    const second = await importTetaCatalog(records, { apply: true, observedAt: '2026-10-20' })
    expect(second.decisions.auto).toBe(1)

    const refs = await db.query.retailerProductRefs.findMany({
      where: eq(schema.retailerProductRefs.externalId, externalId),
    })
    expect(refs[0].identityStatus).toBe('matched')
    expect(refs[0].productId).toBe(existing.id)
  })

  it('gives a trade item to a record that states no package when the product has only one', async () => {
    // The record states no package and its price does not identify one either (the price is the
    // price of one piece, so the implied package would be a single piece). The product has a
    // single package — there is no other package its SKU could be.
    const externalId = `__test_teta_${tag}_10`
    await importTetaCatalog([
      record({
        externalId,
        name: `__Test Teta ${tag} jedno balení 5 ks`,
        package: undefined,
        packageText: undefined,
        unit: 'ks',
        unitPrice: 17.9,
        regularUnitPrice: 17.9,
      }),
    ], { apply: true, observedAt: '2026-10-20' })

    const productId = await createdProductId(externalId)
    const tradeItems = await db.query.tradeItems.findMany({ where: eq(schema.tradeItems.productId, productId!) })
    expect(tradeItems).toHaveLength(1)
  })

  it('writes nothing in a dry run', async () => {
    const externalId = `__test_teta_${tag}_7`
    const result = await importTetaCatalog([
      record({ externalId, name: `__Test Teta ${tag} suchý běh` }),
    ], { observedAt: '2026-10-20' })

    expect(result.products.created).toBe(1)
    expect(result.prices.written).toBe(0)
    expect(await createdProductId(externalId)).toBeNull()
  })
})
