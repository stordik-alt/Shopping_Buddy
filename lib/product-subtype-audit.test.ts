import { describe, expect, it } from 'vitest'
import { auditProductSubtypeMigration, type ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

const row = (overrides: Partial<ProductSubtypeAuditRow> = {}): ProductSubtypeAuditRow => ({
  id: '1',
  name: 'Test',
  category: 'Potraviny',
  defaultUnit: 'l',
  productTypeKey: 'mleko-polotucne',
  productTypeName: 'Polotučné mléko',
  productTypeCategory: 'Potraviny',
  productTypeUnit: 'l',
  productTypeSource: 'rule',
  productSubtypeKey: null,
  productSubtypeName: null,
  productSubtypeSource: null,
  ...overrides,
})

describe('Product Subtype provenance audit', () => {
  it('maps registered legacy types to their proposed parent and keeps manual rows for review', () => {
    const result = auditProductSubtypeMigration([
      row({ id: '1', productTypeSource: 'rule' }),
      row({ id: '2', productTypeSource: 'manual' }),
      row({ id: '3', productTypeKey: 'gouda', productTypeName: 'Gouda', productTypeSource: 'alias' }),
      row({ id: '4', productTypeKey: 'mleko-polotucne', productTypeName: 'Polotučné mléko', productTypeSource: null }),
      row({ id: '5', productTypeKey: null, productTypeName: null, productTypeSource: null }),
      row({ id: '6', productTypeKey: 'smetana-na-vareni', productTypeName: 'Smetana na vaření', productTypeSource: 'rule' }),
    ])

    expect(result.products).toBe(6)
    expect(result.provenance).toEqual({ alias: 1, manual: 1, rule: 2, unknown: 2 })
    expect(result.proposedParents.find((p) => p.parentTypeKey === 'mleko')).toMatchObject({
      products: 3,
      candidateProducts: 1,
      manualReviewProducts: 2,
      source: { manual: 1, rule: 1, unknown: 1 },
    })
    expect(result.proposedParents.find((p) => p.parentTypeKey === 'syr')?.products).toBe(1)
    expect(result.outsideRegistry).toEqual([
      { productTypeKey: 'smetana-na-vareni', productTypeName: 'Smetana na vaření', products: 1 },
    ])
    expect(result.eligibleCandidateProducts).toBe(2)
    expect(result.manualReviewProducts).toBe(2)
  })

  it('reports existing subtype assignments and possible category/unit divergence without mutating input', () => {
    const input = row({
      productSubtypeKey: 'mleko-polotucne',
      productSubtypeName: 'Polotučné mléko',
      productSubtypeSource: 'manual',
      category: 'Drogerie',
      defaultUnit: 'kg',
    })
    const before = JSON.stringify(input)
    const result = auditProductSubtypeMigration([input])

    expect(result.existingSubtypeAssignments).toBe(1)
    expect(result.existingSubtypeSourceBreakdown).toEqual({ manual: 1 })
    expect(result.categoryMismatches).toBe(1)
    expect(result.defaultUnitDivergences).toBe(1)
    expect(result.eligibleCandidateProducts).toBe(0)
    expect(result.manualReviewProducts).toBe(0)
    expect(JSON.stringify(input)).toBe(before)
  })
})
