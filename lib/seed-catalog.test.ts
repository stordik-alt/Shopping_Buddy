import { describe, expect, it } from 'vitest'
import { loadSeedCatalog, parseSeedCatalogCsv, projectSeedPackageQuantity, seedPackageReference } from '@/lib/seed-catalog'

describe('seed catalog', () => {
  it('parses the checked-in catalog with the expected record counts', () => {
    const rows = loadSeedCatalog()
    expect(rows).toHaveLength(633)
    expect(rows.filter((row) => row.normalizationStatus === 'ready')).toHaveLength(610)
    expect(new Set(rows.map((row) => row.seedId)).size).toBe(rows.length)
    expect(rows.every((row) => row.productFamily.length > 0)).toBe(true)
  })

  it('keeps needs_review rows out of the default import set', () => {
    const rows = loadSeedCatalog()
    expect(rows.filter((row) => row.normalizationStatus === 'needs_review')).toHaveLength(23)
    expect(rows.filter((row) => row.normalizationStatus === 'needs_review').every((row) => row.reviewReasons.length > 0)).toBe(true)
  })

  it('preserves explicit package choices and canonical units', () => {
    const rows = loadSeedCatalog()
    const milk = rows.find((row) => row.seedId === 'seed-src-0008')!
    expect(milk.packageOptions).toEqual([{
      quantity: 1,
      unit: 'l',
      canonical_quantity: 1,
      canonical_unit: 'l',
      raw: '1 l',
    }])

    const nonEnumUnit = rows.find((row) => row.seedId === 'seed-src-0063')!
    expect(nonEnumUnit.packageOptions).toEqual([{
      quantity: 40,
      unit: 'dávek',
      canonical_quantity: 40,
      canonical_unit: 'ks',
      raw: '40 dávek',
    }])

    const multipack = rows.find((row) => row.seedId === 'seed-src-0629')!
    expect(multipack.packageCount).toBe(10)
    expect(multipack.packageType).toBe('multipack')
    expect(projectSeedPackageQuantity(multipack, multipack.packageOptions[0])).toBe(0.1)
  })

  it('rejects malformed or incomplete CSV before any DB write can be attempted', () => {
    expect(() => parseSeedCatalogCsv('seed_id,source_document\nseed-src-1,file.pdf\n')).toThrow(/missing column/i)
    const malformed = [
      'seed_id,source_document,source_page,source_section,category,subcategory,brand,brand_extraction,product_family,variants,package_options,package_count,package_type,raw_item,normalization_status,confidence,review_reasons',
      'seed-src-1,file.pdf,1,Section,Potraviny,Mléčné výrobky,,,Test,,not-json,,,,ready,0.95,',
    ].join('\n')
    expect(() => parseSeedCatalogCsv(malformed)).toThrow(/Invalid JSON/i)
  })

  it('promotes explicitly documented discrete package choices to ready', () => {
    const rows = loadSeedCatalog()
    const tea = rows.find((row) => row.seedId === 'seed-src-0128')!
    expect(tea.normalizationStatus).toBe('ready')
    expect(tea.packageOptions.map((option) => option.canonical_quantity)).toEqual([25, 50, 100])

    const birell = rows.find((row) => row.seedId === 'seed-src-0401')!
    expect(birell.normalizationStatus).toBe('ready')
    expect(birell.packageOptions).toHaveLength(1)

    const stillReview = rows.find((row) => row.seedId === 'seed-src-0056')!
    expect(stillReview.normalizationStatus).toBe('needs_review')
  })

  it('classifies unresolved seed packaging as reference-only ranges or unspecified', () => {
    const rows = loadSeedCatalog()
    const range = rows.find((row) => row.seedId === 'seed-src-0056')!
    expect(seedPackageReference(range)).toEqual({ resolution: 'range', options: range.packageOptions })

    const unspecified = rows.find((row) => row.seedId === 'seed-src-0060')!
    expect(seedPackageReference(unspecified)).toEqual({ resolution: 'unspecified', options: [] })

    const concrete = rows.find((row) => row.seedId === 'seed-src-0129')!
    expect(seedPackageReference(concrete)).toEqual({ resolution: 'concrete', options: concrete.packageOptions })
  })

})
