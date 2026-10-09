import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { auditProductSubtypeMigration, type ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

async function main() {
  const db = getDb()
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

  const report = auditProductSubtypeMigration(rows as ProductSubtypeAuditRow[])

  console.log('Product Subtype provenance audit — READ ONLY')
  console.log(JSON.stringify(report, null, 2))
  console.log('\nNo database writes were performed. This command has no --apply mode.')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
