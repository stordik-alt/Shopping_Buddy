import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { buildProductSubtypeMappings, summarizeProductSubtypeMappings } from '@/lib/product-subtype-mapping'
import type { ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

async function main() {
  const db = getDb()
  const schemaCheck = await db.execute<{
    hasSubtypeTable: boolean
    hasSubtypeIdColumn: boolean
    hasSubtypeSourceColumn: boolean
  }>(sql`
    SELECT
      to_regclass('public.product_subtypes') IS NOT NULL AS "hasSubtypeTable",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'product_subtype_id'
      ) AS "hasSubtypeIdColumn",
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'product_subtype_source'
      ) AS "hasSubtypeSourceColumn"
  `)
  const detected = schemaCheck.rows[0]
  if (!detected?.hasSubtypeTable || !detected.hasSubtypeIdColumn || !detected.hasSubtypeSourceColumn) {
    throw new Error('Product Subtype schema is not fully available; mapping audit stopped without querying product assignments.')
  }

  const rows = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      category: schema.productCategories.name,
      defaultUnit: schema.products.defaultUnit,
      productTypeKey: schema.productTypes.key,
      productTypeName: schema.productTypes.name,
      productTypeCategory: schema.productTypes.category,
      productTypeUnit: schema.productTypes.unit,
      productTypeSource: schema.products.productTypeSource,
      productSubtypeKey: schema.productSubtypes.key,
      productSubtypeName: schema.productSubtypes.name,
      productSubtypeSource: schema.products.productSubtypeSource,
    })
    .from(schema.products)
    .innerJoin(schema.productCategories, eq(schema.products.categoryId, schema.productCategories.id))
    .leftJoin(schema.productTypes, eq(schema.products.productTypeId, schema.productTypes.id))
    .leftJoin(schema.productSubtypes, eq(schema.products.productSubtypeId, schema.productSubtypes.id))

  const mappings = buildProductSubtypeMappings(rows as ProductSubtypeAuditRow[])
  const summary = summarizeProductSubtypeMappings(mappings)
  const candidate = mappings.filter((mapping) => mapping.status === 'candidate')
  const review = mappings.filter((mapping) => mapping.status === 'review')
  const existing = mappings.filter((mapping) => mapping.status === 'existing')
  const outsideRegistry = mappings.filter((mapping) => mapping.status === 'outside_registry')

  console.log('Product Subtype deterministic mapping audit — READ ONLY')
  console.log(JSON.stringify({
    totals: {
      products: mappings.length,
      candidates: candidate.length,
      review: review.length,
      existingSubtypeAssignments: existing.length,
      outsideRegistry: outsideRegistry.length,
    },
    bySubtype: summary,
    reviewItems: review.map((mapping) => ({
      productId: mapping.productId,
      productName: mapping.productName,
      productTypeKey: mapping.productTypeKey,
      parentTypeKey: mapping.parentTypeKey,
      subtypeKey: mapping.subtypeKey,
      provenance: mapping.provenance,
      reason: mapping.reason,
    })),
  }, null, 2))
  console.log('\nNo database writes were performed. This command has no --apply mode.')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
