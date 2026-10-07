import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'
import { normalizeSearchText } from '@/lib/product-search'
import type { ItemUnit } from '@/lib/types'
import { productTypeIdFor, loadProductTypeIds } from '@/lib/db/product-type-assignment'
import {
  loadSeedCatalog,
  projectSeedPackageQuantity,
  shouldApplySeedBrand,
  shouldApplySeedVariant,
  seedPackageReference,
  type SeedCatalogRow,
} from '@/lib/seed-catalog'

type Action = 'link_existing' | 'create' | 'skip'

type PlannedRow = {
  row: SeedCatalogRow
  action: Action
  existingProductId: string | null
  reason: string | null
  productName: string
}

const APPLY = process.argv.includes('--apply')
const INCLUDE_REVIEW = process.argv.includes('--include-review')
const SEED_FILE = process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length)

function usage(): never {
  console.log('Usage: pnpm db:seed:catalog [--apply] [--include-review] [--file=/path/to/seed_catalog_v1.csv]')
  console.log('Default mode is dry-run; --apply is required for database writes.')
  process.exit(0)
}

if (process.argv.includes('--help')) usage()

async function main() {
  const rows = loadSeedCatalog(SEED_FILE)
  const sourceRows = INCLUDE_REVIEW ? rows : rows.filter((row) => row.normalizationStatus === 'ready')
  const seedIds = sourceRows.map((row) => row.seedId)
  if (new Set(seedIds).size !== seedIds.length) throw new Error('Seed catalog contains duplicate seed_id values')

  const db = getDb()
  const refs = seedIds.length
    ? await db.query.productSeedRefs.findMany({
        where: inArray(schema.productSeedRefs.seedId, seedIds),
        columns: { seedId: true, productId: true },
      })
    : []
  const imported = new Map(refs.map((ref) => [ref.seedId, ref.productId]))
  const pending = sourceRows.filter((row) => !imported.has(row.seedId))

  const categoryRows = await db.query.productCategories.findMany({ columns: { id: true, name: true } })
  const subcategoryRows = await db.query.productSubcategories.findMany({ columns: { id: true, name: true, category: true } })
  const categoryIdByName = new Map(categoryRows.map((row) => [row.name, row.id]))
  const subcategoryIdByKey = new Map(subcategoryRows.map((row) => [`${row.category}\\0${row.name}`, row.id]))

  for (const row of sourceRows) {
    if (!categoryIdByName.has(row.category)) throw new Error(`Missing product category: ${row.category}`)
    if (!subcategoryIdByKey.has(`${row.category}\\0${row.subcategory}`)) {
      throw new Error(`Missing product subcategory: ${row.category} → ${row.subcategory}`)
    }
  }

  if (pending.length === 0) {
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', total: rows.length, selected: sourceRows.length, alreadyImported: sourceRows.length, planned: 0 }, null, 2))
    return
  }

  // One bounded catalog read for all seed product-family names. No full ~50k-product scan.
  const names = [...new Set(pending.map((row) => row.productFamily).filter(Boolean))]
  const normalizedNames = [...new Set(names.map(normalizeSearchText))]
  const pendingBrandsByFamily = new Map<string, Set<string>>()
  for (const row of pending) {
    if (shouldApplySeedBrand(row) && row.brand) {
      const familyKey = normalizeSearchText(row.productFamily)
      const brands = pendingBrandsByFamily.get(familyKey) ?? new Set<string>()
      brands.add(normalizeSearchText(row.brand))
      pendingBrandsByFamily.set(familyKey, brands)
    }
  }

  const canonicalProductName = (row: SeedCatalogRow, forceBrandPrefix = false): string => {
    const hasMultipleBrands = (pendingBrandsByFamily.get(normalizeSearchText(row.productFamily))?.size ?? 0) > 1
    if (shouldApplySeedBrand(row) && row.brand && (forceBrandPrefix || hasMultipleBrands)) {
      return `${row.brand} ${row.productFamily}`
    }
    return row.productFamily
  }
  const candidates = await db.query.products.findMany({
    where: or(inArray(schema.products.name, names), inArray(schema.products.searchName, normalizedNames)),
    columns: {
      id: true,
      name: true,
      brand: true,
      variant: true,
      categoryId: true,
      subcategoryId: true,
      categoryLocked: true,
    },
  })
  const bySearchName = new Map<string, typeof candidates>()
  for (const candidate of candidates) {
    const key = normalizeSearchText(candidate.name)
    const list = bySearchName.get(key) ?? []
    list.push(candidate)
    bySearchName.set(key, list)
  }

  const plans: PlannedRow[] = []
  for (const row of pending) {
    const candidatesForRow = bySearchName.get(normalizeSearchText(row.productFamily)) ?? []
    if (candidatesForRow.length > 1) {
      plans.push({ row, action: 'skip', existingProductId: null, reason: 'ambiguous_existing_product_name', productName: row.productFamily })
      continue
    }
    if (candidatesForRow.length === 1) {
      const existing = candidatesForRow[0]
      const wantedCategoryId = categoryIdByName.get(row.category)!
      const wantedSubcategoryId = subcategoryIdByKey.get(`${row.category}\\0${row.subcategory}`)!
      if (existing.categoryId !== wantedCategoryId) {
        plans.push({ row, action: 'skip', existingProductId: existing.id, reason: 'existing_product_category_conflict', productName: row.productFamily })
        continue
      }
      if (existing.subcategoryId != null && existing.subcategoryId !== wantedSubcategoryId) {
        plans.push({ row, action: 'skip', existingProductId: existing.id, reason: 'existing_product_subcategory_conflict', productName: row.productFamily })
        continue
      }
      if (shouldApplySeedBrand(row) && existing.brand && normalizeSearchText(existing.brand) !== normalizeSearchText(row.brand!)) {
        plans.push({
          row,
          action: 'create',
          existingProductId: null,
          reason: 'existing_product_brand_conflict',
          productName: canonicalProductName(row, true),
        })
        continue
      }
      plans.push({ row, action: 'link_existing', existingProductId: existing.id, reason: null, productName: existing.name })
      continue
    }
    plans.push({ row, action: 'create', existingProductId: null, reason: null, productName: canonicalProductName(row) })
  }

  const counts = {
    total: rows.length,
    selected: sourceRows.length,
    alreadyImported: imported.size,
    pending: pending.length,
    linkExisting: plans.filter((plan) => plan.action === 'link_existing').length,
    create: plans.filter((plan) => plan.action === 'create').length,
    skipped: plans.filter((plan) => plan.action === 'skip').length,
    packageRows: plans.reduce((sum, plan) => sum + (plan.action === 'skip' ? 0 : packageRowsFor(plan.row).length), 0),
    ambiguousPackagesSkipped: plans.reduce((sum, plan) => sum + (plan.action === 'skip' ? 0 : ambiguousPackageCount(plan.row)), 0),
  }

  for (const plan of plans.filter((item) => item.action === 'skip')) {
    console.log(`SKIP ${plan.row.seedId}: ${plan.row.productFamily} — ${plan.reason}`)
  }

  console.log(JSON.stringify(counts, null, 2))
  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to write the planned links/products/packages.')
    return
  }

  const typeIds = await loadProductTypeIds()
  const importDate = todayInPrague()

  // Persist reference data for every seed row in one bounded batch. Review rows remain reference-only;
  // they are never promoted to products or product_packages by this importer.
  const referenceRows = rows.map((row) => {
    const reference = seedPackageReference(row)
    return {
      seedId: row.seedId,
      productId: null,
      sourceDocument: row.sourceDocument,
      sourcePage: row.sourcePage,
      category: row.category,
      subcategory: row.subcategory,
      brand: row.brand,
      productFamily: row.productFamily,
      resolution: reference.resolution,
      packageOptions: reference.options,
      normalizationStatus: row.normalizationStatus,
    }
  })
  await db.insert(schema.seedPackageReferences).values(referenceRows).onConflictDoUpdate({
    target: schema.seedPackageReferences.seedId,
    set: {
      sourceDocument: sql.raw('excluded.source_document'),
      sourcePage: sql.raw('excluded.source_page'),
      category: sql.raw('excluded.category'),
      subcategory: sql.raw('excluded.subcategory'),
      brand: sql.raw('excluded.brand'),
      productFamily: sql.raw('excluded.product_family'),
      resolution: sql.raw('excluded.resolution'),
      packageOptions: sql.raw('excluded.package_options'),
      normalizationStatus: sql.raw('excluded.normalization_status'),
    },
  })

  const skippedPlans = new Set(plans.filter((plan) => plan.action === 'skip').map((plan) => plan.row.seedId))

  let created = 0
  let linked = 0
  let packages = 0
  const createdProductIdsByName = new Map<string, string>()

    for (const plan of plans) {
      if (skippedPlans.has(plan.row.seedId)) continue

      const row = plan.row
      const categoryId = categoryIdByName.get(row.category)!
      const subcategoryId = subcategoryIdByKey.get(`${row.category}\\0${row.subcategory}`)!
      let productId = plan.existingProductId

      if (plan.action === 'create') {
        productId = createdProductIdsByName.get(normalizeSearchText(plan.productName)) ?? null

        if (!productId) {
          const [product] = await db.insert(schema.products).values({
            name: plan.productName,
            categoryId,
            subcategoryId,
            brand: shouldApplySeedBrand(row) ? row.brand : null,
            variant: shouldApplySeedVariant(row) ? row.variants : null,
            defaultUnit: defaultUnitFor(row),
            productTypeId: productTypeIdFor(row.category, row.productFamily, typeIds),
            productTypeSource: productTypeIdFor(row.category, row.productFamily, typeIds) ? 'rule' : null,
          }).returning({ id: schema.products.id })
          productId = product.id
          createdProductIdsByName.set(normalizeSearchText(plan.productName), product.id)
          created += 1
        }
      } else if (productId) {
        const existing = await db.query.products.findFirst({ where: eq(schema.products.id, productId), columns: { brand: true, variant: true, subcategoryId: true } })
        const updates: {
          subcategoryId?: string
          brand?: string | null
          variant?: string | null
        } = {}

        if (existing?.subcategoryId == null) updates.subcategoryId = subcategoryId
        if (existing?.brand == null && shouldApplySeedBrand(row)) updates.brand = row.brand
        if (existing?.variant == null && shouldApplySeedVariant(row)) updates.variant = row.variants

        if (Object.keys(updates).length > 0) {
          await db.update(schema.products).set(updates).where(eq(schema.products.id, productId))
        }
        linked += 1
      }

      if (!productId) throw new Error(`Could not resolve product for seed ${row.seedId}`)

      await db.insert(schema.productSeedRefs).values({
        seedId: row.seedId,
        productId,
        sourceDocument: row.sourceDocument,
        sourcePage: row.sourcePage,
        normalizationStatus: row.normalizationStatus,
      })

      await db.update(schema.seedPackageReferences)
        .set({ productId })
        .where(eq(schema.seedPackageReferences.seedId, row.seedId))

      for (const pkg of packageRowsFor(row)) {
        const existingPackage = await db.query.productPackages.findFirst({
          where: and(
            eq(schema.productPackages.productId, productId),
            eq(schema.productPackages.quantity, pkg.quantity),
            eq(schema.productPackages.unit, pkg.unit),
          ),
          columns: { id: true, source: true },
        })

        if (existingPackage) {
          await db.update(schema.productPackages).set({
            packageCount: pkg.packageCount,
            packageUnitQuantity: pkg.packageUnitQuantity,
            packageUnit: pkg.packageUnit,
            packageType: pkg.packageType,
            confidence: pkg.confidence,
          }).where(eq(schema.productPackages.id, existingPackage.id))
        } else {
          await db.insert(schema.productPackages).values({
            productId,
            quantity: pkg.quantity,
            unit: pkg.unit,
            source: 'seed',
            confidence: pkg.confidence,
            firstSeenAt: importDate,
            lastSeenAt: importDate,
            packageCount: pkg.packageCount,
            packageUnitQuantity: pkg.packageUnitQuantity,
            packageUnit: pkg.packageUnit,
            packageType: pkg.packageType,
          })
        }
        packages += 1
      }
    }

  console.log(JSON.stringify({ applied: true, created, linked, packages, skipped: skippedPlans.size }, null, 2))
}

function defaultUnitFor(row: SeedCatalogRow): ItemUnit {
  return row.packageOptions[0]?.canonical_unit ?? 'ks'
}

type PackageRow = {
  quantity: number
  unit: 'ks' | 'kg' | 'l'
  packageCount: number | null
  packageUnitQuantity: number | null
  packageUnit: 'ks' | 'kg' | 'l' | null
  packageType: string | null
  confidence: number
}

function packageRowsFor(row: SeedCatalogRow): PackageRow[] {
  const rows: PackageRow[] = []
  for (const option of row.packageOptions) {
    if (row.packageCount && row.packageType === 'multipack' && row.packageOptions.length > 1) {
      const isAlreadyTotal = row.packageOptions.some((candidate) =>
        Math.abs(candidate.canonical_quantity - option.canonical_quantity * row.packageCount!) < 0.0005,
      )
      if (!isAlreadyTotal) continue
    }

    rows.push({
      quantity: projectSeedPackageQuantity(row, option),
      unit: option.canonical_unit,
      packageCount: row.packageCount,
      packageUnitQuantity: row.packageCount && row.packageType === 'multipack' ? option.canonical_quantity : null,
      packageUnit: row.packageCount && row.packageType === 'multipack' ? option.canonical_unit : null,
      packageType: row.packageType,
      confidence: row.confidence,
    })
  }
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.quantity}:${row.unit}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function ambiguousPackageCount(row: SeedCatalogRow): number {
  if (row.packageCount && row.packageType === 'multipack' && row.packageOptions.length > 1) {
    return row.packageOptions.filter((option) => !row.packageOptions.some((candidate) =>
      Math.abs(candidate.canonical_quantity - option.canonical_quantity * row.packageCount!) < 0.0005,
    )).length
  }
  return 0
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
