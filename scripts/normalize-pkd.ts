import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { findPkdDedupCandidates, normalizePkdEntry, PKD_NORMALIZATION_VERSION, type PkdNormalizationInput } from '@/lib/pkd-normalization'

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
  }).from(schema.pkdEntries)

  const inputs: PkdNormalizationInput[] = entries
  const normalizations = inputs.map(normalizePkdEntry)
  const candidates = findPkdDedupCandidates(inputs)

  if (dryRun) {
    console.log(JSON.stringify({
      normalizationVersion: PKD_NORMALIZATION_VERSION,
      totalEntries: inputs.length,
      normalizations: normalizations.length,
      dedupCandidates: candidates.length,
      mode: 'dry-run',
    }, null, 2))
    return
  }

  const BATCH_SIZE = 500
  for (let offset = 0; offset < normalizations.length; offset += BATCH_SIZE) {
    const batch = normalizations.slice(offset, offset + BATCH_SIZE)
    await db.transaction(async (tx) => {
      await tx.insert(schema.pkdEntryNormalizations).values(batch.map((normalization) => ({ entryId: normalization.entryId, normalizationVersion: normalization.normalizationVersion, normalizedName: normalization.normalizedName, identityKey: normalization.identityKey, methods: normalization.methods }))).onConflictDoUpdate({ target: [schema.pkdEntryNormalizations.entryId, schema.pkdEntryNormalizations.normalizationVersion], set: { normalizedName: schema.pkdEntryNormalizations.normalizedName, identityKey: schema.pkdEntryNormalizations.identityKey, methods: schema.pkdEntryNormalizations.methods } })
    })
    console.log(`Normalization batch ${Math.min(offset + BATCH_SIZE, normalizations.length)}/${normalizations.length}`)
  }
  let candidatesUpserted = 0
  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + BATCH_SIZE)
    await db.transaction(async (tx) => {
      await tx.insert(schema.pkdDedupCandidates).values(batch.map((candidate) => { const [leftEntryId, rightEntryId] = [candidate.leftEntryId, candidate.rightEntryId].sort(); return { leftEntryId, rightEntryId, normalizationVersion: candidate.normalizationVersion, reason: candidate.reason, confidence: candidate.confidence.toFixed(3), evidence: candidate.evidence } })).onConflictDoUpdate({ target: [schema.pkdDedupCandidates.leftEntryId, schema.pkdDedupCandidates.rightEntryId, schema.pkdDedupCandidates.normalizationVersion], set: { reason: schema.pkdDedupCandidates.reason, confidence: schema.pkdDedupCandidates.confidence, evidence: schema.pkdDedupCandidates.evidence } })
      candidatesUpserted += batch.length
    })
    console.log(`Dedup batch ${Math.min(offset + BATCH_SIZE, candidates.length)}/${candidates.length}`)
  }

  console.log(JSON.stringify({
    normalizationVersion: PKD_NORMALIZATION_VERSION,
    totalEntries: inputs.length,
    normalizations: normalizations.length,
    dedupCandidates: candidatesUpserted,
    mode: 'apply',
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
