import fs from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { GpcNode } from '@/lib/pkd-gpc-parser'
import { parseGpcDocument } from '@/lib/pkd-gpc-parser'

import { XMLParser } from 'fast-xml-parser'

const VERSION = process.env.GPC_VERSION ?? '2026-05'
const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7)
const dryRun = !process.argv.includes('--apply')

async function main() {
  if (!file) throw new Error('Usage: pnpm db:import-gpc -- --file=/path/to/gpc.xml [--apply]')
  const raw = fs.readFileSync(file, 'utf8')
  let parsed: unknown
  if (file.toLowerCase().endsWith('.json')) parsed = JSON.parse(raw)
  else parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false }).parse(raw)
  const unique = parseGpcDocument(parsed)
  if (unique.length === 0) throw new Error('No GPC nodes with 8-digit code + name were found in the supplied file.')
  const db = getDb()
  const existingSource = await db.query.pkdSources.findFirst({
    where: and(eq(schema.pkdSources.sourceType, 'gs1_gpc'), eq(schema.pkdSources.sourceVersion, VERSION)),
  })
  if (dryRun) {
    const existing = new Set<string>()
    if (existingSource) {
      const rows = await db.query.pkdExternalMappings.findMany({ where: eq(schema.pkdExternalMappings.sourceId, existingSource.id), columns: { externalId: true } })
      for (const row of rows) existing.add(row.externalId)
    }
    const newNodes = unique.filter((node) => !existing.has(node.code))
    console.log(JSON.stringify({ source: 'gs1_gpc', version: VERSION, file, totalNodes: unique.length, existingNodes: unique.length - newNodes.length, newNodes: newNodes.length, mode: 'dry-run' }, null, 2))
    return
  }
  const source = existingSource ?? (await db.insert(schema.pkdSources).values({
    sourceType: 'gs1_gpc', sourceVersion: VERSION, metadata: { format: file.toLowerCase().endsWith('.json') ? 'json' : 'xml', importedBy: 'db:import-gpc' },
  }).returning())[0]
  if (!source) throw new Error('Failed to create or load the GS1 GPC source record.')
  const BATCH_SIZE = 500
  let entriesUpserted = 0, mappingsUpserted = 0
  for (let offset = 0; offset < unique.length; offset += BATCH_SIZE) {
    const batch = (unique as GpcNode[]).slice(offset, offset + BATCH_SIZE)
    await db.transaction(async (tx) => {
      const entries = await tx.insert(schema.pkdEntries).values(batch.map((node) => ({
        stableKey: 'gpc:' + VERSION + ':' + node.level + ':' + node.code, canonicalName: node.name, language: 'en', category: null,
        attributes: { gpcCode: node.code, level: node.level, parentCode: node.parentCode, path: node.path }, confidence: 1, status: 'approved',
      }))).onConflictDoUpdate({ target: schema.pkdEntries.stableKey, set: { canonicalName: schema.pkdEntries.canonicalName, category: null, updatedAt: new Date() } }).returning({ id: schema.pkdEntries.id, stableKey: schema.pkdEntries.stableKey })
      entriesUpserted += entries.length
      const byKey = new Map(entries.map((entry) => [entry.stableKey, entry.id]))
      const mappings = batch.flatMap((node) => { const entryId = byKey.get('gpc:' + VERSION + ':' + node.level + ':' + node.code); return entryId ? [{ entryId, sourceId: source.id, externalId: node.code, externalParentId: node.parentCode, mappingStatus: 'mapped' as const, confidence: 1, evidence: { importer: 'db:import-gpc', level: node.level, path: node.path } }] : [] })
      if (mappings.length) { await tx.insert(schema.pkdExternalMappings).values(mappings).onConflictDoUpdate({ target: [schema.pkdExternalMappings.sourceId, schema.pkdExternalMappings.externalId], set: { externalParentId: schema.pkdExternalMappings.externalParentId, mappingStatus: 'mapped', confidence: 1 } }); mappingsUpserted += mappings.length }
    })
    console.log(`GPC batch ${Math.min(offset + BATCH_SIZE, unique.length)}/${unique.length}`)
  }

  console.log(JSON.stringify({ source: 'gs1_gpc', version: VERSION, totalNodes: unique.length, entriesUpserted, mappingsUpserted, mode: 'apply' }, null, 2))
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })