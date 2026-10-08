import fs from 'node:fs'
import { XMLParser } from 'fast-xml-parser'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

type GpcNode = {
  code: string
  name: string
  level: 'segment' | 'family' | 'class' | 'brick' | 'unknown'
  parentCode: string | null
  path: string[]
}

const VERSION = process.env.GPC_VERSION ?? '2026-05'
const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7)
const dryRun = !process.argv.includes('--apply')

if (!file) {
  console.error('Usage: pnpm db:import-gpc -- --file=/path/to/gpc.xml [--apply]')
  process.exit(1)
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || null
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of ['Description', 'description', 'Name', 'name', 'Label', 'label']) {
      const found = textValue(obj[key])
      if (found) return found
    }
    if ('#text' in obj) return textValue(obj['#text'])
  }
  return null
}

function codeValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const raw = String(value).trim()
    return /^\d{8}$/.test(raw) ? raw : null
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of ['Code', 'code', 'BrickCode', 'brickCode', 'GPCCode', 'gpcCode', 'id', 'ID']) {
      const found = codeValue(obj[key])
      if (found) return found
    }
  }
  return null
}

function levelOf(key: string, node: Record<string, unknown>): GpcNode['level'] {
  const lower = key.toLowerCase()
  if (lower.includes('brick')) return 'brick'
  if (lower.includes('class')) return 'class'
  if (lower.includes('family')) return 'family'
  if (lower.includes('segment')) return 'segment'
  const raw = textValue(node['Level'] ?? node['level'] ?? node['Type'] ?? node['type'])?.toLowerCase()
  if (raw?.includes('brick')) return 'brick'
  if (raw?.includes('class')) return 'class'
  if (raw?.includes('family')) return 'family'
  if (raw?.includes('segment')) return 'segment'
  return 'unknown'
}

function collectNodes(value: unknown, parentCode: string | null = null, path: string[] = [], key = 'root'): GpcNode[] {
  const result: GpcNode[] = []
  for (const item of asArray(value)) {
    if (!item || typeof item !== 'object') continue
    const node = item as Record<string, unknown>
    const code = codeValue(node)
    const name = textValue(node)
    const level = levelOf(key, node)
    const nextPath = code && name ? [...path, code] : path
    if (code && name) result.push({ code, name, level, parentCode, path: nextPath })
    for (const [childKey, childValue] of Object.entries(node)) {
      if (['Code','code','BrickCode','brickCode','GPCCode','gpcCode','ID','id','Description','description','Name','name','Label','label','Level','level','Type','type'].includes(childKey)) continue
      result.push(...collectNodes(childValue, code ?? parentCode, nextPath, childKey))
    }
  }
  return result
}

const raw = fs.readFileSync(file, 'utf8')
let parsed: unknown
if (file.toLowerCase().endsWith('.json')) parsed = JSON.parse(raw)
else parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(raw)

const all = collectNodes(parsed)
const unique = [...new Map(all.map((node) => [node.code + ':' + node.name, node])).values()]
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
  process.exit(0)
}

const source = existingSource ?? (await db.insert(schema.pkdSources).values({
  sourceType: 'gs1_gpc',
  sourceVersion: VERSION,
  metadata: { format: file.toLowerCase().endsWith('.json') ? 'json' : 'xml', importedBy: 'db:import-gpc' },
}).returning())[0]

let created = 0
let mapped = 0
for (const node of unique) {
  const stableKey = `gpc:${VERSION}:${node.level}:${node.code}`
  const [entry] = await db.insert(schema.pkdEntries).values({
    stableKey,
    canonicalName: node.name,
    language: 'en',
    category: node.level === 'unknown' ? 'gpc' : node.level,
    attributes: { gpcCode: node.code, level: node.level, parentCode: node.parentCode, path: node.path },
    confidence: 1,
    status: 'approved',
  }).onConflictDoUpdate({
    target: schema.pkdEntries.stableKey,
    set: { canonicalName: node.name, category: node.level === 'unknown' ? 'gpc' : node.level, attributes: { gpcCode: node.code, level: node.level, parentCode: node.parentCode, path: node.path }, updatedAt: new Date() },
  }).returning()
  if (entry) {
    created++
    await db.insert(schema.pkdExternalMappings).values({
      entryId: entry.id,
      sourceId: source.id,
      externalId: node.code,
      externalParentId: node.parentCode,
      mappingStatus: 'mapped',
      confidence: 1,
      evidence: { importer: 'db:import-gpc', level: node.level, path: node.path },
    }).onConflictDoUpdate({
      target: [schema.pkdExternalMappings.sourceId, schema.pkdExternalMappings.externalId],
      set: { entryId: entry.id, externalParentId: node.parentCode, mappingStatus: 'mapped', confidence: 1, evidence: { importer: 'db:import-gpc', level: node.level, path: node.path } },
    })
    mapped++
  }
}
console.log(JSON.stringify({ source: 'gs1_gpc', version: VERSION, totalNodes: unique.length, entriesUpserted: created, mappingsUpserted: mapped, mode: 'apply' }, null, 2))
