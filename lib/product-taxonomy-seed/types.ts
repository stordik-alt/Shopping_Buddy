// Broad, registry-first Product Type / Product Subtype seed proposal (docs/12_PRODUCT_TYPES.md,
// "Registry-first bulk taxonomy bootstrap"). It is DATA ONLY: nothing here is imported by runtime
// classification, and nothing writes to the database. Subtypes enter the app through the existing
// review queue (`pnpm db:product-subtype-candidates`), types through lib/product-types.ts rules.
import type { ProductTypeUnit } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'

export const PRODUCT_TAXONOMY_SEED_VERSION = '2026-10-seed-v1'

/** A subtype: [name, includes, optional excludes]. Excludes default to the generic boundary below. */
export type SeedSubtype = readonly [name: string, includes: string, excludes?: string]

export type SeedType = {
  /** Stable key. For `existing` types it is the key already in lib/product-types.ts. */
  key: string
  name: string
  category: ItemCategory
  /** A subcategory from PRODUCT_SUBCATEGORIES[category]. */
  subcategory: string
  unit: ProductTypeUnit
  /** True when the type already exists in code; the seed then only proposes subtypes under it. */
  existing: boolean
  /** The single decision axis the sibling subtypes differ by (docs/12 boundary rule). */
  axis: string
  subtypes: readonly SeedSubtype[]
}

export const DEFAULT_SUBTYPE_EXCLUDES =
  'jiný poddruh téhož typu; výrobek bez výslovného důkazu na obalu nebo ve specifikaci zůstává bez poddruhu'

/** Compact constructors so the data tables stay readable. */
export const newType = (
  key: string, name: string, category: ItemCategory, subcategory: string, unit: ProductTypeUnit,
  axis: string, subtypes: readonly SeedSubtype[],
): SeedType => ({ key, name, category, subcategory, unit, existing: false, axis, subtypes })

export const existingType = (
  key: string, name: string, category: ItemCategory, subcategory: string, unit: ProductTypeUnit,
  axis: string, subtypes: readonly SeedSubtype[],
): SeedType => ({ key, name, category, subcategory, unit, existing: true, axis, subtypes })
