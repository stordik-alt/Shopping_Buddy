// Historical re-categorization (spec sections 19-20): fills in `subcategory_id` for
// products/purchase_items/pantry_items that predate this feature (or that the pipeline could not
// place confidently at import time), WITHOUT touching the raw data those rows were built from — no
// receipt is re-scanned, no purchase is re-created. Deliberately conservative: only ever fills a
// currently-NULL subcategory, never overwrites one that is already set (by the pipeline, an AI
// suggestion, or a household correction), so running this repeatedly is safe and idempotent
// (CLAUDE.md section 34), and it can never silently undo a human's own decision.
//
// Every entry point has a preview (dry run: count + sample of what would change, nothing written)
// and an apply step, per CLAUDE.md section 7/spec section 20 ("no destructive migration without a
// dry-run showing affected records and sample changes").

import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { classifySubcategoryByKeyword } from '@/lib/product-subcategories'
import { normalizeProductText } from '@/lib/product-normalize'
import type { ItemCategory } from '@/lib/types'

export type RecategorizeSample = { id: string; name: string; category: ItemCategory; subcategory: string }
export type RecategorizePreview = { totalCandidates: number; resolvable: number; samples: RecategorizeSample[] }

const SAMPLE_SIZE = 20

/** Products with no subcategory yet whose name the keyword rules can now place. Read-only. */
export async function previewProductRecategorization(): Promise<RecategorizePreview> {
  const db = getDb()
  const rows = await db.query.products.findMany({
    where: isNull(schema.products.subcategoryId),
    columns: { id: true, name: true },
    with: { category: { columns: { name: true } } },
  })
  const samples: RecategorizeSample[] = []
  let resolvable = 0
  for (const row of rows) {
    const subcategory = classifySubcategoryByKeyword(row.category.name, normalizeProductText(row.name))
    if (!subcategory) continue
    resolvable += 1
    if (samples.length < SAMPLE_SIZE) samples.push({ id: row.id, name: row.name, category: row.category.name, subcategory })
  }
  return { totalCandidates: rows.length, resolvable, samples }
}

/** Writes the subcategory for every product the keyword rules can place — same rule as the preview,
 *  applied for real. Returns how many rows were actually updated. Never touches a product that
 *  already has a subcategory (the `WHERE subcategory_id IS NULL` scope is identical to the preview's). */
export async function applyProductRecategorization(): Promise<number> {
  const db = getDb()
  const rows = await db.query.products.findMany({
    where: isNull(schema.products.subcategoryId),
    columns: { id: true, name: true },
    with: { category: { columns: { name: true } } },
  })
  const subcategoryRows = await db.query.productSubcategories.findMany({ columns: { id: true, category: true, name: true } })
  let updated = 0
  for (const row of rows) {
    const subcategoryName = classifySubcategoryByKeyword(row.category.name, normalizeProductText(row.name))
    if (!subcategoryName) continue
    const subcategoryRow = subcategoryRows.find((entry) => entry.category === row.category.name && entry.name === subcategoryName)
    if (!subcategoryRow) continue
    await db.update(schema.products).set({ subcategoryId: subcategoryRow.id }).where(eq(schema.products.id, row.id))
    updated += 1
  }
  return updated
}

/** Line items (purchase_items or pantry_items — same shape, different table) with no subcategory
 *  yet, resolved either from their linked product's now-known subcategory or, failing that, the
 *  keyword rules applied to the line's own stored name. Shared by both preview and apply below so
 *  the two can never disagree about what counts as "resolvable". */
async function resolvableLineItems(table: 'purchase_items' | 'pantry_items') {
  const db = getDb()
  const rows =
    table === 'purchase_items'
      ? await db.query.purchaseItems.findMany({
          where: and(isNull(schema.purchaseItems.subcategoryId), isNotNull(schema.purchaseItems.category)),
          columns: { id: true, name: true, category: true },
          with: { product: { columns: { subcategoryId: true } } },
        })
      : await db.query.pantryItems.findMany({
          where: isNull(schema.pantryItems.subcategoryId),
          columns: { id: true, name: true, category: true },
          with: { product: { columns: { subcategoryId: true } } },
        })
  return rows
    .filter((row): row is typeof row & { category: ItemCategory } => row.category != null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      linkedSubcategoryId: row.product?.subcategoryId ?? null,
      keywordSubcategory: classifySubcategoryByKeyword(row.category, normalizeProductText(row.name)),
    }))
}

export async function previewLineItemRecategorization(table: 'purchase_items' | 'pantry_items'): Promise<RecategorizePreview> {
  const rows = await resolvableLineItems(table)
  const db = getDb()
  const subcategoryRows = await db.query.productSubcategories.findMany({ columns: { id: true, category: true, name: true } })
  const nameById = new Map(subcategoryRows.map((row) => [row.id, row.name]))
  const samples: RecategorizeSample[] = []
  let resolvable = 0
  for (const row of rows) {
    const subcategoryName = row.linkedSubcategoryId ? nameById.get(row.linkedSubcategoryId) ?? null : row.keywordSubcategory
    if (!subcategoryName) continue
    resolvable += 1
    if (samples.length < SAMPLE_SIZE) samples.push({ id: row.id, name: row.name, category: row.category, subcategory: subcategoryName })
  }
  return { totalCandidates: rows.length, resolvable, samples }
}

export async function applyLineItemRecategorization(table: 'purchase_items' | 'pantry_items'): Promise<number> {
  const rows = await resolvableLineItems(table)
  const db = getDb()
  const subcategoryRows = await db.query.productSubcategories.findMany({ columns: { id: true, category: true, name: true } })
  let updated = 0
  for (const row of rows) {
    let subcategoryId = row.linkedSubcategoryId
    if (!subcategoryId && row.keywordSubcategory) {
      subcategoryId = subcategoryRows.find((entry) => entry.category === row.category && entry.name === row.keywordSubcategory)?.id ?? null
    }
    if (!subcategoryId) continue
    if (table === 'purchase_items') {
      await db.update(schema.purchaseItems).set({ subcategoryId }).where(eq(schema.purchaseItems.id, row.id))
    } else {
      await db.update(schema.pantryItems).set({ subcategoryId }).where(eq(schema.pantryItems.id, row.id))
    }
    updated += 1
  }
  return updated
}
