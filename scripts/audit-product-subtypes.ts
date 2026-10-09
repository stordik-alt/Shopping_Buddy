import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { auditProductSubtypeMigration, type ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

async function main() {
  const db = getDb()

  // The subtype foundation migration is deliberately separate from this audit. Detect its state
  // before composing queries so production can still be audited safely before migration 0084.
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
  const subtypeSchemaReady = Boolean(detected?.hasSubtypeTable && detected?.hasSubtypeIdColumn && detected?.hasSubtypeSourceColumn)
  const anySubtypeSchemaObject = Boolean(detected?.hasSubtypeTable || detected?.hasSubtypeIdColumn || detected?.hasSubtypeSourceColumn)
  const schemaState = subtypeSchemaReady ? 'ready' : anySubtypeSchemaObject ? 'partial' : 'not_migrated'

  const baseSelection = {
    id: schema.products.id,
    name: schema.products.name,
    category: schema.productCategories.name,
    defaultUnit: schema.products.defaultUnit,
    productTypeKey: schema.productTypes.key,
    productTypeName: schema.productTypes.name,
    productTypeCategory: schema.productTypes.category,
    productTypeUnit: schema.productTypes.unit,
    productTypeSource: schema.products.productTypeSource,
  }

  const rows = subtypeSchemaReady
    ? await db
        .select({
          ...baseSelection,
          productSubtypeKey: schema.productSubtypes.key,
          productSubtypeName: schema.productSubtypes.name,
          productSubtypeSource: schema.products.productSubtypeSource,
        })
        .from(schema.products)
        .innerJoin(schema.productCategories, eq(schema.products.categoryId, schema.productCategories.id))
        .leftJoin(schema.productTypes, eq(schema.products.productTypeId, schema.productTypes.id))
        .leftJoin(schema.productSubtypes, eq(schema.products.productSubtypeId, schema.productSubtypes.id))
    : await db
        .select({
          ...baseSelection,
          productSubtypeKey: sql<string | null>`NULL::text`,
          productSubtypeName: sql<string | null>`NULL::text`,
          productSubtypeSource: sql<string | null>`NULL::text`,
        })
        .from(schema.products)
        .innerJoin(schema.productCategories, eq(schema.products.categoryId, schema.productCategories.id))
        .leftJoin(schema.productTypes, eq(schema.products.productTypeId, schema.productTypes.id))

  const report = auditProductSubtypeMigration(rows as ProductSubtypeAuditRow[])
  const reportWithSchemaState = subtypeSchemaReady
    ? report
    : {
        ...report,
        // Do not misrepresent unavailable subtype metrics as zero.
        existingSubtypeAssignments: null,
        existingSubtypeSourceBreakdown: null,
      }

  console.log('Product Subtype provenance audit — READ ONLY')
  console.log(JSON.stringify({
    schema: {
      state: schemaState,
      productSubtypesTable: Boolean(detected?.hasSubtypeTable),
      productsSubtypeIdColumn: Boolean(detected?.hasSubtypeIdColumn),
      productsSubtypeSourceColumn: Boolean(detected?.hasSubtypeSourceColumn),
    },
    audit: reportWithSchemaState,
    notes: subtypeSchemaReady
      ? ['Subtype schema is present; subtype assignment counts were included.']
      : [
          'Subtype schema is not fully available; Product Type coverage/provenance was audited without subtype joins.',
          'Subtype assignment metrics are unavailable, not zero. Apply migration 0084 separately after the reviewed schema rollout, then rerun this audit.',
        ],
  }, null, 2))
  console.log('\nNo database writes were performed. This command has no --apply mode.')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
