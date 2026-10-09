import fs from 'node:fs'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'
import { getProductTypeCandidateReviewFlags, isSuitableCzechRetailProductTypeCandidate } from '@/lib/product-type-candidate-suitability'

const OUTPUT_PATH = '.tmp/product-taxonomy-bootstrap-report.json'
const PREVIEW_LIMIT = 200
const NAME_MIN_LENGTH = 3

type CandidateEvidence = Record<string, unknown>

function cmp(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }

function countValues(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => cmp(a, b)))
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function candidateSource(row: { candidateVersion: string; evidence: CandidateEvidence; sourceEntryIds: string[] }): string {
  const recordedKinds = strings(row.evidence.sourceKinds)
  if (recordedKinds.length) return recordedKinds.sort(cmp).join('+')
  const refKinds = strings(row.evidence.referenceSourceKinds)
  if (refKinds.length) return refKinds.sort(cmp).join('+')
  const versions = row.candidateVersion.toLowerCase()
  if (versions.includes('off')) return 'open_food_facts_legacy_candidate'
  if (versions.includes('gpc') || versions.includes('gs1')) return 'gs1_gpc_legacy_candidate'
  if (versions.includes('cpa')) return 'cz_cpa_legacy_candidate'
  if (versions.includes('seed')) return 'seed_or_manual_legacy_candidate'
  if (row.sourceEntryIds.length > 0) return 'mixed_or_legacy_pkd_candidate'
  return 'unknown_source'
}

async function main() {
  const db = getDb()
  const [candidateRows, typeRows, subtypeRows, productTotals, candidateSourceRows] = await Promise.all([
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
    db.select({
      id: schema.pkdProductTypeCandidates.id,
      candidateVersion: schema.pkdProductTypeCandidates.candidateVersion,
      language: schema.pkdProductTypeCandidates.language,
      evidence: schema.pkdProductTypeCandidates.evidence,
      sourceEntryIds: schema.pkdProductTypeCandidates.sourceEntryIds,
    }).from(schema.pkdProductTypeCandidates),
  ])

  const existingTypeNames = new Set(typeRows.map((row) => normalizeProductText(row.name)).filter(Boolean))
  const statusCounts = countValues(candidateRows.map((row) => row.status))
  const categoryCounts = countValues(candidateRows.map((row) => row.category ?? '(bez kategorie)'))
  const languageCounts = countValues(candidateRows.map((row) => row.language || '(jazyk neuveden)'))
  const sourceCounts = countValues(candidateRows.map((row) => candidateSource(row)))
  const reviewFlagCounts: string[] = []
  const subcategoryCounts: Record<string, number> = {}
  const candidateKeyCounts = new Map<string, number>()
  const duplicateNormalizedRows = new Map<string, number>()
  const exactTypeMatches: string[] = []
  const scored = candidateRows.map((row) => {
    const evidence = (row.evidence ?? {}) as CandidateEvidence
    const source = candidateSource({ candidateVersion: row.candidateVersion, evidence, sourceEntryIds: row.sourceEntryIds })
    const flags = getProductTypeCandidateReviewFlags(row.canonicalName, row.language)
    for (const flag of flags) reviewFlagCounts.push(flag)
    const subcategory = row.subcategory?.trim() || '(bez podkategorie)'
    subcategoryCounts[subcategory] = (subcategoryCounts[subcategory] ?? 0) + 1
    const normalized = normalizeProductText(row.normalizedName || row.canonicalName)
    if (normalized) duplicateNormalizedRows.set(normalized, (duplicateNormalizedRows.get(normalized) ?? 0) + 1)
    candidateKeyCounts.set(row.candidateKey, (candidateKeyCounts.get(row.candidateKey) ?? 0) + 1)
    const match = Boolean(normalized && existingTypeNames.has(normalized))
    if (match) exactTypeMatches.push(row.id)
    const flagsForMapping = [...flags]
    if (row.language !== 'cs') flagsForMapping.push('not_eligible_for_czech_registry')
    if (!row.category) flagsForMapping.push('missing_category')
    if (!row.subcategory) flagsForMapping.push('missing_subcategory')
    const confidence = row.confidence === null ? null : Number(row.confidence)
    // The stored confidence is a source-engine score, not a product-type suitability score.
    // Never let it rank English definitions or service/attribute labels above actual Czech goods.
    const suitableForReview = isSuitableCzechRetailProductTypeCandidate(row.canonicalName, row.language)
      && Boolean(normalized && normalized.length >= NAME_MIN_LENGTH)
    return { row, source, flags: flagsForMapping, normalized, match, confidence, suitableForReview }
  })

  const preview = scored
    .filter((item) => item.suitableForReview && !item.match && item.row.status === 'candidate')
    .sort((a, b) => {
      const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0)
      if (confidenceDelta) return confidenceDelta
      if (b.row.sourceEntryIds.length !== a.row.sourceEntryIds.length) return b.row.sourceEntryIds.length - a.row.sourceEntryIds.length
      return cmp(a.row.candidateKey, b.row.candidateKey)
    })
    .slice(0, PREVIEW_LIMIT)
    .map(({ row, source, flags, normalized, match, confidence, suitableForReview }) => ({
      id: row.id,
      candidateKey: row.candidateKey,
      name: row.canonicalName,
      normalizedName: normalized,
      language: row.language,
      category: row.category,
      subcategory: row.subcategory,
      confidence,
      status: row.status,
      candidateVersion: row.candidateVersion,
      sourceEntryCount: row.sourceEntryIds.length,
      source,
      reviewFlags: flags,
      exactMatchToExistingType: match,
      suitableForReview,
    }))

  const duplicateGroups = [...duplicateNormalizedRows.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .slice(0, 200)
    .map(([normalizedName, rows]) => ({ normalizedName, rows }))

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only-dry-run',
    policy: 'No database writes. Candidate rows are evidence, not approved Product Types or Subtypes. Source confidence is not suitability confidence.',
    catalog: {
      products: Number(productTotals[0]?.total ?? 0),
      productsWithProductType: Number(productTotals[0]?.withType ?? 0),
      productsWithoutProductType: Number(productTotals[0]?.withoutType ?? 0),
      productTypeCoveragePercent: Number(productTotals[0]?.total ?? 0)
        ? Number(((Number(productTotals[0]?.withType ?? 0) / Number(productTotals[0]?.total ?? 1)) * 100).toFixed(2))
        : 0,
    },
    registry: {
      productTypes: typeRows.length,
      productSubtypes: subtypeRows.length,
      activeProductSubtypes: subtypeRows.filter((row) => row.isActive).length,
      inactiveProductSubtypes: subtypeRows.filter((row) => !row.isActive).length,
    },
    candidatePool: {
      rows: candidateRows.length,
      distinctNormalizedNames: duplicateNormalizedRows.size,
      duplicateNormalizedNameRows: candidateRows.length - duplicateNormalizedRows.size,
      duplicateNormalizedNameGroups: [...duplicateNormalizedRows.values()].filter((count) => count > 1).length,
      topDuplicateGroups: duplicateGroups,
      exactNameMatchesToExistingProductTypes: exactTypeMatches.length,
      byStatus: statusCounts,
      byCategory: categoryCounts,
      byLanguage: languageCounts,
      bySource: sourceCounts,
      byReviewFlag: countValues(reviewFlagCounts),
      topSubcategories: Object.entries(subcategoryCounts)
        .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
        .slice(0, 100)
        .map(([subcategory, count]) => ({ subcategory, count })),
      suitableCzechCandidatePreviewCount: preview.length,
      previewCriteria: 'Czech label, at least 3 normalized characters, no obvious definition/service/commercial-activity label, not an exact existing Product Type name; human registry review is still required.',
    },
    suitableCzechCandidatePreview: preview,
    rawCandidateSourceMetadata: {
      note: 'The candidate table does not retain a dedicated source-kind column. Source is inferred conservatively from evidence and candidateVersion; legacy rows with missing evidence remain unknown/mixed and must not be auto-approved.',
      sourceKindsAvailableInEvidence: countValues(candidateSourceRows.flatMap((row) => strings((row.evidence as CandidateEvidence | null)?.sourceKinds))),
    },
  }

  fs.mkdirSync('.tmp', { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({
    ...summary,
    candidatePool: {
      ...summary.candidatePool,
      topDuplicateGroups: duplicateGroups.slice(0, 30),
    },
    suitableCzechCandidatePreview: preview.slice(0, 30),
    fullReport: OUTPUT_PATH,
  }, null, 2))
  console.log('\nREAD ONLY: no database writes, approvals, subtype creation, or product assignments.')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
