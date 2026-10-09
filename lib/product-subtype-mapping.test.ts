import { describe, expect, it } from 'vitest'
import { buildProductSubtypeMappings, summarizeProductSubtypeMappings, summarizeProductSubtypeMappingReasons, summarizeUnmappedProductTypes } from '@/lib/product-subtype-mapping'
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
        subtypeKey: 'mleko-plnotucne',
        parentTypeKey: 'mleko',
        subtypeName: 'Plnotučné mléko',
        candidate: 1,
        review: 0,
      },
      {
        subtypeKey: 'mleko-polotucne',
        parentTypeKey: 'mleko',
        subtypeName: 'Polotučné mléko',
        candidate: 1,
        review: 0,
      },
    ])
  })

  it('classifies every non-candidate into a mutually exclusive reason group', () => {
    const mappings = buildProductSubtypeMappings([
      row({ id: 'candidate', productTypeSource: 'rule' }),
      row({ id: 'existing', productSubtypeKey: 'mleko-polotucne', productSubtypeName: 'Polotučné mléko' }),
      row({ id: 'no-type', productTypeKey: null, productTypeName: null }),
      row({ id: 'outside', productTypeKey: 'smetana-na-vareni', productTypeName: 'Smetana na vaření' }),
      row({ id: 'category', category: 'Děti' }),
      row({ id: 'provenance', productTypeSource: 'manual' }),
    ])
    const groups = summarizeProductSubtypeMappingReasons(mappings, 2)
    const counts = Object.fromEntries(groups.map((group) => [group.reasonCode, group.count]))

    expect(counts).toEqual({
      candidate: 1,
      existing_subtype_assignment: 1,
      no_product_type: 1,
      product_type_outside_registry: 1,
      category_mismatch: 1,
      untrusted_provenance: 1,
    })
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(mappings.length)
    expect(groups.every((group) => group.samples.length <= 2)).toBe(true)
    expect(groups.find((group) => group.reasonCode === 'no_product_type')?.samples[0].productId).toBe('no-type')
  })

  it('reports the actual Product Type provenance separately from subtype provenance', () => {
    const [mapping] = buildProductSubtypeMappings([
      row({
        productTypeSource: 'rule',
        productSubtypeKey: 'mleko-polotucne',
        productSubtypeName: 'Polotučné mléko',
        productSubtypeSource: 'manual',
      }),
    ])
    expect(mapping.reasonCode).toBe('existing_subtype_assignment')
    expect(mapping.productTypeProvenance).toBe('rule')
    expect(mapping.provenance).toBe('manual')
  })


  it('inventories unmapped Product Types by frequency with deterministic samples and category/provenance counts', () => {
    const mappings = buildProductSubtypeMappings([
      row({ id: 'b', productTypeKey: 'smetana-na-vareni', productTypeName: 'Smetana na vaření', name: 'Smetana 10 %' }),
      row({ id: 'a', productTypeKey: 'smetana-na-vareni', productTypeName: 'Smetana na vaření', name: 'Smetana 12 %' }),
      row({ id: 'c', productTypeKey: 'praci-gel', productTypeName: 'Prací gel', name: 'Prací gel 1 l', productTypeSource: 'pkd' }),
      row({ id: 'ignored', productTypeKey: null, productTypeName: null }),
    ])
    const inventory = summarizeUnmappedProductTypes(mappings, 1)
    expect(inventory).toEqual([
      {
        productTypeKey: 'smetana-na-vareni',
        productTypeName: 'Smetana na vaření',
        products: 2,
        categories: { Potraviny: 2 },
        provenance: { rule: 2 },
        samples: [{ productId: 'a', productName: 'Smetana 12 %', category: 'Potraviny', productTypeProvenance: 'rule' }],
      },
      {
        productTypeKey: 'praci-gel',
        productTypeName: 'Prací gel',
        products: 1,
        categories: { Potraviny: 1 },
        provenance: { pkd: 1 },
        samples: [{ productId: 'c', productName: 'Prací gel 1 l', category: 'Potraviny', productTypeProvenance: 'pkd' }],
      },
    ])
  })

})