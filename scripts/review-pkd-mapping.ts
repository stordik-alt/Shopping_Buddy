import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { acceptPkdProductTypeMapping } from '@/lib/pkd-mapping-acceptance'

function arg(name: string): string | null {
  const prefix = `--${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))
  return value ? value.slice(prefix.length) : null
}

async function main() {
  const db = getDb()
  const list = process.argv.includes('--list')

  if (list) {
    const rows = await db
      .select({
        id: schema.pkdProductTypeMappings.id,
        pkdEntryId: schema.pkdProductTypeMappings.pkdEntryId,
        productTypeId: schema.pkdProductTypeMappings.productTypeId,
        confidence: schema.pkdProductTypeMappings.confidence,
        method: schema.pkdProductTypeMappings.method,
        mappingVersion: schema.pkdProductTypeMappings.mappingVersion,
        canonicalName: schema.pkdEntries.canonicalName,
        productTypeName: schema.productTypes.name,
      })
      .from(schema.pkdProductTypeMappings)
      .innerJoin(schema.pkdEntries, eq(schema.pkdEntries.id, schema.pkdProductTypeMappings.pkdEntryId))
      .innerJoin(schema.productTypes, eq(schema.productTypes.id, schema.pkdProductTypeMappings.productTypeId))
      .where(eq(schema.pkdProductTypeMappings.status, 'candidate'))

    console.log(JSON.stringify({ candidates: rows.length, rows }, null, 2))
    return
  }

  const mappingId = arg('id')
  const reviewerId = arg('reviewer')
  const note = arg('note')
  const decision = process.argv.includes('--accept') ? 'accepted' : process.argv.includes('--reject') ? 'rejected' : null

  if (!mappingId || !decision || !reviewerId) {
    throw new Error('Use --list or --id=<mapping UUID> --accept|--reject --reviewer=<reviewer UUID> [--note=<text>]')
  }

  await acceptPkdProductTypeMapping({
    mappingId,
    decision,
    reviewerId,
    note,
  })

  console.log(JSON.stringify({ mappingId, decision, status: decision }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
