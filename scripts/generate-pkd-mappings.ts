import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { generatePkdProductTypeMappings, PKD_MAPPING_VERSION, type ProductTypeMappingTarget } from '@/lib/pkd-mapping-engine'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getDb()

  const entries = await db
    .select({
      id: schema.pkdEntries.id,
      canonicalName: schema.pkdEntries.canonicalName,
      language: schema.pkdEntries.language,
      category: schema.pkdEntries.category,
      productTypeId: schema.pkdEntries.productTypeId,
      status: schema.pkdEntries.status,
    })
    .from(schema.pkdEntries)
    .where(and(isNull(schema.pkdEntries.productTypeId), eq(schema.pkdEntries.status, 'approved')))

  const synonymRows = await db
    .select({ entryId: schema.pkdSynonyms.entryId, synonym: schema.pkdSynonyms.synonym })
    .from(schema.pkdSynonyms)

  const synonymsByEntry = new Map<string, string[]>()
  for (const row of synonymRows) {
    const values = synonymsByEntry.get(row.entryId) ?? []
    values.push(row.synonym)
    synonymsByEntry.set(row.entryId, values)
  }

  const productTypes: ProductTypeMappingTarget[] = await db
    .select({
      id: schema.productTypes.id,
      key: schema.productTypes.key,
      name: schema.productTypes.name,
      category: schema.productTypes.category,
    })
    .from(schema.productTypes)

  const mappings = generatePkdProductTypeMappings(
    entries.map((entry) => ({ ...entry, synonyms: synonymsByEntry.get(entry.id) ?? [] })),
    productTypes,
  )

  console.log(JSON.stringify({
    mappingVersion: PKD_MAPPING_VERSION,
    entries: entries.length,
    productTypes: productTypes.length,
    mappings: mappings.length,
    dryRun: !apply,
  }, null, 2))

  if (!apply) return

  for (const mapping of mappings) {
    await db
      .insert(schema.pkdProductTypeMappings)
      .values({
        pkdEntryId: mapping.pkdEntryId,
        productTypeId: mapping.productTypeId,
        mappingVersion: mapping.mappingVersion,
        method: mapping.method,
        confidence: mapping.confidence.toFixed(3),
        evidence: mapping.evidence,
        status: 'candidate',
      })
      .onConflictDoUpdate({
        target: [schema.pkdProductTypeMappings.pkdEntryId, schema.pkdProductTypeMappings.mappingVersion],
        set: {
          productTypeId: mapping.productTypeId,
          method: mapping.method,
          confidence: mapping.confidence.toFixed(3),
          evidence: mapping.evidence,
          updatedAt: new Date(),
        },
      })
  }

  console.log(JSON.stringify({ persistedCandidates: mappings.length }, null, 2))
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
