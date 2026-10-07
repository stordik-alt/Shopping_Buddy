import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ItemCategory } from '@/lib/types'

export type SeedStatus = 'ready' | 'needs_review'

export type SeedPackageResolution = 'concrete' | 'range' | 'unspecified'

export type SeedPackageReference = {
  resolution: SeedPackageResolution
  options: SeedPackageOption[]
}

export type SeedPackageOption = {
  quantity: number
  unit: string
  canonical_quantity: number
  canonical_unit: 'ks' | 'kg' | 'l'
  raw: string
}

export type SeedCatalogRow = {
  seedId: string
  sourceDocument: string
  sourcePage: number
  sourceSection: string
  category: ItemCategory
  subcategory: string
  brand: string | null
  brandExtraction: string | null
  productFamily: string
  variants: string | null
  packageOptions: SeedPackageOption[]
  packageCount: number | null
  packageType: string | null
  rawItem: string
  normalizationStatus: SeedStatus
  confidence: number
  reviewReasons: string[]
}

const CATEGORIES = new Set<ItemCategory>(['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'])
const CANONICAL_UNITS = new Set<SeedPackageOption['canonical_unit']>(['ks', 'kg', 'l'])

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (char === '\r') continue
    cell += char
  }

  if (inQuotes) throw new Error('Seed CSV contains an unterminated quoted field')
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function parseJsonArray<T>(value: string, field: string): T[] {
  if (!value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error('not an array')
    return parsed as T[]
  } catch {
    throw new Error(`Invalid JSON in seed CSV field ${field}`)
  }
}

function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parsePackageOptions(value: string): SeedPackageOption[] {
  const parsed = parseJsonArray<SeedPackageOption>(value, 'package_options')
  return parsed.map((option, index) => {
    if (typeof option.unit !== 'string' || !option.unit.trim() || !CANONICAL_UNITS.has(option.canonical_unit)) {
      throw new Error(`Invalid package unit at option ${index}`)
    }
    for (const [key, numberValue] of [
      ['quantity', option.quantity],
      ['canonical_quantity', option.canonical_quantity],
    ] as const) {
      if (!Number.isFinite(numberValue) || numberValue <= 0) throw new Error(`Invalid ${key} at package option ${index}`)
    }
    return option
  })
}

export function parseSeedCatalogCsv(text: string): SeedCatalogRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length === 0) return []

  const header = rows[0]
  const required = ['seed_id', 'source_document', 'source_page', 'source_section', 'category', 'subcategory', 'brand', 'brand_extraction', 'product_family', 'variants', 'package_options', 'package_count', 'package_type', 'raw_item', 'normalization_status', 'confidence', 'review_reasons']
  const index = new Map(header.map((name, i) => [name.replace(/^\uFEFF/, ''), i]))
  for (const field of required) if (!index.has(field)) throw new Error(`Seed CSV missing column ${field}`)

  const value = (row: string[], field: string) => row[index.get(field)!] ?? ''
  const result: SeedCatalogRow[] = []

  for (let rowNumber = 1; rowNumber < rows.length; rowNumber += 1) {
    const row = rows[rowNumber]
    if (row.every((cell) => !cell.trim())) continue

    const category = value(row, 'category') as ItemCategory
    const status = value(row, 'normalization_status') as SeedStatus
    const sourcePage = Number(value(row, 'source_page'))
    const confidence = Number(value(row, 'confidence'))
    const packageCountRaw = value(row, 'package_count').trim()

    if (!value(row, 'seed_id').trim()) throw new Error(`Missing seed_id on CSV row ${rowNumber + 1}`)
    if (!CATEGORIES.has(category)) throw new Error(`Unknown item category "${category}" on CSV row ${rowNumber + 1}`)
    if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error(`Invalid source_page on CSV row ${rowNumber + 1}`)
    if (status !== 'ready' && status !== 'needs_review') throw new Error(`Invalid normalization_status on CSV row ${rowNumber + 1}`)
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error(`Invalid confidence on CSV row ${rowNumber + 1}`)
    const packageCount = packageCountRaw ? Number(packageCountRaw) : null
    if (packageCount != null && (!Number.isInteger(packageCount) || packageCount <= 0)) throw new Error(`Invalid package_count on CSV row ${rowNumber + 1}`)

    result.push({
      seedId: value(row, 'seed_id').trim(),
      sourceDocument: value(row, 'source_document').trim(),
      sourcePage,
      sourceSection: value(row, 'source_section').trim(),
      category,
      subcategory: value(row, 'subcategory').trim(),
      brand: nullableText(value(row, 'brand')),
      brandExtraction: nullableText(value(row, 'brand_extraction')),
      productFamily: value(row, 'product_family').trim(),
      variants: nullableText(value(row, 'variants')),
      packageOptions: parsePackageOptions(value(row, 'package_options')),
      packageCount,
      packageType: nullableText(value(row, 'package_type')),
      rawItem: value(row, 'raw_item').trim(),
      normalizationStatus: status,
      confidence,
      reviewReasons: value(row, 'review_reasons').split('|').map((item) => item.trim()).filter(Boolean),
    })
  }

  return result
}

export function loadSeedCatalog(filePath = resolve(process.cwd(), 'data/seed/seed_catalog_v1.csv')): SeedCatalogRow[] {
  return parseSeedCatalogCsv(readFileSync(filePath, 'utf8'))
}

export function seedPackageReference(row: SeedCatalogRow): SeedPackageReference {
  if (row.packageOptions.length === 0) return { resolution: 'unspecified', options: [] }
  if (row.normalizationStatus === 'needs_review' && row.reviewReasons.includes('range_or_open_ended_size')) {
    return { resolution: 'range', options: row.packageOptions }
  }
  return { resolution: 'concrete', options: row.packageOptions }
}

export function shouldApplySeedBrand(row: SeedCatalogRow): boolean {
  return row.brand != null && row.brandExtraction === 'group_match'
}

export function shouldApplySeedVariant(row: SeedCatalogRow): boolean {
  const value = row.variants?.trim()
  if (!value) return false
  // Two current seed rows contain malformed quote-prefixed variant fields; preserve them in the
  // source CSV but do not promote them into canonical product identity.
  if (value.startsWith("'") || value.startsWith('"')) return false
  return value.length <= 200
}

export function projectSeedPackageQuantity(row: SeedCatalogRow, option: SeedPackageOption): number {
  const count = row.packageCount
  if (!count || row.packageType !== 'multipack') return option.canonical_quantity

  const options = row.packageOptions.map((candidate) => candidate.canonical_quantity)
  const isAlreadyTotal = options.some((candidate) =>
    Math.abs(candidate - option.canonical_quantity * count) < 0.0005,
  )
  if (isAlreadyTotal) return option.canonical_quantity

  // Only project an explicit multipack when the row has one clear inner-package size. Multiple
  // unrelated sizes can represent different variants and are left at their source size for review.
  if (options.length === 1) return Math.round(option.canonical_quantity * count * 1000) / 1000
  return option.canonical_quantity
}
