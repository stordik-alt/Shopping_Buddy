import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { PKD_CANDIDATE_VERSION } from '@/lib/pkd-candidate-generation'
import { normalizeProductText } from '@/lib/product-normalize'

const valueArg = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const apply = process.argv.includes('--apply')
const categoryValues = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const
const unitValues = ['ks', 'kg', 'g', 'l', 'ml'] as const

function makeKey(normalizedName: string) {
  const slug = normalizedName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!slug) throw new Error('Candidate name cannot produce a stable Product Type key.')
  return `pkd-${slug}`
}

async function main() {
  const id = valueArg('id')
  const category = valueArg('category')
  const unit = valueArg('unit')
  const explicitKey = valueArg('key')
  if (!id) throw new Error('Required: --id=<candidate UUID>')
  if (!apply) {
    const db = getDb()
    const candidate = await db.query.pkdProductTypeCandidates.findFirst({
      where: eq(schema.pkdProductTypeCandidates.id, id),
    })
    if (!candidate) throw new Error(`Candidate not found: ${id}`)
    console.log(JSON.stringify({
      mode: 'dry-run',
      candidate: { id: candidate.id, name: candidate.canonicalName, status: candidate.status, sourceEntryCount: candidate.sourceEntryIds.length },
      wouldCreateProductType: true,
      requiredForApply: ['--apply', '--category=<Potraviny|Drogerie|Děti|Domácnost|Ostatní>', '--unit=<ks|kg|g|l|ml>'],
      suggestedKey: makeKey(candidate.normalizedName),
    }, null, 2))
    return
  }
  if (!categoryValues.includes(category as typeof categoryValues[number])) {
    throw new Error(`Invalid --category. Use one of: ${categoryValues.join(', ')}`)
  }
  if (!unitValues.includes(unit as typeof unitValues[number])) {
    throw new Error(`Invalid --unit. Use one of: ${unitValues.join(', ')}`)
  }

  const db = getDb()
  const candidate = await db.query.pkdProductTypeCandidates.findFirst({
    where: eq(schema.pkdProductTypeCandidates.id, id),
  })
  if (!candidate) throw new Error(`Candidate not found: ${id}`)
  if (candidate.status !== 'candidate') throw new Error(`Candidate must be in candidate status; current status: ${candidate.status}`)
  if (candidate.candidateVersion !== PKD_CANDIDATE_VERSION) {
    throw new Error(`Candidate version ${candidate.candidateVersion} is stale; regenerate and review candidates from ${PKD_CANDIDATE_VERSION}.`)
  }
  if (candidate.language !== 'cs') throw new Error('Only Czech-language candidates can become internal Product Types.')
  if (!candidate.sourceEntryIds.length) throw new Error('Candidate has no source entries; refusing to create an untraceable Product Type.')

  const sourceEntries = await db.select({
    id: schema.pkdEntries.id,
    productTypeId: schema.pkdEntries.productTypeId,
  }).from(schema.pkdEntries).where(inArray(schema.pkdEntries.id, candidate.sourceEntryIds))
  if (sourceEntries.length !== candidate.sourceEntryIds.length) {
    throw new Error('Some source entries no longer exist; refresh candidate generation before approval.')
  }
  const allProductTypes = await db.select({ id: schema.productTypes.id, key: schema.productTypes.key, name: schema.productTypes.name, category: schema.productTypes.category, unit: schema.productTypes.unit }).from(schema.productTypes)
  const normalizedCandidateName = normalizeProductText(candidate.canonicalName)
  const sameName = allProductTypes.find((type) => normalizeProductText(type.name) === normalizedCandidateName)
  if (sameName) {
    throw new Error(`A Product Type with the same normalized name already exists: "${sameName.name}" (key: ${sameName.key}). Do not create a case/diacritic duplicate; map the candidate to the existing type instead.`)
  }
  const key = explicitKey ?? makeKey(candidate.normalizedName)
  const existing = allProductTypes.find((type) => type.key === key)
  if (existing && (existing.name !== candidate.canonicalName || existing.category !== category || existing.unit !== unit)) {
    throw new Error(`Product Type key "${key}" already exists with different attributes; choose --key=<unique-key>.`)
  }

  const productType = existing ?? (await db.insert(schema.productTypes).values({
    key,
    name: candidate.canonicalName,
    category: category as typeof schema.productTypes.$inferInsert.category,
    unit: unit as typeof schema.productTypes.$inferInsert.unit,
  }).returning())[0]
  if (!productType) throw new Error('Failed to create or load Product Type.')

  // Recovery path: if a previous run created the type and linked all entries but failed before
  // updating candidate status, allow the same reviewed operation to finish idempotently.
  const alreadyLinked = sourceEntries.filter((entry) => entry.productTypeId === productType.id).length
  const conflictingLinks = sourceEntries.filter((entry) => entry.productTypeId !== null && entry.productTypeId !== productType.id)
  if (conflictingLinks.length) {
    throw new Error('At least one source entry has already been mapped to another Product Type. Reconcile mappings before accepting this candidate.')
  }
  const linked = alreadyLinked === sourceEntries.length
    ? sourceEntries.map((entry) => ({ id: entry.id }))
    : await db.update(schema.pkdEntries)
      .set({ productTypeId: productType.id, updatedAt: new Date() })
      .where(and(inArray(schema.pkdEntries.id, candidate.sourceEntryIds), isNull(schema.pkdEntries.productTypeId)))
      .returning({ id: schema.pkdEntries.id })
  if (linked.length !== candidate.sourceEntryIds.length) {
    throw new Error(`Only linked ${linked.length}/${candidate.sourceEntryIds.length} source entries. Inspect the Product Type and rerun after reconciliation.`)
  }

  await db.update(schema.pkdProductTypeCandidates)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(and(eq(schema.pkdProductTypeCandidates.id, id), eq(schema.pkdProductTypeCandidates.status, 'candidate')))

  console.log(JSON.stringify({
    mode: 'apply',
    candidateId: id,
    productTypeId: productType.id,
    key: productType.key,
    name: productType.name,
    category: productType.category,
    unit: productType.unit,
    linkedEntries: linked.length,
    status: 'accepted',
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
