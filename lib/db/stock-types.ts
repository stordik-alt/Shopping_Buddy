// Which product type (druh zboží) a purchased line is stocked under in the pantry. Shared by every
// path that turns purchase lines into stock (receipt import, manual purchase), so the rule lives in
// one place. Deliberately not a 'use server' module.

import { eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { resolveReceiptLineType } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'

/** The product type each line is stocked under, in line order — null where it cannot be told. A line
 *  matched to a catalog product takes that product's own type (a person or an earlier import settled
 *  it); otherwise the type rules read it off the printed text with its abbreviations spelled out
 *  ("KUR.PRSA 500G" → Kuřecí prsa). One query for the matched products, one for the type rows; a type
 *  missing from the database (code ahead of the migration) gives null. A type the household picked in
 *  the receipt review (`productTypeKey`) beats every other source. */
export async function stockTypesForLines(
  lines: Array<{ productId: string | null; name: string; category: ItemCategory | null; productTypeKey?: string | null; productTypeSelectionChanged?: boolean }>,
): Promise<Array<{ id: string; name: string } | null>> {
  const db = getDb()
  const productIds = [...new Set(lines.flatMap((line) => (line.productId ? [line.productId] : [])))]
  const productTypeKeys = new Map<string, string>()
  const manuallyUnclassified = new Set<string>()
  if (productIds.length > 0) {
    const rows = await db
      .select({ id: schema.products.id, key: schema.productTypes.key, source: schema.products.productTypeSource })
      .from(schema.products)
      .innerJoin(schema.productTypes, eq(schema.productTypes.id, schema.products.productTypeId))
      .where(inArray(schema.products.id, productIds))
    for (const row of rows) {
      if (row.key) productTypeKeys.set(row.id, row.key)
      else if (row.source === 'manual') manuallyUnclassified.add(row.id)
    }
  }

  const keys = lines.map((line) => line.productTypeSelectionChanged
    ? line.productTypeKey ?? null
    : line.productId && manuallyUnclassified.has(line.productId)
      ? null
    : line.productTypeKey ?? resolveReceiptLineType({
        productTypeKey: line.productId ? productTypeKeys.get(line.productId) ?? null : null,
        category: line.category,
        name: line.name,
      })?.key ?? null)
  const wanted = [...new Set(keys.flatMap((key) => (key ? [key] : [])))]
  if (wanted.length === 0) return keys.map(() => null)

  const typeRows = await db
    .select({ id: schema.productTypes.id, key: schema.productTypes.key, name: schema.productTypes.name })
    .from(schema.productTypes)
    .where(inArray(schema.productTypes.key, wanted))
  const byKey = new Map(typeRows.map((row) => [row.key, { id: row.id, name: row.name }]))
  return keys.map((key) => (key ? byKey.get(key) ?? null : null))
}
