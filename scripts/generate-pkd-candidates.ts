import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { generatePkdProductTypeCandidates, PKD_CANDIDATE_VERSION } from '@/lib/pkd-candidate-generation'

const listMode = process.argv.includes('--list')
const dryRun = !process.argv.includes('--apply') && !listMode
const BATCH_SIZE = 500
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const previewLimit = Math.max(1, Math.min(500, Number(limitArg?.slice('--limit='.length)) || 100))

function sourceKind(stableKey: string, attributes: Record<string, unknown>): { kind: string; eligible: boolean } {
  if (stableKey.startsWith('off:taxonomy:categories:')) {
    const children = Array.isArray(attributes.children) ? attributes.children : []
    return { kind: 'open_food_facts_leaf', eligible: children.length === 0 }
  }
  if (stableKey.startsWith('gpc:')) {
    return { kind: 'gs1_gpc_reference_only', eligible: false }
  }
  if (stableKey.startsWith('cz-cpa:')) {
    return { kind: 'cz_cpa_reference_only', eligible: false }
  }
  if (stableKey.startsWith('ocr:')) return { kind: 'ocr', eligible: true }
  if (stableKey.startsWith('seed:') || stableKey.startsWith('seed_catalog:')) return { kind: 'seed_catalog', eligible: true }
  if (stableKey.startsWith('manual:')) return { kind: 'manual', eligible: true }
  return { kind: 'pkd_other', eligible: true }
}

async function main() {
  const db = getDb()
  if (listMode) {
    const stored = await db.select({
      id: schema.pkdProductTypeCandidates.id,
      canonicalName: schema.pkdProductTypeCandidates.canonicalName,
      normalizedName: schema.pkdProductTypeCandidates.normalizedName,
      language: schema.pkdProductTypeCandidates.language,
      category: schema.pkdProductTypeCandidates.category,
      comparisonUnit: schema.pkdProductTypeCandidates.comparisonUnit,
      confidence: schema.pkdProductTypeCandidates.confidence,
      status: schema.pkdProductTypeCandidates.status,
      evidence: schema.pkdProductTypeCandidates.evidence,
      sourceEntryIds: schema.pkdProductTypeCandidates.sourceEntryIds,
    }).from(schema.pkdProductTypeCandidates)
      .where(eq(schema.pkdProductTypeCandidates.candidateVersion, PKD_CANDIDATE_VERSION))
      .orderBy(asc(schema.pkdProductTypeCandidates.canonicalName))
      .limit(previewLimit)
    console.log(JSON.stringify({
      candidateVersion: PKD_CANDIDATE_VERSION,
      candidates: stored.length,
      limit: previewLimit,
      rows: stored.map((row) => ({
        id: row.id,
        name: row.canonicalName,
        normalizedName: row.normalizedName,
        language: row.language,
        category: row.category,
        unit: row.comparisonUnit,
        confidence: row.confidence,
        status: row.status,
        sourceCount: row.sourceEntryIds.length,
        sources: (row.evidence as Record<string, unknown>).sourceKinds ?? [],
      })),
      mode: 'list',
    }, null, 2))
    return
  }

  const entries = await db.select({
    id: schema.pkdEntries.id,
    stableKey: schema.pkdEntries.stableKey,
    canonicalName: schema.pkdEntries.canonicalName,
    language: schema.pkdEntries.language,
    category: schema.pkdEntries.category,
    subcategory: schema.pkdEntries.subcategory,
    physicalForm: schema.pkdEntries.physicalForm,
    processingState: schema.pkdEntries.processingState,
    comparisonUnit: schema.pkdEntries.comparisonUnit,
    attributes: schema.pkdEntries.attributes,
    productTypeId: schema.pkdEntries.productTypeId,
    status: schema.pkdEntries.status,
  }).from(schema.pkdEntries)

  // Mapping proposals already identify entries that belong to an existing type. They must not
  // simultaneously be proposed as brand-new types while waiting for review.
  const mappingRows = await db.select({
    pkdEntryId: schema.pkdProductTypeMappings.pkdEntryId,
    status: schema.pkdProductTypeMappings.status,
  }).from(schema.pkdProductTypeMappings)
  const entriesWithExistingMapping = new Set(mappingRows
    .filter((row) => row.status !== 'rejected')
    .map((row) => row.pkdEntryId))

  const candidates = generatePkdProductTypeCandidates(entries.map((entry) => {
    const attributes = entry.attributes as Record<string, unknown>
    const source = sourceKind(entry.stableKey, attributes)
    return {
      ...entry,
      candidateEligible: source.eligible && entry.language.trim().toLowerCase() === 'cs'
        && !entriesWithExistingMapping.has(entry.id),
      sourceKind: source.kind,
    }
  }))

  const sourceCounts = candidates.reduce<Record<string, number>>((counts, candidate) => {
    for (const source of candidate.evidence.sourceKinds) counts[source] = (counts[source] ?? 0) + 1
    return counts
  }, {})
  const preview = candidates.slice(0, previewLimit).map((candidate) => ({
    name: candidate.canonicalName,
    normalizedName: candidate.normalizedName,
    language: candidate.language,
    sourceCount: candidate.evidence.sourceEntryCount,
    sources: candidate.evidence.sourceKinds,
    category: candidate.category,
    unit: candidate.comparisonUnit,
    confidence: candidate.confidence,
    candidateKey: candidate.candidateKey,
  }))

  if (dryRun) {
    console.log(JSON.stringify({
      candidateVersion: PKD_CANDIDATE_VERSION,
      totalEntries: entries.length,
      entriesWithExistingMapping: entriesWithExistingMapping.size,
      candidates: candidates.length,
      sourceCounts,
      previewLimit,
      preview,
      mode: 'dry-run',
    }, null, 2))
    return
  }

  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + BATCH_SIZE)
    for (const candidate of batch) {
      await db.insert(schema.pkdProductTypeCandidates).values({
        candidateKey: candidate.candidateKey,
        canonicalName: candidate.canonicalName,
        normalizedName: candidate.normalizedName,
        language: candidate.language,
        category: candidate.category as typeof schema.pkdProductTypeCandidates.$inferInsert.category,
        subcategory: candidate.subcategory,
        physicalForm: candidate.physicalForm,
        processingState: candidate.processingState,
        comparisonUnit: candidate.comparisonUnit as typeof schema.pkdProductTypeCandidates.$inferInsert.comparisonUnit,
        evidence: candidate.evidence,
        sourceEntryIds: candidate.sourceEntryIds,
        confidence: candidate.confidence.toFixed(3),
        candidateVersion: candidate.candidateVersion,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [schema.pkdProductTypeCandidates.candidateKey, schema.pkdProductTypeCandidates.candidateVersion],
        set: {
          canonicalName: candidate.canonicalName,
          normalizedName: candidate.normalizedName,
          language: candidate.language,
          category: candidate.category as typeof schema.pkdProductTypeCandidates.$inferInsert.category,
          subcategory: candidate.subcategory,
          physicalForm: candidate.physicalForm,
          processingState: candidate.processingState,
          comparisonUnit: candidate.comparisonUnit as typeof schema.pkdProductTypeCandidates.$inferInsert.comparisonUnit,
          evidence: candidate.evidence,
          sourceEntryIds: candidate.sourceEntryIds,
          confidence: candidate.confidence.toFixed(3),
          candidateVersion: candidate.candidateVersion,
          updatedAt: new Date(),
        },
      })
    }
    console.log(`Candidate batch ${Math.min(offset + BATCH_SIZE, candidates.length)}/${candidates.length}`)
  }

  console.log(JSON.stringify({
    candidateVersion: PKD_CANDIDATE_VERSION,
    totalEntries: entries.length,
    entriesWithExistingMapping: entriesWithExistingMapping.size,
    candidates: candidates.length,
    sourceCounts,
    previewLimit,
    preview,
    mode: 'apply',
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
