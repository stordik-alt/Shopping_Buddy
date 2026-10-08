import fs from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { parseOffTaxonomy } from '@/lib/pkd-off-parser'

const VERSION = process.env.OFF_VERSION ?? '2026-10'
const LANGUAGE = process.env.OFF_LANGUAGE ?? 'cs'
const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7)
const dryRun = !process.argv.includes('--apply')

async function main() {
  if (!file) throw new Error('Usage: pnpm db:import-off -- --file=/path/to/categories.json [--apply]')
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  const nodes = parseOffTaxonomy(parsed, LANGUAGE)
  if (nodes.length === 0) throw new Error('No Open Food Facts taxonomy entries with a localized name were found.')

  const db = getDb()
  const existingSource = await db.query.pkdSources.findFirst({
    where: and(eq(schema.pkdSources.sourceType, 'open_food_facts'), eq(schema.pkdSources.sourceVersion, VERSION)),
  })

  if (dryRun) {
    const existing = new Set<string>()
    if (existingSource) {
      const rows = await db.query.pkdExternalMappings.findMany({
        where: eq(schema.pkdExternalMappings.sourceId, existingSource.id),
        columns: { externalId: true },
      })
      for (const row of rows) existing.add(row.externalId)
    }
    const newNodes = nodes.filter((node) => !existing.has(node.tagId))
    console.log(JSON.stringify({
      source: 'open_food_facts',
      version: VERSION,
      language: LANGUAGE,
      file,
      totalEntries: nodes.length,
      existingEntries: nodes.length - newNodes.length,
      newEntries: newNodes.length,
      mode: 'dry-run',
    }, null, 2))
    return
  }

  const source = existingSource ?? (await db.insert(schema.pkdSources).values({
    sourceType: 'open_food_facts',
    sourceVersion: VERSION,
    metadata: { format: 'json', taxonomy: 'categories', language: LANGUAGE, importedBy: 'db:import-off' },
  }).returning())[0]
  if (!source) throw new Error('Failed to create or load the Open Food Facts source record.')

  const BATCH_SIZE = 500
  let entriesUpserted = 0, synonymsUpserted = 0, mappingsUpserted = 0
  for (let offset = 0; offset < nodes.length; offset += BATCH_SIZE) {
    const batch = nodes.slice(offset, offset + BATCH_SIZE)
    await db.transaction(async (tx) => {
      const entries = await tx.insert(schema.pkdEntries).values(batch.map((node) => ({ stableKey: 'off:taxonomy:categories:' + VERSION + ':' + node.tagId, canonicalName: node.canonicalName, language: node.language, category: null, attributes: { sourceTag: node.tagId, taxonomy: 'categories', parents: node.parents, children: node.children }, confidence: 1, status: 'approved' as const }))).onConflictDoUpdate({ target: schema.pkdEntries.stableKey, set: { canonicalName: schema.pkdEntries.canonicalName, language: schema.pkdEntries.language, category: null, updatedAt: new Date() } }).returning({ id: schema.pkdEntries.id, stableKey: schema.pkdEntries.stableKey })
      entriesUpserted += entries.length
      const byKey = new Map(entries.map((entry) => [entry.stableKey, entry.id]))
      const synonyms = batch.flatMap((node) => { const entryId = byKey.get('off:taxonomy:categories:' + VERSION + ':' + node.tagId); return entryId ? node.synonyms.flatMap((synonym) => { const normalized = synonym.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); return normalized ? [{ entryId, synonym, language: node.language, normalized }] : [] }) : [] })
      if (synonyms.length) { await tx.insert(schema.pkdSynonyms).values(synonyms).onConflictDoUpdate({ target: [schema.pkdSynonyms.entryId, schema.pkdSynonyms.normalized], set: { synonym: schema.pkdSynonyms.synonym, language: schema.pkdSynonyms.language } }); synonymsUpserted += synonyms.length }
      const mappings = batch.flatMap((node) => { const entryId = byKey.get('off:taxonomy:categories:' + VERSION + ':' + node.tagId); return entryId ? [{ entryId, sourceId: source.id, externalId: node.tagId, externalParentId: node.parents[0] ?? null, mappingStatus: 'mapped' as const, confidence: 1, evidence: { importer: 'db:import-off', taxonomy: 'categories', parents: node.parents, children: node.children } }] : [] })
      if (mappings.length) { await tx.insert(schema.pkdExternalMappings).values(mappings).onConflictDoUpdate({ target: [schema.pkdExternalMappings.sourceId, schema.pkdExternalMappings.externalId], set: { externalParentId: schema.pkdExternalMappings.externalParentId, mappingStatus: 'mapped', confidence: 1 } }); mappingsUpserted += mappings.length }
    })
    console.log(`OFF batch ${Math.min(offset + BATCH_SIZE, nodes.length)}/${nodes.length}`)
  }

  console.log(JSON.stringify({
    source: 'open_food_facts',
    version: VERSION,
    language: LANGUAGE,
    totalEntries: nodes.length,
    entriesUpserted,
    synonymsUpserted,
    mappingsUpserted,
    mode: 'apply',
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
