import { PRODUCT_TYPES } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'
import {
  PRODUCT_SUBTYPE_PROPOSALS,
  PRODUCT_TYPE_PARENT_PROPOSALS,
} from '@/lib/product-subtype-registry'
import type { ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

export type ProductSubtypeMappingStatus = 'candidate' | 'review' | 'existing' | 'outside_registry'

export type ProductSubtypeMapping = {
  productId: string
  productName: string
  productTypeKey: string | null
  productTypeName: string | null
  parentTypeKey: string | null
  parentTypeName: string | null
  subtypeKey: string | null
  subtypeName: string | null
  provenance: string
  status: ProductSubtypeMappingStatus
  reason: string
}

const TRUSTED_PROVENANCE = new Set(['rule', 'alias', 'pkd'])
const productTypeDefinitions = new Map(PRODUCT_TYPES.map((type) => [type.key, type]))
const proposalByLegacyType = new Map(
  PRODUCT_SUBTYPE_PROPOSALS.map((proposal) => [proposal.legacyProductTypeKey, proposal]),
)
const parentByKey = new Map(PRODUCT_TYPE_PARENT_PROPOSALS.map((parent) => [parent.key, parent]))

function hasCategoryMismatch(row: ProductSubtypeAuditRow): boolean {
  if (!row.productTypeKey) return false
  const definition = productTypeDefinitions.get(row.productTypeKey)
  if (definition) return !definition.categories.includes(row.category as ItemCategory)
  return Boolean(row.productTypeCategory && row.category !== row.productTypeCategory)
}

export function buildProductSubtypeMappings(
  rows: readonly ProductSubtypeAuditRow[],
): ProductSubtypeMapping[] {
  return rows.map((row) => {
    const provenance = row.productTypeSource ?? 'unknown'

    if (!row.productTypeKey) {
      return {
        productId: row.id,
        productName: row.name,
        productTypeKey: null,
        productTypeName: null,
        parentTypeKey: null,
        parentTypeName: null,
        subtypeKey: null,
        subtypeName: null,
        provenance,
        status: 'outside_registry',
        reason: 'Product has no Product Type and cannot be mapped by the current registry.',
      }
    }

    if (row.productSubtypeKey) {
      return {
        productId: row.id,
        productName: row.name,
        productTypeKey: row.productTypeKey,
        productTypeName: row.productTypeName,
        parentTypeKey: null,
        parentTypeName: null,
        subtypeKey: row.productSubtypeKey,
        subtypeName: row.productSubtypeName,
        provenance: row.productSubtypeSource ?? 'unknown',
        status: 'existing',
        reason: 'Product already has a Product Subtype; existing classification is never overwritten.',
      }
    }

    const proposal = proposalByLegacyType.get(row.productTypeKey)
    const parent = proposal ? parentByKey.get(proposal.parentTypeKey) : undefined

    if (!proposal || !parent) {
      return {
        productId: row.id,
        productName: row.name,
        productTypeKey: row.productTypeKey,
        productTypeName: row.productTypeName,
        parentTypeKey: null,
        parentTypeName: null,
        subtypeKey: null,
        subtypeName: null,
        provenance,
        status: 'outside_registry',
        reason: 'Current Product Type is outside the reviewed starter registry.',
      }
    }

    const categoryMismatch = hasCategoryMismatch(row)
    if (categoryMismatch) {
      return {
        productId: row.id,
        productName: row.name,
        productTypeKey: row.productTypeKey,
        productTypeName: row.productTypeName,
        parentTypeKey: parent.key,
        parentTypeName: parent.name,
        subtypeKey: proposal.key,
        subtypeName: proposal.name,
        provenance,
        status: 'review',
        reason: 'Product category is outside the Product Type definition; explicit review is required before mapping.',
      }
    }

    if (!TRUSTED_PROVENANCE.has(provenance)) {
      return {
        productId: row.id,
        productName: row.name,
        productTypeKey: row.productTypeKey,
        productTypeName: row.productTypeName,
        parentTypeKey: parent.key,
        parentTypeName: parent.name,
        subtypeKey: proposal.key,
        subtypeName: proposal.name,
        provenance,
        status: 'review',
        reason: 'Product Type provenance is manual/unknown and is not trusted for automatic subtype mapping.',
      }
    }

    return {
      productId: row.id,
      productName: row.name,
      productTypeKey: row.productTypeKey,
      productTypeName: row.productTypeName,
      parentTypeKey: parent.key,
      parentTypeName: parent.name,
      subtypeKey: proposal.key,
      subtypeName: proposal.name,
      provenance,
      status: 'candidate',
      reason: 'Deterministic mapping from the reviewed legacy Product Type to its registered Product Subtype.',
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
    .sort((a, b) => a.parentTypeKey.localeCompare(b.parentTypeKey) || a.subtypeKey.localeCompare(b.subtypeKey))
}
