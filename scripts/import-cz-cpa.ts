import fs from 'node:fs'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { parseCzCpaDocument } from '@/lib/pkd-cz-cpa-parser'

import { XMLParser } from 'fast-xml-parser'

const VERSION = process.env.CZ_CPA_VERSION ?? '2025'
const LANGUAGE = process.env.CZ_CPA_LANGUAGE ?? 'cs'
const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7)
const dryRun = !process.argv.includes('--apply')

function formatForFile(filePath: string): 'json' | 'csv' | 'xml' {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.csv') return 'csv'
  if (extension === '.xml') return 'xml'
  return 'json'
}

async function main() {
  if (!file) throw new Error('Usage: pnpm db:import-cz-cpa -- --file=/path/to/cz-cpa.csv [--apply]')
  const format = formatForFile(file)
  const raw = fs.readFileSync(file, 'utf8')
  const parsed = format === 'xml'
    ? new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(raw)
    : raw
  const nodes = parseCzCpaDocument(parsed, format === 'xml' ? undefined : format)
  if (nodes.length === 0) throw new Error('No CZ-CPA classification entries were found.')

  const db = getDb()
  const existingSource = await db.query.pkdSources.findFirst({
    where: and(eq(schema.pkdSources.sourceType, 'cz_cpa'), eq(schema.pkdSources.sourceVersion, VERSION)),
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
    const newNodes = nodes.filter((node) => !existing.has(node.code))
    console.log(JSON.stringify({
      source: 'cz_cpa',
      version: VERSION,
      language: LANGUAGE,
      file,
      totalEntries: nodes.length,
      existingEntries: nodes.length - newNodes.length,
      newEntries: newNodes.length,
      levels: Object.fromEntries([...new Set(nodes.map((node) => node.level))].sort().map((level) => [
        String(level),
        nodes.filter((node) => node.level === level).length,
      ])),
      mode: 'dry-run',
    }, null, 2))
    return
  }

  const source = existingSource ?? (await db.insert(schema.pkdSources).values({
    sourceType: 'cz_cpa',
    sourceVersion: VERSION,
    metadata: {
      format,
      classification: 'CZ-CPA_2025_KL',
      language: LANGUAGE,
      validFrom: '2025-01-01',
      importer: 'db:import-cz-cpa',
      authority: 'CZSO',
    },
  }).returning())[0]
  if (!source) throw new Error('Failed to create or load the CZ-CPA source record.')

  let entriesUpserted = 0
  let mappingsUpserted = 0

  for (const node of nodes) {
    const stableKey = 'cz-cpa:' + VERSION + ':' + node.code
    const [entry] = await db.insert(schema.pkdEntries).values({
      stableKey,
      canonicalName: node.name,
      language: LANGUAGE,
      category: null,
      attributes: {
        sourceCode: node.code,
        classification: 'CZ-CPA_2025_KL',
        level: node.level,
        parentCode: node.parentCode,
        path: node.path,
      },
      confidence: 1,
      status: 'approved',
    }).onConflictDoUpdate({
      target: schema.pkdEntries.stableKey,
      set: {
        canonicalName: node.name,
        language: LANGUAGE,
        category: null,
        attributes: {
          sourceCode: node.code,
          classification: 'CZ-CPA_2025_KL',
          level: node.level,
          parentCode: node.parentCode,
          path: node.path,
        },
        updatedAt: new Date(),
      },
    }).returning()
    if (!entry) continue
    entriesUpserted++

    await db.insert(schema.pkdExternalMappings).values({
      entryId: entry.id,
      sourceId: source.id,
      externalId: node.code,
      externalParentId: node.parentCode,
      mappingStatus: 'mapped',
      confidence: 1,
      evidence: {
        importer: 'db:import-cz-cpa',
        classification: 'CZ-CPA_2025_KL',
        level: node.level,
        parentCode: node.parentCode,
        path: node.path,
      },
    }).onConflictDoUpdate({
      target: [schema.pkdExternalMappings.sourceId, schema.pkdExternalMappings.externalId],
      set: {
        entryId: entry.id,
        externalParentId: node.parentCode,
        mappingStatus: 'mapped',
        confidence: 1,
        evidence: {
          importer: 'db:import-cz-cpa',
          classification: 'CZ-CPA_2025_KL',
          level: node.level,
          parentCode: node.parentCode,
          path: node.path,
        },
      },
    })
    mappingsUpserted++
  }

  console.log(JSON.stringify({
    source: 'cz_cpa',
    version: VERSION,
    language: LANGUAGE,
    classification: 'CZ-CPA_2025_KL',
    totalEntries: nodes.length,
    entriesUpserted,
    mappingsUpserted,
    mode: 'apply',
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
