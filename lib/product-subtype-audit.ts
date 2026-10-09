import {
  PRODUCT_SUBTYPE_PROPOSALS,
  PRODUCT_SUBTYPE_REGISTRY_VERSION,
  PRODUCT_TYPE_PARENT_PROPOSALS,
} from '@/lib/product-subtype-registry'

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

type ProductTypeAuditSummary = {
  productTypeKey: string
  productTypeName: string
  proposedParentTypeKey: string | null
  proposedParentTypeName: string | null
  inSubtypeRegistry: boolean
  products: number
  source: Record<string, number>
  candidateProducts: number
  manualReviewProducts: number
  categoryMismatchProducts: number
  defaultUnitDivergenceProducts: number
}

export type ProductSubtypeAuditResult = {
  registryVersion: string
  products: number
  assignedProductType: number
  unassignedProductType: number
  existingSubtypeAssignments: number
  existingSubtypeSourceBreakdown: Record<string, number>
  provenance: Record<string, number>
  productTypes: ProductTypeAuditSummary[]
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

const TRUSTED_PROVENANCE = new Set(['rule', 'alias', 'pkd'])

const legacyToProposal = new Map(
  PRODUCT_SUBTYPE_PROPOSALS.map((entry) => [entry.legacyProductTypeKey, entry]),
)

const parentByKey = new Map(PRODUCT_TYPE_PARENT_PROPOSALS.map((entry) => [entry.key, entry]))

export function auditProductSubtypeMigration(rows: readonly ProductSubtypeAuditRow[]): ProductSubtypeAuditResult {
  const provenance: Record<string, number> = {}
  const subtypeSources: Record<string, number> = {}
  const parentStats = new Map<string, { products: number; source: Record<string, number>; candidateProducts: number; manualReviewProducts: number }>()
  const typeStats = new Map<string, ProductTypeAuditSummary>()
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
      const parent = proposal ? parentByKey.get(proposal.parentTypeKey) ?? null : null
      let type = typeStats.get(row.productTypeKey)
      if (!type) {
        type = {
          productTypeKey: row.productTypeKey,
          productTypeName: row.productTypeName ?? row.productTypeKey,
          proposedParentTypeKey: parent?.key ?? null,
          proposedParentTypeName: parent?.name ?? null,
          inSubtypeRegistry: Boolean(proposal && parent),
          products: 0,
          source: {},
          candidateProducts: 0,
          manualReviewProducts: 0,
          categoryMismatchProducts: 0,
          defaultUnitDivergenceProducts: 0,
        }
        typeStats.set(row.productTypeKey, type)
      }

      type.products += 1
      type.source[source] = (type.source[source] ?? 0) + 1
      if (row.productTypeCategory && row.category !== row.productTypeCategory) {
        type.categoryMismatchProducts += 1
        categoryMismatches += 1
      }
      if (row.productTypeUnit && row.defaultUnit !== row.productTypeUnit) {
        type.defaultUnitDivergenceProducts += 1
        defaultUnitDivergences += 1
      }

      if (proposal && parent) {
        const stats = parentStats.get(parent.key) ?? {
          products: 0,
          source: {},
          candidateProducts: 0,
          manualReviewProducts: 0,
        }
        stats.products += 1
        stats.source[source] = (stats.source[source] ?? 0) + 1

        // A row with an existing subtype is already classified and is not proposed again.
        if (!row.productSubtypeKey) {
          if (TRUSTED_PROVENANCE.has(source)) {
            stats.candidateProducts += 1
            type.candidateProducts += 1
            eligibleCandidateProducts += 1
          } else {
            // Manual and unknown provenance require explicit review; they must not be inferred.
            stats.manualReviewProducts += 1
            type.manualReviewProducts += 1
            manualReviewProducts += 1
          }
        }
        parentStats.set(parent.key, stats)
      } else {
        const existing = outside.get(row.productTypeKey) ?? {
          productTypeName: row.productTypeName ?? row.productTypeKey,
          products: 0,
        }
        existing.products += 1
        outside.set(row.productTypeKey, existing)
      }
    }
  }

  const proposedParents = PRODUCT_TYPE_PARENT_PROPOSALS.map((parent) => {
    const stats = parentStats.get(parent.key) ?? {
      products: 0,
      source: {},
      candidateProducts: 0,
      manualReviewProducts: 0,
    }
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
    registryVersion: PRODUCT_SUBTYPE_REGISTRY_VERSION,
    products: rows.length,
    assignedProductType: rows.length - unassignedProductType,
    unassignedProductType,
    existingSubtypeAssignments,
    existingSubtypeSourceBreakdown: subtypeSources,
    provenance: Object.fromEntries(Object.entries(provenance).sort(([a], [b]) => a.localeCompare(b))),
    productTypes: [...typeStats.values()].sort((a, b) => b.products - a.products || a.productTypeKey.localeCompare(b.productTypeKey)),
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
