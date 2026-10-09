import { describe, expect, it } from 'vitest'
import { buildProductSubtypeMappings, summarizeProductSubtypeMappings } from '@/lib/product-subtype-mapping'
import type { ProductSubtypeAuditRow } from '@/lib/product-subtype-audit'

const row = (overrides: Partial<ProductSubtypeAuditRow> = {}): ProductSubtypeAuditRow => ({
  id: '1',
  name: 'Test milk',
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

describe('Product Subtype deterministic mapping', () => {
  it('maps a trusted registered Product Type to exactly one subtype and parent', () => {
    const [mapping] = buildProductSubtypeMappings([row()])
    expect(mapping).toMatchObject({
      parentTypeKey: 'mleko',
      subtypeKey: 'mleko-polotucne',
      status: 'candidate',
      provenance: 'rule',
    })
  })

  it('keeps manual and unknown provenance out of automatic candidates', () => {
    const mappings = buildProductSubtypeMappings([
      row({ id: '2', productTypeSource: 'manual' }),
      row({ id: '3', productTypeSource: null }),
    ])
    expect(mappings.map((mapping) => mapping.status)).toEqual(['review', 'review'])
  })

  it('flags category exceptions for explicit review', () => {
    const [mapping] = buildProductSubtypeMappings([
      row({ category: 'Děti' }),
    ])
    expect(mapping.status).toBe('review')
    expect(mapping.reason).toContain('category')
  })

  it('never overwrites an existing subtype assignment', () => {
    const [mapping] = buildProductSubtypeMappings([
      row({
        productSubtypeKey: 'mleko-polotucne',
        productSubtypeName: 'Polotučné mléko',
        productSubtypeSource: 'manual',
      }),
    ])
    expect(mapping.status).toBe('existing')
    expect(mapping.subtypeKey).toBe('mleko-polotucne')
  })

  it('leaves Product Types outside the starter registry untouched', () => {
    const [mapping] = buildProductSubtypeMappings([
      row({
        productTypeKey: 'smetana-na-vareni',
        productTypeName: 'Smetana na vaření',
      }),
    ])
    expect(mapping.status).toBe('outside_registry')
    expect(mapping.subtypeKey).toBeNull()
  })

  it('summarizes candidate counts by registered subtype', () => {
    const summary = summarizeProductSubtypeMappings(buildProductSubtypeMappings([
      row({ id: '1', productTypeKey: 'mleko-polotucne' }),
      row({ id: '2', productTypeKey: 'mleko-plnotucne' }),
    ]))
    expect(summary).toEqual([
      {
        subtypeKey: 'mleko-polotucne',
        parentTypeKey: 'mleko',
        subtypeName: 'Polotučné mléko',
        candidate: 1,
        review: 0,
      },
      {
        subtypeKey: 'mleko-plnotucne',
        parentTypeKey: 'mleko',
        subtypeName: 'Plnotučné mléko',
        candidate: 1,
        review: 0,
      },
    ])
  })
})
