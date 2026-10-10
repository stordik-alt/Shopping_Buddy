import { describe, expect, it } from 'vitest'
import { canApproveProductSubtypeCandidate, deduplicateProductSubtypeCandidates, normalizeSubtypeLabel } from '@/lib/product-subtype-candidates'
import { PRODUCT_SUBCATEGORIES } from '@/lib/product-subcategories'
import { PRODUCT_TYPE_GROUPS, PRODUCT_TYPES } from '@/lib/product-types'
import { PRODUCT_SUBTYPE_PROPOSALS } from '@/lib/product-subtype-registry'
import { buildSeedSubtypeCandidates, newSeedTypes, PRODUCT_TAXONOMY_SEED } from './index'

const codeTypes = new Map<string, (typeof PRODUCT_TYPES)[number]>(PRODUCT_TYPES.map((type) => [type.key, type]))
const groupKeys = new Set(PRODUCT_TYPE_GROUPS.map((group) => group.key))

// Package size, count or price in a name means a product attribute, not a classification (docs/12).
const PACKAGE_OR_PRICE = /\d+\s?(g|kg|ml|l|ks|kč|%)\b|\b\d+x\d+/i

describe('product taxonomy seed proposal', () => {
  it('has unique type keys, ASCII slug keys and a valid category/subcategory pair', () => {
    const keys = PRODUCT_TAXONOMY_SEED.map((type) => type.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const type of PRODUCT_TAXONOMY_SEED) {
      expect(type.key, type.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect((PRODUCT_SUBCATEGORIES[type.category] as readonly string[]), `${type.key} subcategory`).toContain(type.subcategory)
      expect(type.axis.trim().length, `${type.key} axis`).toBeGreaterThan(5)
    }
  })

  it('marks a type as existing only when code already has it, and never re-proposes an existing key as new', () => {
    for (const type of PRODUCT_TAXONOMY_SEED) {
      const inCode = codeTypes.has(type.key) || groupKeys.has(type.key)
      expect(type.existing, `${type.key} existing flag`).toBe(inCode)
      const code = codeTypes.get(type.key)
      if (code) expect(code.categories, `${type.key} category`).toContain(type.category)
    }
  })

  it('has unique, brand/package-free subtype names within each type', () => {
    for (const type of PRODUCT_TAXONOMY_SEED) {
      const names = type.subtypes.map(([name]) => normalizeSubtypeLabel(name))
      expect(new Set(names).size, `${type.key} duplicate subtype names`).toBe(names.length)
      for (const [name] of type.subtypes) expect(name, `${type.key}/${name}`).not.toMatch(PACKAGE_OR_PRICE)
    }
  })

  it('does not collide with the starter subtype registry', () => {
    const starter = new Set(PRODUCT_SUBTYPE_PROPOSALS.map((proposal) => `${proposal.parentTypeKey}:${normalizeSubtypeLabel(proposal.name)}`))
    for (const type of PRODUCT_TAXONOMY_SEED) {
      for (const [name] of type.subtypes) expect(starter.has(`${type.key}:${normalizeSubtypeLabel(name)}`), `${type.key}/${name}`).toBe(false)
    }
  })

  it('produces approval-ready candidates with stable, collision-free keys', () => {
    const candidates = buildSeedSubtypeCandidates()
    const deduped = deduplicateProductSubtypeCandidates(candidates)
    expect(deduped.length).toBe(candidates.length)
    for (const candidate of deduped) expect(canApproveProductSubtypeCandidate(candidate), candidate.candidateKey).toEqual({ approved: true })
  })

  it('is broad: covers every item category and many new types', () => {
    expect(new Set(PRODUCT_TAXONOMY_SEED.map((type) => type.category))).toEqual(new Set(['Potraviny', 'Drogerie', 'Domácnost', 'Děti', 'Ostatní']))
    expect(newSeedTypes().length).toBeGreaterThan(60)
    expect(PRODUCT_TAXONOMY_SEED.length).toBeGreaterThan(150)
    expect(buildSeedSubtypeCandidates().length).toBeGreaterThan(450)
  })
})
