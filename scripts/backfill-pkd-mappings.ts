import { eq, isNull } from 'drizzle-orm'
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
    })
    .from(schema.pkdProductTypeMappings)
    .innerJoin(schema.pkdEntries, eq(schema.pkdEntries.id, schema.pkdProductTypeMappings.pkdEntryId))
    .where(eq(schema.pkdProductTypeMappings.status, 'accepted'))

  const eligible = []
  const skipped = []

  for (const row of rows) {
    const entry = await db
      .select({ productTypeId: schema.pkdEntries.productTypeId })
      .from(schema.pkdEntries)
      .where(eq(schema.pkdEntries.id, row.pkdEntryId))
      .limit(1)

    if (entry[0]?.productTypeId === null) eligible.push(row)
    else skipped.push(row)
  }

  console.log(JSON.stringify({
    acceptedMappings: rows.length,
    eligible: eligible.length,
    skippedAlreadyMapped: skipped.length,
    dryRun: !apply,
  }, null, 2))

  if (!apply) return

  for (const row of eligible) {
    await db
      .update(schema.pkdEntries)
      .set({ productTypeId: row.productTypeId, updatedAt: new Date() })
      .where(isNull(schema.pkdEntries.productTypeId) && eq(schema.pkdEntries.id, row.pkdEntryId))
  }

  console.log(JSON.stringify({ backfilled: eligible.length }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
