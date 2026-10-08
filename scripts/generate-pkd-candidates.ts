import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'
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
        reviewFlags: (row.evidence as Record<string, unknown>).reviewFlags ?? [],
        referenceSourceKinds: (row.evidence as Record<string, unknown>).referenceSourceKinds ?? [],
        referenceEvidence: (row.evidence as Record<string, unknown>).referenceEvidence ?? [],
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

  const existingProductTypes = await db.select({ name: schema.productTypes.name }).from(schema.productTypes)

  // Reference taxonomies are evidence only: they are never eligible as candidate identities.
  // Exact normalized-name matches are intentionally used here; broad/fuzzy matches would inflate
  // confidence for unrelated classes and are not safe enough for automatic classification.
  type ReferenceEvidence = { sourceKind: string; matchedName: string; stableKey?: string }
  const referenceIndex = new Map<string, ReferenceEvidence[]>()
  const addReference = (name: string, evidence: ReferenceEvidence) => {
    const normalized = normalizeProductText(name)
    if (!normalized) return
    const current = referenceIndex.get(normalized) ?? []
    current.push(evidence)
    referenceIndex.set(normalized, current)
  }

  for (const entry of entries) {
    if (entry.status !== 'approved') continue
    if (entry.stableKey.startsWith('gpc:')) {
      addReference(entry.canonicalName, { sourceKind: 'gs1_gpc', matchedName: entry.canonicalName, stableKey: entry.stableKey })
    } else if (entry.stableKey.startsWith('cz-cpa:')) {
      addReference(entry.canonicalName, { sourceKind: 'cz_cpa', matchedName: entry.canonicalName, stableKey: entry.stableKey })
    }
  }

  const catalogProducts = await db.select({ name: schema.products.name }).from(schema.products)
  for (const product of catalogProducts) {
    addReference(product.name, { sourceKind: 'product_catalog', matchedName: product.name })
  }

  // Only reliable, curated/confirmed aliases count as catalog evidence; low-confidence AI aliases
  // must not reinforce their own guesses.
  const catalogAliases = await db.select({
    alias: schema.productAliases.alias,
    confidence: schema.productAliases.confidence,
    source: schema.productAliases.source,
  }).from(schema.productAliases)
  for (const alias of catalogAliases) {
    if (Number(alias.confidence) < 0.9 || !['user_correction', 'seed'].includes(alias.source)) continue
    addReference(alias.alias, { sourceKind: 'product_catalog_alias', matchedName: alias.alias })
  }

  const candidates = generatePkdProductTypeCandidates(entries.map((entry) => {
    const attributes = entry.attributes as Record<string, unknown>
    const source = sourceKind(entry.stableKey, attributes)
    return {
      ...entry,
      candidateEligible: source.eligible && entry.language.trim().toLowerCase() === 'cs'
        && !entriesWithExistingMapping.has(entry.id),
      sourceKind: source.kind,
      referenceEvidence: referenceIndex.get(normalizeProductText(entry.canonicalName)) ?? [],
    }
  }), existingProductTypes.map((productType) => productType.name))

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
    reviewFlags: candidate.evidence.reviewFlags,
    referenceSourceKinds: candidate.evidence.referenceSourceKinds,
    referenceEvidence: candidate.evidence.referenceEvidence,
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
