import fs from 'node:fs'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'

const OUTPUT_PATH = '.tmp/product-taxonomy-bootstrap-report.json'
const PREVIEW_LIMIT = 200

type CandidateEvidence = Record<string, unknown>

function countValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
}

async function main() {
  const db = getDb()
  const [candidateRows, typeRows, subtypeRows, productTotals] = await Promise.all([
    db.select({
      id: schema.pkdProductTypeCandidates.id,
      candidateKey: schema.pkdProductTypeCandidates.candidateKey,
      canonicalName: schema.pkdProductTypeCandidates.canonicalName,
      normalizedName: schema.pkdProductTypeCandidates.normalizedName,
      language: schema.pkdProductTypeCandidates.language,
      category: schema.pkdProductTypeCandidates.category,
      subcategory: schema.pkdProductTypeCandidates.subcategory,
      confidence: schema.pkdProductTypeCandidates.confidence,
      status: schema.pkdProductTypeCandidates.status,
      evidence: schema.pkdProductTypeCandidates.evidence,
      sourceEntryIds: schema.pkdProductTypeCandidates.sourceEntryIds,
      candidateVersion: schema.pkdProductTypeCandidates.candidateVersion,
    }).from(schema.pkdProductTypeCandidates),
    db.select({
      id: schema.productTypes.id,
      key: schema.productTypes.key,
      name: schema.productTypes.name,
      category: schema.productTypes.category,
    }).from(schema.productTypes),
    db.select({
      id: schema.productSubtypes.id,
      key: schema.productSubtypes.key,
      name: schema.productSubtypes.name,
      productTypeId: schema.productSubtypes.productTypeId,
      isActive: schema.productSubtypes.isActive,
    }).from(schema.productSubtypes),
    db.select({
      total: sql<number>`count(*)::int`,
      withType: sql<number>`count(*) filter (where ${schema.products.productTypeId} is not null)::int`,
      withoutType: sql<number>`count(*) filter (where ${schema.products.productTypeId} is null)::int`,
    }).from(schema.products),
  ])

  const activeTypes = new Set(typeRows.map((row) => normalizeProductText(row.name)).filter(Boolean))
  const statusCounts = countValues(candidateRows.map((row) => row.status))
  const categoryCounts = countValues(candidateRows.map((row) => row.category ?? '(bez kategorie)'))
  const sourceKinds: string[] = []
  const reviewFlags: string[] = []
  const subcategoryCounts: Record<string, number> = {}
  const normalizedNameCounts = new Map<string, number>()
  const exactTypeMatches: string[] = []

  for (const row of candidateRows) {
    const evidence = (row.evidence ?? {}) as CandidateEvidence
    const sources = Array.isArray(evidence.sourceKinds) ? evidence.sourceKinds.filter((v): v is string => typeof v === 'string') : []
    const flags = Array.isArray(evidence.reviewFlags) ? evidence.reviewFlags.filter((v): v is string => typeof v === 'string') : []
    sourceKinds.push(...(sources.length ? sources : ['(zdroj neuveden)']))
    reviewFlags.push(...flags)
    const subcategory = row.subcategory?.trim() || '(bez podkategorie)'
    subcategoryCounts[subcategory] = (subcategoryCounts[subcategory] ?? 0) + 1
    const normalized = normalizeProductText(row.normalizedName || row.canonicalName)
    if (normalized) normalizedNameCounts.set(normalized, (normalizedNameCounts.get(normalized) ?? 0) + 1)
    if (normalized && activeTypes.has(normalized)) exactTypeMatches.push(row.id)
  }

  const preview = [...candidateRows]
    .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0)
      || b.sourceEntryIds.length - a.sourceEntryIds.length
      || (a.candidateKey < b.candidateKey ? -1 : a.candidateKey > b.candidateKey ? 1 : 0))
    .slice(0, PREVIEW_LIMIT)
    .map((row) => {
      const evidence = (row.evidence ?? {}) as CandidateEvidence
      return {
        id: row.id,
        candidateKey: row.candidateKey,
        name: row.canonicalName,
        normalizedName: row.normalizedName,
        language: row.language,
        category: row.category,
        subcategory: row.subcategory,
        confidence: row.confidence === null ? null : Number(row.confidence),
        status: row.status,
        candidateVersion: row.candidateVersion,
        sourceEntryCount: row.sourceEntryIds.length,
        sourceKinds: Array.isArray(evidence.sourceKinds) ? evidence.sourceKinds : [],
        reviewFlags: Array.isArray(evidence.reviewFlags) ? evidence.reviewFlags : [],
      }
    })

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only-dry-run',
    policy: 'No database writes. Candidate rows are evidence, not approved Product Types or Subtypes.',
    catalog: {
      products: Number(productTotals[0]?.total ?? 0),
      productsWithProductType: Number(productTotals[0]?.withType ?? 0),
      productsWithoutProductType: Number(productTotals[0]?.withoutType ?? 0),
    },
    registry: {
      productTypes: typeRows.length,
      productSubtypes: subtypeRows.length,
      activeProductSubtypes: subtypeRows.filter((row) => row.isActive).length,
      inactiveProductSubtypes: subtypeRows.filter((row) => !row.isActive).length,
    },
    candidatePool: {
      rows: candidateRows.length,
      distinctNormalizedNames: normalizedNameCounts.size,
      duplicateNormalizedNameRows: candidateRows.length - normalizedNameCounts.size,
      exactNameMatchesToExistingProductTypes: exactTypeMatches.length,
      byStatus: statusCounts,
      byCategory: categoryCounts,
      bySourceKind: countValues(sourceKinds),
      byReviewFlag: countValues(reviewFlags),
      topSubcategories: Object.entries(subcategoryCounts)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, 100)
        .map(([subcategory, count]) => ({ subcategory, count })),
    },
    highestConfidencePreview: preview,
  }

  fs.mkdirSync('.tmp', { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({
    ...summary,
    highestConfidencePreview: preview.slice(0, 30),
    fullReport: OUTPUT_PATH,
  }, null, 2))
  console.log('\nREAD ONLY: no database writes, approvals, subtype creation, or product assignments.')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
