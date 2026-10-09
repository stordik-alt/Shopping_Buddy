import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPE_GROUPS, PRODUCT_TYPES } from '@/lib/product-types'
import {
  PRODUCT_SUBTYPE_PROPOSALS,
  PRODUCT_SUBTYPE_REGISTRY_VERSION,
  PRODUCT_TYPE_PARENT_PROPOSALS,
  getProductSubtypeProposals,
  validateProductSubtypeRegistry,
} from '@/lib/product-subtype-registry'

describe('controlled Product Subtype proposal registry', () => {
  it('has an explicit version and passes all internal reference checks', () => {
    expect(PRODUCT_SUBTYPE_REGISTRY_VERSION).toBe('2026-10-v1')
    expect(validateProductSubtypeRegistry()).toEqual([])
  })

  it('covers each selected legacy group exactly once without changing its members', () => {
    for (const parent of PRODUCT_TYPE_PARENT_PROPOSALS) {
      const group = PRODUCT_TYPE_GROUPS.find((candidate) => candidate.key === parent.legacyGroupKey)!
      const proposals = getProductSubtypeProposals(parent.key)
      expect(proposals.map((entry) => entry.legacyProductTypeKey).sort()).toEqual([...group.types].sort())
    }

    expect(PRODUCT_SUBTYPE_PROPOSALS).toHaveLength(19)
  })

  it('keeps every proposal in review-only state and outside active Product Type rules', () => {
    expect(PRODUCT_TYPE_PARENT_PROPOSALS.every((parent) => parent.status === 'candidate')).toBe(true)
    expect(PRODUCT_SUBTYPE_PROPOSALS.every((subtype) => subtype.status === 'candidate')).toBe(true)

    const activeTypeKeys = new Set(PRODUCT_TYPES.map((type) => type.key))
    expect(PRODUCT_TYPE_PARENT_PROPOSALS.some((parent) => activeTypeKeys.has(parent.key))).toBe(false)
  })

  it('does not assume a parent unit for groups whose child comparison units differ', () => {
    const creamGroup = PRODUCT_TYPE_GROUPS.find((group) => group.key === 'smetana')!
    const creamUnits = new Set(creamGroup.types.map((key) => PRODUCT_TYPES.find((type) => type.key === key)!.unit))
    expect(creamUnits.size).toBeGreaterThan(1)
    expect(PRODUCT_TYPE_PARENT_PROPOSALS.some((parent) => parent.key === 'smetana')).toBe(false)
  })
})
