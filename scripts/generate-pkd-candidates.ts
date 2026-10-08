import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { generatePkdProductTypeCandidates, PKD_CANDIDATE_VERSION } from '@/lib/pkd-candidate-generation'

const dryRun = !process.argv.includes('--apply')

async function main() {
  const db = getDb()
  const entries = await db.select({
    id: schema.pkdEntries.id,
    canonicalName: schema.pkdEntries.canonicalName,
    language: schema.pkdEntries.language,
    category: schema.pkdEntries.category,
    subcategory: schema.pkdEntries.subcategory,
    physicalForm: schema.pkdEntries.physicalForm,
    processingState: schema.pkdEntries.processingState,
    comparisonUnit: schema.pkdEntries.comparisonUnit,
    productTypeId: schema.pkdEntries.productTypeId,
    status: schema.pkdEntries.status,
  }).from(schema.pkdEntries)

  const candidates = generatePkdProductTypeCandidates(entries)

  if (dryRun) {
    console.log(JSON.stringify({
      candidateVersion: PKD_CANDIDATE_VERSION,
      totalEntries: entries.length,
      candidates: candidates.length,
      mode: 'dry-run',
    }, null, 2))
    return
  }

  for (const candidate of candidates) {
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
      target: schema.pkdProductTypeCandidates.candidateKey,
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

  console.log(JSON.stringify({
    candidateVersion: PKD_CANDIDATE_VERSION,
    totalEntries: entries.length,
    candidates: candidates.length,
    mode: 'apply',
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
