import { PRODUCT_TYPES } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'
import {
  PRODUCT_SUBTYPE_PROPOSALS,
  PRODUCT_TYPE_PARENT_PROPOSALS,
} from '@/lib/product-subtype-registry'
import type { ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

export type ProductSubtypeMappingStatus = 'candidate' | 'review' | 'existing' | 'outside_registry'
export type ProductSubtypeMappingReasonCode =
  | 'candidate'
  | 'existing_subtype_assignment'
  | 'no_product_type'
  | 'product_type_outside_registry'
  | 'category_mismatch'
  | 'untrusted_provenance'

export type ProductSubtypeMapping = {
  productId: string
  productName: string
  category: string
  defaultUnit: string
  productTypeKey: string | null
  productTypeName: string | null
  productTypeProvenance: string
  parentTypeKey: string | null
  parentTypeName: string | null
  subtypeKey: string | null
  subtypeName: string | null
  provenance: string
  status: ProductSubtypeMappingStatus
  reasonCode: ProductSubtypeMappingReasonCode
  reason: string
}

export type ProductSubtypeMappingReasonGroup = {
  reasonCode: ProductSubtypeMappingReasonCode
  reason: string
  count: number
  samples: Array<{
    productId: string
    productName: string
    category: string
    productTypeKey: string | null
    productTypeName: string | null
    productTypeProvenance: string
    parentTypeKey: string | null
    subtypeKey: string | null
    provenance: string
  }>
}

const TRUSTED_PROVENANCE = new Set(['rule', 'alias', 'pkd'])
const productTypeDefinitions = new Map(PRODUCT_TYPES.map((type) => [type.key, type]))
const proposalByLegacyType = new Map(
  PRODUCT_SUBTYPE_PROPOSALS.map((proposal) => [proposal.legacyProductTypeKey, proposal]),
)
const parentByKey = new Map(PRODUCT_TYPE_PARENT_PROPOSALS.map((parent) => [parent.key, parent]))

const REASON_TEXT: Record<ProductSubtypeMappingReasonCode, string> = {
  candidate: 'Deterministic mapping from the reviewed legacy Product Type to its registered Product Subtype.',
  existing_subtype_assignment: 'Product already has a Product Subtype; existing classification is never overwritten.',
  no_product_type: 'Product has no Product Type and cannot be mapped by the current registry.',
  product_type_outside_registry: 'Current Product Type has no mapping in the reviewed starter registry.',
  category_mismatch: 'Product category is outside the Product Type definition; explicit review is required before mapping.',
  untrusted_provenance: 'Product Type provenance is manual/unknown and is not trusted for automatic subtype mapping.',
}

function hasCategoryMismatch(row: ProductSubtypeAuditRow): boolean {
  if (!row.productTypeKey) return false
  const definition = productTypeDefinitions.get(row.productTypeKey)
  if (definition) return !definition.categories.includes(row.category as ItemCategory)
  return Boolean(row.productTypeCategory && row.category !== row.productTypeCategory)
}

function mappingBase(row: ProductSubtypeAuditRow) {
  return {
    productId: row.id,
    productName: row.name,
    category: row.category,
    defaultUnit: row.defaultUnit,
    productTypeKey: row.productTypeKey,
    productTypeName: row.productTypeName,
    productTypeProvenance: row.productTypeSource ?? 'unknown',
  }
}

function makeMapping(
  row: ProductSubtypeAuditRow,
  status: ProductSubtypeMappingStatus,
  reasonCode: ProductSubtypeMappingReasonCode,
  extra: Partial<Pick<ProductSubtypeMapping, 'parentTypeKey' | 'parentTypeName' | 'subtypeKey' | 'subtypeName' | 'provenance'>> = {},
): ProductSubtypeMapping {
  return {
    ...mappingBase(row),
    parentTypeKey: null,
    parentTypeName: null,
    subtypeKey: null,
    subtypeName: null,
    provenance: row.productTypeSource ?? 'unknown',
    status,
    reasonCode,
    reason: REASON_TEXT[reasonCode],
    ...extra,
  }
}

export function buildProductSubtypeMappings(
  rows: readonly ProductSubtypeAuditRow[],
): ProductSubtypeMapping[] {
  return rows.map((row) => {
    if (row.productSubtypeKey) {
      return makeMapping(row, 'existing', 'existing_subtype_assignment', {
        subtypeKey: row.productSubtypeKey,
        subtypeName: row.productSubtypeName,
        provenance: row.productSubtypeSource ?? 'unknown',
      })
    }

    if (!row.productTypeKey) {
      return makeMapping(row, 'outside_registry', 'no_product_type')
    }

    const proposal = proposalByLegacyType.get(row.productTypeKey)
    const parent = proposal ? parentByKey.get(proposal.parentTypeKey) : undefined
    if (!proposal || !parent) {
      return makeMapping(row, 'outside_registry', 'product_type_outside_registry')
    }

    const proposed = {
      parentTypeKey: parent.key,
      parentTypeName: parent.name,
      subtypeKey: proposal.key,
      subtypeName: proposal.name,
    }

    if (hasCategoryMismatch(row)) {
      return makeMapping(row, 'review', 'category_mismatch', proposed)
    }

    const provenance = row.productTypeSource ?? 'unknown'
    if (!TRUSTED_PROVENANCE.has(provenance)) {
      return makeMapping(row, 'review', 'untrusted_provenance', { ...proposed, provenance })
    }

    return makeMapping(row, 'candidate', 'candidate', { ...proposed, provenance })
  })
}

/** Produces mutually exclusive reason groups that reconcile exactly to the supplied mapping rows. */
export function summarizeProductSubtypeMappingReasons(
  mappings: readonly ProductSubtypeMapping[],
  sampleLimit = 20,
): ProductSubtypeMappingReasonGroup[] {
  const groups = new Map<ProductSubtypeMappingReasonCode, ProductSubtypeMapping[]>()
  for (const mapping of mappings) {
    const current = groups.get(mapping.reasonCode) ?? []
    current.push(mapping)
    groups.set(mapping.reasonCode, current)
  }

  const order: ProductSubtypeMappingReasonCode[] = [
    'candidate',
    'existing_subtype_assignment',
    'no_product_type',
    'product_type_outside_registry',
    'category_mismatch',
    'untrusted_provenance',
  ]
  return order.map((reasonCode) => {
    const rows = [...(groups.get(reasonCode) ?? [])].sort((a, b) => a.productId.localeCompare(b.productId))
    return {
      reasonCode,
      reason: REASON_TEXT[reasonCode],
      count: rows.length,
      samples: rows.slice(0, Math.max(0, sampleLimit)).map((mapping) => ({
        productId: mapping.productId,
        productName: mapping.productName,
        category: mapping.category,
        productTypeKey: mapping.productTypeKey,
        productTypeName: mapping.productTypeName,
        productTypeProvenance: mapping.productTypeProvenance,
        parentTypeKey: mapping.parentTypeKey,
        subtypeKey: mapping.subtypeKey,
        provenance: mapping.provenance,
      })),
    }
  })
}

export function summarizeProductSubtypeMappings(mappings: readonly ProductSubtypeMapping[]) {
  const bySubtype = new Map<string, { parentTypeKey: string; subtypeName: string; candidate: number; review: number }>()
  for (const mapping of mappings) {
    if (!mapping.subtypeKey || !mapping.parentTypeKey) continue
    const current = bySubtype.get(mapping.subtypeKey) ?? {
      parentTypeKey: mapping.parentTypeKey,
      subtypeName: mapping.subtypeName ?? mapping.subtypeKey,
      candidate: 0,
      review: 0,
    }
    if (mapping.status === 'candidate') current.candidate += 1
    if (mapping.status === 'review') current.review += 1
    bySubtype.set(mapping.subtypeKey, current)
  }

  return [...bySubtype.entries()]
    .map(([subtypeKey, value]) => ({ subtypeKey, ...value }))
    .sort((a, b) => {
      if (a.parentTypeKey !== b.parentTypeKey) return a.parentTypeKey < b.parentTypeKey ? -1 : 1
      if (a.subtypeKey === b.subtypeKey) return 0
      return a.subtypeKey < b.subtypeKey ? -1 : 1
    })
}
