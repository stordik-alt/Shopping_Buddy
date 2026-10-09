import { PRODUCT_SUBTYPE_PROPOSALS, PRODUCT_TYPE_PARENT_PROPOSALS } from '@/lib/product-subtype-registry'

export type ProductSubtypeAuditRow = {
  id: string
  name: string
  category: string
  defaultUnit: string
  productTypeKey: string | null
  productTypeName: string | null
  productTypeCategory: string | null
  productTypeUnit: string | null
  productTypeSource: string | null
  productSubtypeKey: string | null
  productSubtypeName: string | null
  productSubtypeSource: string | null
}

export type ProductSubtypeAuditResult = {
  registryVersion: string
  products: number
  assignedProductType: number
  unassignedProductType: number
  existingSubtypeAssignments: number
  existingSubtypeSourceBreakdown: Record<string, number>
  provenance: Record<string, number>
  proposedParents: Array<{
    parentTypeKey: string
    parentTypeName: string
    products: number
    source: Record<string, number>
    candidateProducts: number
    manualReviewProducts: number
  }>
  outsideRegistry: Array<{ productTypeKey: string; productTypeName: string; products: number }>
  unmappedProducts: number
  categoryMismatches: number
  defaultUnitDivergences: number
  eligibleCandidateProducts: number
  manualReviewProducts: number
}

const legacyToProposal = new Map(
  PRODUCT_SUBTYPE_PROPOSALS.map((entry) => [entry.legacyProductTypeKey, entry]),
)

const parentByKey = new Map(PRODUCT_TYPE_PARENT_PROPOSALS.map((entry) => [entry.key, entry]))

export function auditProductSubtypeMigration(rows: readonly ProductSubtypeAuditRow[]): ProductSubtypeAuditResult {
  const provenance: Record<string, number> = {}
  const subtypeSources: Record<string, number> = {}
  const parentStats = new Map<string, { products: number; source: Record<string, number>; candidateProducts: number; manualReviewProducts: number }>()
  const outside = new Map<string, { productTypeName: string; products: number }>()
  let unassignedProductType = 0
  let existingSubtypeAssignments = 0
  let categoryMismatches = 0
  let defaultUnitDivergences = 0
  let eligibleCandidateProducts = 0
  let manualReviewProducts = 0

  for (const row of rows) {
    const source = row.productTypeSource ?? 'unknown'
    provenance[source] = (provenance[source] ?? 0) + 1

    if (row.productSubtypeKey) {
      existingSubtypeAssignments += 1
      const subtypeSource = row.productSubtypeSource ?? 'unknown'
      subtypeSources[subtypeSource] = (subtypeSources[subtypeSource] ?? 0) + 1
    }

    if (!row.productTypeKey) {
      unassignedProductType += 1
    } else {
      const proposal = legacyToProposal.get(row.productTypeKey)
      if (proposal) {
        const parent = parentByKey.get(proposal.parentTypeKey)!
        const stats = parentStats.get(parent.key) ?? {
          products: 0,
          source: {},
          candidateProducts: 0,
          manualReviewProducts: 0,
        }
        stats.products += 1
        stats.source[source] = (stats.source[source] ?? 0) + 1
        if (source === 'manual') {
          stats.manualReviewProducts += 1
          manualReviewProducts += 1
        } else {
          stats.candidateProducts += 1
          eligibleCandidateProducts += 1
        }
        parentStats.set(parent.key, stats)
      } else {
        const existing = outside.get(row.productTypeKey) ?? { productTypeName: row.productTypeName ?? row.productTypeKey, products: 0 }
        existing.products += 1
        outside.set(row.productTypeKey, existing)
      }
    }

    if (row.productTypeKey && row.productTypeCategory && row.category !== row.productTypeCategory) categoryMismatches += 1
    if (row.productTypeKey && row.productTypeUnit && row.defaultUnit !== row.productTypeUnit) defaultUnitDivergences += 1
  }

  const proposedParents = PRODUCT_TYPE_PARENT_PROPOSALS.map((parent) => {
    const stats = parentStats.get(parent.key) ?? { products: 0, source: {}, candidateProducts: 0, manualReviewProducts: 0 }
    return {
      parentTypeKey: parent.key,
      parentTypeName: parent.name,
      products: stats.products,
      source: Object.fromEntries(Object.entries(stats.source).sort(([a], [b]) => a.localeCompare(b))),
      candidateProducts: stats.candidateProducts,
      manualReviewProducts: stats.manualReviewProducts,
    }
  })

  return {
    registryVersion: '2026-10-v1',
    products: rows.length,
    assignedProductType: rows.length - unassignedProductType,
    unassignedProductType,
    existingSubtypeAssignments,
    existingSubtypeSourceBreakdown: subtypeSources,
    provenance,
    proposedParents,
    outsideRegistry: [...outside.entries()]
      .map(([productTypeKey, value]) => ({ productTypeKey, ...value }))
      .sort((a, b) => b.products - a.products || a.productTypeKey.localeCompare(b.productTypeKey)),
    unmappedProducts: unassignedProductType,
    categoryMismatches,
    defaultUnitDivergences,
    eligibleCandidateProducts,
    manualReviewProducts,
  }
}
