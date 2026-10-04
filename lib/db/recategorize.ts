// Historical re-categorization (spec sections 19-20): fills in `subcategory_id` for
// products/purchase_items/pantry_items that predate this feature (or that the pipeline could not
// place confidently at import time), WITHOUT touching the raw data those rows were built from — no
// receipt is re-scanned, no purchase is re-created. Deliberately conservative: only ever fills a
// currently-NULL subcategory, never overwrites one that is already set (by the pipeline, an AI
// suggestion, or a household correction), so running this repeatedly is safe and idempotent
// (CLAUDE.md section 34), and it can never silently undo a human's own decision.
//
// It also fills the category of old purchase lines that have none (written before purchase_items
// had the column) — but only from the catalog product the line is linked to, never guessed from the
// line's name: their original category was never kept (lib/db/purchase-items.ts).
//
// Every entry point has a preview (dry run: count + sample of what would change, nothing written)
// and an apply step, per CLAUDE.md section 7/spec section 20 ("no destructive migration without a
// dry-run showing affected records and sample changes"). Writes go out in batches — one UPDATE per
// target value and 1,000 rows — since every round trip keeps the Neon compute busy; a purchase with
// a changed line gets its expenses recomputed, so the budget split follows.

import { and, inArray, isNotNull, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'
import { classifySubcategoryByKeyword } from '@/lib/product-subcategories'
import { normalizeProductText } from '@/lib/product-normalize'
import type { ItemCategory } from '@/lib/types'

export type RecategorizeSample = { id: string; name: string; category: ItemCategory; subcategory: string }
export type RecategorizePreview = { totalCandidates: number; resolvable: number; samples: RecategorizeSample[] }

const SAMPLE_SIZE = 20
const CHUNK = 1000

/** Limits a run to these rows (tests use it; the script runs on everything). */
export type RecategorizeScope = { productIds?: string[]; purchaseIds?: string[] }

type Assignment = { id: string; name: string; category: ItemCategory; subcategoryId: string; subcategory: string }

async function subcategoryCatalog() {
  const rows = await getDb().query.productSubcategories.findMany({ columns: { id: true, category: true, name: true } })
  return {
    idOf: (category: ItemCategory, name: string) => rows.find((row) => row.category === category && row.name === name)?.id ?? null,
    // The subcategory, but only when it belongs to `category` — a line's product may sit in another
    // category than the line itself, and its subcategory must not cross over.
    nameOf: (id: string, category: ItemCategory) => rows.find((row) => row.id === id && row.category === category)?.name ?? null,
  }
}

function preview(totalCandidates: number, assignments: Assignment[]): RecategorizePreview {
  return {
    totalCandidates,
    resolvable: assignments.length,
    samples: assignments.slice(0, SAMPLE_SIZE).map(({ id, name, category, subcategory }) => ({ id, name, category, subcategory })),
  }
}

/** Ids grouped by the value they get, in chunks of CHUNK. */
function batches<T extends { id: string }>(rows: T[], key: (row: T) => string): { value: string; ids: string[] }[] {
  const byValue = new Map<string, string[]>()
  for (const row of rows) byValue.set(key(row), [...(byValue.get(key(row)) ?? []), row.id])
  return [...byValue].flatMap(([value, ids]) => {
    const out: { value: string; ids: string[] }[] = []
    for (let i = 0; i < ids.length; i += CHUNK) out.push({ value, ids: ids.slice(i, i + CHUNK) })
    return out
  })
}

// --- Products ------------------------------------------------------------------------------------

async function productAssignments(scope: RecategorizeScope): Promise<{ total: number; assignments: Assignment[] }> {
  const rows = await getDb().query.products.findMany({
    where: and(isNull(schema.products.subcategoryId), scope.productIds ? inArray(schema.products.id, scope.productIds) : undefined),
    columns: { id: true, name: true },
    with: { category: { columns: { name: true } } },
  })
  const { idOf } = await subcategoryCatalog()
  const assignments: Assignment[] = []
  for (const row of rows) {
    const subcategory = classifySubcategoryByKeyword(row.category.name, normalizeProductText(row.name))
    const subcategoryId = subcategory ? idOf(row.category.name, subcategory) : null
    if (subcategory && subcategoryId) assignments.push({ id: row.id, name: row.name, category: row.category.name, subcategoryId, subcategory })
  }
  return { total: rows.length, assignments }
}

/** Products with no subcategory yet whose name the keyword rules can now place. Read-only. */
export async function previewProductRecategorization(scope: RecategorizeScope = {}): Promise<RecategorizePreview> {
  const { total, assignments } = await productAssignments(scope)
  return preview(total, assignments)
}

/** Writes the subcategory for every product the keyword rules can place — same rule as the preview,
 *  applied for real. Returns how many rows were actually updated. Never touches a product that
 *  already has a subcategory (the `subcategory_id IS NULL` guard is part of every UPDATE). */
export async function applyProductRecategorization(scope: RecategorizeScope = {}): Promise<number> {
  const db = getDb()
  const { assignments } = await productAssignments(scope)
  let updated = 0
  for (const batch of batches(assignments, (row) => row.subcategoryId)) {
    const rows = await db
      .update(schema.products)
      .set({ subcategoryId: batch.value })
      .where(and(inArray(schema.products.id, batch.ids), isNull(schema.products.subcategoryId)))
      .returning({ id: schema.products.id })
    updated += rows.length
  }
  return updated
}

// --- Purchase lines and pantry rows ----------------------------------------------------------------

/** Line items (purchase_items or pantry_items — same shape, different table) with no subcategory
 *  yet, resolved either from their linked product's now-known subcategory or, failing that, the
 *  keyword rules applied to the line's own stored name. Shared by both preview and apply below so
 *  the two can never disagree about what counts as "resolvable". */
async function lineAssignments(table: 'purchase_items' | 'pantry_items', scope: RecategorizeScope): Promise<{ total: number; assignments: (Assignment & { purchaseId: string | null })[] }> {
  const db = getDb()
  const rows =
    table === 'purchase_items'
      ? (
          await db.query.purchaseItems.findMany({
            where: and(
              isNull(schema.purchaseItems.subcategoryId),
              isNotNull(schema.purchaseItems.category),
              scope.purchaseIds ? inArray(schema.purchaseItems.purchaseId, scope.purchaseIds) : undefined,
            ),
            columns: { id: true, name: true, category: true, purchaseId: true },
            with: { product: { columns: { subcategoryId: true } } },
          })
        ).map((row) => ({ ...row, purchaseId: row.purchaseId as string | null }))
      : (
          await db.query.pantryItems.findMany({
            where: and(isNull(schema.pantryItems.subcategoryId), scope.productIds ? inArray(schema.pantryItems.productId, scope.productIds) : undefined),
            columns: { id: true, name: true, category: true },
            with: { product: { columns: { subcategoryId: true } } },
          })
        ).map((row) => ({ ...row, purchaseId: null as string | null }))
  const { idOf, nameOf } = await subcategoryCatalog()
  const assignments: (Assignment & { purchaseId: string | null })[] = []
  for (const row of rows) {
    if (row.category == null) continue
    const linked = row.product?.subcategoryId ? nameOf(row.product.subcategoryId, row.category) : null
    const subcategory = linked ?? classifySubcategoryByKeyword(row.category, normalizeProductText(row.name))
    const subcategoryId = subcategory ? idOf(row.category, subcategory) : null
    if (subcategory && subcategoryId) assignments.push({ id: row.id, name: row.name, category: row.category, subcategoryId, subcategory, purchaseId: row.purchaseId })
  }
  return { total: rows.length, assignments }
}

export async function previewLineItemRecategorization(table: 'purchase_items' | 'pantry_items', scope: RecategorizeScope = {}): Promise<RecategorizePreview> {
  const { total, assignments } = await lineAssignments(table, scope)
  return preview(total, assignments)
}

/** Applies the preview's line assignments; for purchase lines, recomputes each touched purchase's
 *  expenses so the budget's subcategory split follows. Returns how many rows were updated. */
export async function applyLineItemRecategorization(table: 'purchase_items' | 'pantry_items', scope: RecategorizeScope = {}): Promise<number> {
  const db = getDb()
  const { assignments } = await lineAssignments(table, scope)
  let updated = 0
  for (const batch of batches(assignments, (row) => row.subcategoryId)) {
    const rows =
      table === 'purchase_items'
        ? await db
            .update(schema.purchaseItems)
            .set({ subcategoryId: batch.value })
            .where(and(inArray(schema.purchaseItems.id, batch.ids), isNull(schema.purchaseItems.subcategoryId)))
            .returning({ id: schema.purchaseItems.id })
        : await db
            .update(schema.pantryItems)
            .set({ subcategoryId: batch.value })
            .where(and(inArray(schema.pantryItems.id, batch.ids), isNull(schema.pantryItems.subcategoryId)))
            .returning({ id: schema.pantryItems.id })
    updated += rows.length
  }
  for (const purchaseId of new Set(assignments.flatMap((row) => (row.purchaseId ? [row.purchaseId] : [])))) {
    await recomputePurchaseExpenses(db, purchaseId)
  }
  return updated
}

// --- Old purchase lines without a category ---------------------------------------------------------

type CategoryAssignment = { id: string; name: string; category: ItemCategory; subcategoryId: string | null; purchaseId: string }

/** Purchase lines with no category that are linked to a catalog product: they take the product's
 *  category (and its subcategory). Lines not linked to a product are left alone — their category
 *  would only be a guess from the printed name. */
async function categoryAssignments(scope: RecategorizeScope): Promise<{ total: number; assignments: CategoryAssignment[] }> {
  const rows = await getDb().query.purchaseItems.findMany({
    where: and(isNull(schema.purchaseItems.category), scope.purchaseIds ? inArray(schema.purchaseItems.purchaseId, scope.purchaseIds) : undefined),
    columns: { id: true, name: true, purchaseId: true },
    with: { product: { columns: { subcategoryId: true }, with: { category: { columns: { name: true } } } } },
  })
  const assignments = rows.flatMap((row) =>
    row.product ? [{ id: row.id, name: row.name, category: row.product.category.name, subcategoryId: row.product.subcategoryId, purchaseId: row.purchaseId }] : [],
  )
  return { total: rows.length, assignments }
}

export async function previewLineCategoryFill(scope: RecategorizeScope = {}): Promise<RecategorizePreview> {
  const { total, assignments } = await categoryAssignments(scope)
  return {
    totalCandidates: total,
    resolvable: assignments.length,
    samples: assignments.slice(0, SAMPLE_SIZE).map(({ id, name, category }) => ({ id, name, category, subcategory: '(z produktu)' })),
  }
}

export async function applyLineCategoryFill(scope: RecategorizeScope = {}): Promise<number> {
  const db = getDb()
  const { assignments } = await categoryAssignments(scope)
  let updated = 0
  for (const batch of batches(assignments, (row) => `${row.category}|${row.subcategoryId ?? ''}`)) {
    const [category, subcategoryId] = batch.value.split('|') as [ItemCategory, string]
    const rows = await db
      .update(schema.purchaseItems)
      .set({ category, subcategoryId: subcategoryId || null })
      .where(and(inArray(schema.purchaseItems.id, batch.ids), isNull(schema.purchaseItems.category)))
      .returning({ id: schema.purchaseItems.id })
    updated += rows.length
  }
  for (const purchaseId of new Set(assignments.map((row) => row.purchaseId))) await recomputePurchaseExpenses(db, purchaseId)
  return updated
}
