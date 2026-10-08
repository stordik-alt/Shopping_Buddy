import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getDb()

  const rows = await db
    .select({
      mappingId: schema.pkdProductTypeMappings.id,
      pkdEntryId: schema.pkdProductTypeMappings.pkdEntryId,
      productTypeId: schema.pkdProductTypeMappings.productTypeId,
      existingProductTypeId: schema.pkdEntries.productTypeId,
    })
    .from(schema.pkdProductTypeMappings)
    .innerJoin(schema.pkdEntries, eq(schema.pkdEntries.id, schema.pkdProductTypeMappings.pkdEntryId))
    .where(eq(schema.pkdProductTypeMappings.status, 'accepted'))

  const eligible = rows.filter((row) => row.existingProductTypeId === null)
  const skipped = rows.filter((row) => row.existingProductTypeId !== null)

  console.log(JSON.stringify({
    acceptedMappings: rows.length,
    eligible: eligible.length,
    skippedAlreadyMapped: skipped.length,
    dryRun: !apply,
  }, null, 2))

  if (!apply) return

  let backfilled = 0
  for (const row of eligible) {
    const result = await db
      .update(schema.pkdEntries)
      .set({ productTypeId: row.productTypeId, updatedAt: new Date() })
      .where(and(
        eq(schema.pkdEntries.id, row.pkdEntryId),
        isNull(schema.pkdEntries.productTypeId),
      ))
      .returning({ id: schema.pkdEntries.id })

    backfilled += result.length
  }

  console.log(JSON.stringify({ backfilled }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
