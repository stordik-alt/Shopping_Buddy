import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import {
  PRODUCT_SUBTYPE_EVIDENCE_RESOLVER_VERSION,
  resolveProductSubtypeEvidence,
  type ProductSubtypeResolverResult,
} from '@/lib/product-subtype-evidence-resolver'

const TARGET_PRODUCT_TYPE_KEYS = [
  'pivo',
  'testoviny',
  'ryze',
  'tvaroh',
  'taveny-syr',
  'tunak-konzerva',
] as const
const DETAIL_SAMPLE_LIMIT = 25

type CatalogRow = {
  id: string
  name: string
  brand: string | null
  variant: string | null
  productTypeKey: string | null
  productSubtypeKey: string | null
}

function summarizeCounts(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

function itemDetail(row: CatalogRow, result: ProductSubtypeResolverResult) {
  const productName = [row.brand, row.name, row.variant].filter(Boolean).join(' ')
  const selected = result.candidates.find((candidate) => candidate.subtypeKey === result.proposedSubtypeKey)
  const rationale = result.decision === 'match'
    ? `Explicit evidence matched ${selected?.label ?? result.proposedSubtypeKey}; deterministic family priority was applied.`
    : result.reason === 'conflicting_evidence'
      ? 'Explicit evidence supports mutually exclusive candidates at the same priority; human review is required.'
      : result.reason === 'existing_assignment'
        ? `Existing assignment "${result.existingSubtypeKey}" was preserved; no new subtype was proposed.`
        : result.reason === 'unsupported_category'
          ? `Product Type "${result.productTypeKey}" is outside the six expansion families implemented by this resolver.`
          : 'No sufficient explicit subtype evidence was found; no subtype was proposed.'

  return {
    productId: row.id,
    productName,
    productTypeKey: row.productTypeKey,
    existingSubtypeKey: row.productSubtypeKey,
    decision: result.decision,
    proposedSubtypeKey: result.proposedSubtypeKey,
    reason: result.reason,
    rationale,
    evidence: result.evidence,
    candidates: result.candidates,
  }
}

async function main() {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      brand: schema.products.brand,
      variant: schema.products.variant,
      productTypeKey: schema.productTypes.key,
      productSubtypeKey: schema.productSubtypes.key,
    })
    .from(schema.products)
    .leftJoin(schema.productTypes, eq(schema.products.productTypeId, schema.productTypes.id))
    .leftJoin(schema.productSubtypes, eq(schema.products.productSubtypeId, schema.productSubtypes.id))

  const targetRows = rows.filter((row) => TARGET_PRODUCT_TYPE_KEYS.includes(row.productTypeKey as (typeof TARGET_PRODUCT_TYPE_KEYS)[number]))
  const targetByType = summarizeCounts(targetRows.map((row) => row.productTypeKey ?? ''))
  const existingAssignments = rows.filter((row) => Boolean(row.productSubtypeKey))
  const targetExistingAssignments = targetRows.filter((row) => Boolean(row.productSubtypeKey))

  const classified = targetRows.map((row) => {
    const productName = [row.brand, row.name, row.variant].filter(Boolean).join(' ')
    const result = resolveProductSubtypeEvidence({
      productId: row.id,
      productName,
      productTypeKey: row.productTypeKey!,
      existingSubtypeKey: row.productSubtypeKey,
    })
    return { row, result, detail: itemDetail(row, result) }
  })

  const decisionCounts = summarizeCounts(classified.map(({ result }) => result.decision))
  const reasonCounts = summarizeCounts(
    classified.flatMap(({ result }) => result.reason ? [result.reason] : []),
  )
  const subtypeCounts = summarizeCounts(
    classified.flatMap(({ result }) => result.proposedSubtypeKey ? [result.proposedSubtypeKey] : []),
  )
  const noEvidence = classified.filter(({ result }) => result.decision === 'no_match' && result.reason === 'insufficient_evidence')
  const conflicts = classified.filter(({ result }) => result.reason === 'conflicting_evidence')
  const reviews = classified.filter(({ result }) => result.decision === 'review')
  const matches = classified.filter(({ result }) => result.decision === 'match')
  const noDetails = process.argv.includes('--details')
  const details = noDetails
    ? classified.map(({ detail }) => detail)
    : [
        ...matches.slice(0, DETAIL_SAMPLE_LIMIT),
        ...reviews.slice(0, DETAIL_SAMPLE_LIMIT),
        ...noEvidence.slice(0, DETAIL_SAMPLE_LIMIT),
      ].map(({ detail }) => detail)

  const report = {
    status: 'ok',
    mode: 'READ ONLY — no INSERT/UPDATE/DELETE and no assignment changes',
    resolverVersion: PRODUCT_SUBTYPE_EVIDENCE_RESOLVER_VERSION,
    totals: {
      catalogProducts: rows.length,
      targetProductTypeProducts: targetRows.length,
      productsWithoutProductType: rows.filter((row) => !row.productTypeKey).length,
      productsOutsideTargetFamilies: rows.filter((row => row.productTypeKey && !TARGET_PRODUCT_TYPE_KEYS.includes(row.productTypeKey as (typeof TARGET_PRODUCT_TYPE_KEYS)[number]))).length,
      existingSubtypeAssignmentsCatalogWide: existingAssignments.length,
      existingSubtypeAssignmentsInTargetFamilies: targetExistingAssignments.length,
      processedProducts: classified.length,
      matches: matches.length,
      reviews: reviews.length,
      conflicts: conflicts.length,
      noMatchInsufficientEvidence: noEvidence.length,
    },
    targetProductsByProductType: targetByType,
    decisions: decisionCounts,
    reviewReasons: reasonCounts,
    proposedSubtypeCounts: subtypeCounts,
    detailsMode: noDetails ? 'all-target-products' : `samples-up-to-${DETAIL_SAMPLE_LIMIT}-per-decision-class`,
    detailsReturned: details.length,
    detailsOmitted: Math.max(0, classified.length - details.length),
    details,
    dataLimits: [
      'Only the six Product Types listed in this report are evaluated; other Product Types are counted but not classified.',
      'The products table exposes name, brand and variant but no standalone product description field in this query.',
      'No manufacturer specification or verified-attribute source is joined; this run therefore uses product name/brand/variant text only.',
      'Catalog product subtype assignments are read for protection and reporting only; this script never writes assignments.',
      'Aggregate examples in the proposal JSON are not treated as evidence for individual products.',
    ],
  }

  console.log('Product Subtype expansion simulation — READ ONLY')
  console.log(JSON.stringify(report, null, 2))
  console.log('\nNo database writes were performed. Use --details to include every product in the six target Product Types.')
}

void main().catch((error) => {
  console.error(JSON.stringify({
    status: 'error',
    mode: 'READ ONLY — no writes were attempted',
    resolverVersion: PRODUCT_SUBTYPE_EVIDENCE_RESOLVER_VERSION,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
