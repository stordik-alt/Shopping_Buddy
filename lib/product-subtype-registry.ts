// Review-controlled starter registry for the Product Type -> Product Subtype migration.
// This file is intentionally proposal-only: it is not imported by runtime classification or seed code.
// Do not turn candidates into database rows or reassign products until the transition is reviewed.
import { PRODUCT_TYPE_GROUPS, PRODUCT_TYPES, type ProductTypeUnit } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'

export const PRODUCT_SUBTYPE_REGISTRY_VERSION = '2026-10-v1'

export type RegistryReviewStatus = 'candidate' | 'approved' | 'rejected'

export type ProductTypeParentProposal = {
  key: string
  name: string
  category: ItemCategory
  unit: ProductTypeUnit
  legacyGroupKey: string
  status: RegistryReviewStatus
  rationale: string
}

export type ProductSubtypeProposal = {
  key: string
  parentTypeKey: string
  name: string
  legacyProductTypeKey: string
  sortOrder: number
  status: RegistryReviewStatus
}

const candidate = 'candidate' as const

export const PRODUCT_TYPE_PARENT_PROPOSALS: readonly ProductTypeParentProposal[] = [
  { key: 'mleko', name: 'Mléko', category: 'Potraviny', unit: 'l', legacyGroupKey: 'mleko', status: candidate, rationale: 'Existing group already represents the general request; its three specific Product Types are proposed as child subtypes.' },
  { key: 'syr', name: 'Sýr', category: 'Potraviny', unit: 'kg', legacyGroupKey: 'syr', status: candidate, rationale: 'Existing group is a common umbrella request and all current members use kg as the comparison unit.' },
  { key: 'mouka', name: 'Mouka', category: 'Potraviny', unit: 'kg', legacyGroupKey: 'mouka', status: candidate, rationale: 'Existing group is a common umbrella request; flour grades remain distinct child subtypes.' },
  { key: 'cukr', name: 'Cukr', category: 'Potraviny', unit: 'kg', legacyGroupKey: 'cukr', status: candidate, rationale: 'Existing group is a common umbrella request; granulated/crystal and powdered sugar remain distinct child subtypes.' },
  { key: 'olej', name: 'Olej', category: 'Potraviny', unit: 'l', legacyGroupKey: 'olej', status: candidate, rationale: 'Existing group is a common umbrella request; oil types remain distinct child subtypes.' },
  { key: 'voda', name: 'Voda', category: 'Potraviny', unit: 'l', legacyGroupKey: 'voda', status: candidate, rationale: 'Existing group is a common umbrella request; sparkling and still water remain distinct child subtypes.' },
  { key: 'kava', name: 'Káva', category: 'Potraviny', unit: 'kg', legacyGroupKey: 'kava', status: candidate, rationale: 'Existing group is a common umbrella request; ground and whole-bean coffee remain distinct child subtypes.' },
] as const satisfies readonly ProductTypeParentProposal[]

export const PRODUCT_SUBTYPE_PROPOSALS: readonly ProductSubtypeProposal[] = [
  { key: 'mleko-polotucne', parentTypeKey: 'mleko', name: 'Polotučné mléko', legacyProductTypeKey: 'mleko-polotucne', sortOrder: 10, status: candidate },
  { key: 'mleko-plnotucne', parentTypeKey: 'mleko', name: 'Plnotučné mléko', legacyProductTypeKey: 'mleko-plnotucne', sortOrder: 20, status: candidate },
  { key: 'mleko-bez-laktozy', parentTypeKey: 'mleko', name: 'Bezlaktózové mléko', legacyProductTypeKey: 'mleko-bez-laktozy', sortOrder: 30, status: candidate },
  { key: 'eidam', parentTypeKey: 'syr', name: 'Eidam', legacyProductTypeKey: 'eidam', sortOrder: 10, status: candidate },
  { key: 'gouda', parentTypeKey: 'syr', name: 'Gouda', legacyProductTypeKey: 'gouda', sortOrder: 20, status: candidate },
  { key: 'mozzarella', parentTypeKey: 'syr', name: 'Mozzarella', legacyProductTypeKey: 'mozzarella', sortOrder: 30, status: candidate },
  { key: 'balkansky-syr', parentTypeKey: 'syr', name: 'Balkánský sýr', legacyProductTypeKey: 'balkansky-syr', sortOrder: 40, status: candidate },
  { key: 'mouka-hladka', parentTypeKey: 'mouka', name: 'Hladká mouka', legacyProductTypeKey: 'mouka-hladka', sortOrder: 10, status: candidate },
  { key: 'mouka-polohruba', parentTypeKey: 'mouka', name: 'Polohrubá mouka', legacyProductTypeKey: 'mouka-polohruba', sortOrder: 20, status: candidate },
  { key: 'mouka-hruba', parentTypeKey: 'mouka', name: 'Hrubá mouka', legacyProductTypeKey: 'mouka-hruba', sortOrder: 30, status: candidate },
  { key: 'cukr-krupice', parentTypeKey: 'cukr', name: 'Cukr krupice a krystal', legacyProductTypeKey: 'cukr-krupice', sortOrder: 10, status: candidate },
  { key: 'cukr-moucka', parentTypeKey: 'cukr', name: 'Moučkový cukr', legacyProductTypeKey: 'cukr-moucka', sortOrder: 20, status: candidate },
  { key: 'olej-slunecnicovy', parentTypeKey: 'olej', name: 'Slunečnicový olej', legacyProductTypeKey: 'olej-slunecnicovy', sortOrder: 10, status: candidate },
  { key: 'olej-repkovy', parentTypeKey: 'olej', name: 'Řepkový olej', legacyProductTypeKey: 'olej-repkovy', sortOrder: 20, status: candidate },
  { key: 'olej-olivovy', parentTypeKey: 'olej', name: 'Olivový olej', legacyProductTypeKey: 'olej-olivovy', sortOrder: 30, status: candidate },
  { key: 'voda-neperliva', parentTypeKey: 'voda', name: 'Neperlivá voda', legacyProductTypeKey: 'voda-neperliva', sortOrder: 10, status: candidate },
  { key: 'voda-perliva', parentTypeKey: 'voda', name: 'Perlivá voda', legacyProductTypeKey: 'voda-perliva', sortOrder: 20, status: candidate },
  { key: 'kava-mleta', parentTypeKey: 'kava', name: 'Mletá káva', legacyProductTypeKey: 'kava-mleta', sortOrder: 10, status: candidate },
  { key: 'kava-zrnkova', parentTypeKey: 'kava', name: 'Zrnková káva', legacyProductTypeKey: 'kava-zrnkova', sortOrder: 20, status: candidate },
]

export function getProductSubtypeProposals(parentTypeKey: string): readonly ProductSubtypeProposal[] {
  return PRODUCT_SUBTYPE_PROPOSALS.filter((subtype) => subtype.parentTypeKey === parentTypeKey).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'cs'))
}

export function validateProductSubtypeRegistry(): string[] {
  const errors: string[] = []
  const parentKeys = PRODUCT_TYPE_PARENT_PROPOSALS.map((parent) => parent.key)
  const subtypeKeys = PRODUCT_SUBTYPE_PROPOSALS.map((subtype) => subtype.key)
  if (new Set(parentKeys).size !== parentKeys.length) errors.push('Duplicate proposed parent key')
  if (new Set(subtypeKeys).size !== subtypeKeys.length) errors.push('Duplicate proposed subtype key')
  for (const subtype of PRODUCT_SUBTYPE_PROPOSALS) {
    if (!parentKeys.includes(subtype.parentTypeKey)) errors.push(`Subtype ${subtype.key} references an unknown proposed parent: ${subtype.parentTypeKey}`)
  }
  for (const parent of PRODUCT_TYPE_PARENT_PROPOSALS) {
    if (PRODUCT_TYPES.some((type) => type.key === parent.key)) errors.push(`Proposed parent key already exists as Product Type: ${parent.key}`)
    const group = PRODUCT_TYPE_GROUPS.find((candidateGroup) => candidateGroup.key === parent.legacyGroupKey)
    if (!group) { errors.push(`Missing legacy group ${parent.legacyGroupKey} for parent ${parent.key}`); continue }
    if (group.name !== parent.name) errors.push(`Parent name ${parent.key} does not match its legacy group`)
    const proposedLegacyKeys = getProductSubtypeProposals(parent.key).map((subtype) => subtype.legacyProductTypeKey).sort()
    const groupKeys = [...group.types].sort()
    if (JSON.stringify(proposedLegacyKeys) !== JSON.stringify(groupKeys)) errors.push(`Subtype proposals for ${parent.key} do not cover its legacy group members exactly`)
    for (const subtype of getProductSubtypeProposals(parent.key)) {
      if (subtype.status !== 'candidate') errors.push(`Unreviewed registry entry has non-candidate status: ${subtype.key}`)
      if (PRODUCT_TYPES.some((type) => type.key === subtype.parentTypeKey)) errors.push(`Proposed parent must not point to an existing specific Product Type: ${subtype.parentTypeKey}`)
      const legacyType = PRODUCT_TYPES.find((type) => type.key === subtype.legacyProductTypeKey)
      if (!legacyType) { errors.push(`Missing legacy Product Type ${subtype.legacyProductTypeKey}`); continue }
      if (legacyType.categories[0] !== parent.category) errors.push(`Category mismatch for legacy Product Type ${subtype.legacyProductTypeKey}`)
      if (legacyType.unit !== parent.unit) errors.push(`Comparison-unit mismatch for legacy Product Type ${subtype.legacyProductTypeKey}`)
    }
  }
  return errors
}
