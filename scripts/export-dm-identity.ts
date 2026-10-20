import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { productCategories, productExternalRefs, productSubcategories, products } from '@/lib/db/schema'

function arg(name: string, fallback: string): string {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
}

async function main(): Promise<void> {
  const outputPath = resolve(arg('out', 'data/external/dm-database-export.json'))
  const db = getDb()
  // Read-only: only SELECT queries are executed.
  const rows = await db.select({
    productId: products.id,
    externalId: productExternalRefs.externalId,
    name: products.name,
    brand: products.brand,
    category: productCategories.name,
    subcategory: productSubcategories.name,
  })
    .from(productExternalRefs)
    .innerJoin(products, eq(productExternalRefs.productId, products.id))
    .innerJoin(productCategories, eq(products.categoryId, productCategories.id))
    .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
    .where(eq(productExternalRefs.source, 'dm'))
    .orderBy(asc(products.name), asc(productExternalRefs.externalId))

  const records = rows.map((row) => ({
    id: row.productId,
    retailer: 'DM',
    sourceCode: row.externalId,
    name: row.name,
    ...(row.brand ? { brand: row.brand } : {}),
    categoryPath: [row.category, ...(row.subcategory ? [row.subcategory] : [])],
  }))
  const report = {
    schemaVersion: 1,
    source: "ANITKA database product_external_refs.source=dm",
    exportedAt: new Date().toISOString(),
    readOnly: true,
    recordCount: records.length,
    recordsWithBrand: records.filter((record) => record.brand).length,
    recordsWithSourceCode: records.filter((record) => record.sourceCode).length,
    recordsWithEan: 0,
    limitations: [
      'Only products with an explicit dm product_external_refs row are exported.',
      'GTIN is omitted because the legacy dm ingestion path does not persist it.',
      'Candidates are heuristic and require human review.',
      'No prices, deals, user data, or database changes are included.',
    ],
    products: records,
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({
    outputPath, recordCount: report.recordCount,
    recordsWithBrand: report.recordsWithBrand,
    recordsWithSourceCode: report.recordsWithSourceCode,
    recordsWithEan: report.recordsWithEan, mode: 'read-only',
  }, null, 2))
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
