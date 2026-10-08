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

  let entriesUpserted = 0
  let synonymsUpserted = 0
  let mappingsUpserted = 0

  for (const node of nodes) {
    const stableKey = 'off:taxonomy:categories:' + VERSION + ':' + node.tagId
    const [entry] = await db.insert(schema.pkdEntries).values({
      stableKey,
      canonicalName: node.canonicalName,
      language: node.language,
      category: null,
      attributes: { sourceTag: node.tagId, taxonomy: 'categories', parents: node.parents, children: node.children },
      confidence: 1,
      status: 'approved',
    }).onConflictDoUpdate({
      target: schema.pkdEntries.stableKey,
      set: {
        canonicalName: node.canonicalName,
        language: node.language,
        category: null,
        attributes: { sourceTag: node.tagId, taxonomy: 'categories', parents: node.parents, children: node.children },
        updatedAt: new Date(),
      },
    }).returning()
    if (!entry) continue
    entriesUpserted++

    for (const synonym of node.synonyms) {
      const normalized = synonym.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      if (!normalized) continue
      await db.insert(schema.pkdSynonyms).values({
        entryId: entry.id,
        synonym,
        language: node.language,
        normalized,
      }).onConflictDoUpdate({
        target: [schema.pkdSynonyms.entryId, schema.pkdSynonyms.normalized],
        set: { synonym, language: node.language },
      })
      synonymsUpserted++
    }

    await db.insert(schema.pkdExternalMappings).values({
      entryId: entry.id,
      sourceId: source.id,
      externalId: node.tagId,
      externalParentId: node.parents[0] ?? null,
      mappingStatus: 'mapped',
      confidence: 1,
      evidence: { importer: 'db:import-off', taxonomy: 'categories', parents: node.parents, children: node.children },
    }).onConflictDoUpdate({
      target: [schema.pkdExternalMappings.sourceId, schema.pkdExternalMappings.externalId],
      set: {
        entryId: entry.id,
        externalParentId: node.parents[0] ?? null,
        mappingStatus: 'mapped',
        confidence: 1,
        evidence: { importer: 'db:import-off', taxonomy: 'categories', parents: node.parents, children: node.children },
      },
    })
    mappingsUpserted++
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
