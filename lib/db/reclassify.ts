// Re-classification of rows that already have a subcategory (owner decision 2026-10-04: "Obojí" —
// re-place them by the current rules, even ones a household set by hand), and a category for old
// purchase lines that have none and are linked to no product.
//
// lib/db/recategorize.ts only fills empty values and never overwrites. The keyword rules have since
// grown (lib/product-subcategories.ts, 2026-10-04), so ~1,300 catalog products sit where an earlier,
// looser rule put them — juices among fruit, instant soups among meat. This moves:
//   - a product to the subcategory the rules now give it;
//   - a product to no subcategory when the rules place it nowhere AND its current subcategory's
//     keyword is in its name (a rule put it there and now vetoes it) — a name with no keyword of
//     its subcategory was placed by a household and keeps it;
//   - a purchase line or pantry row linked to a moved product with it, when it sat where the
//     product sat; an unlinked one by its own name, the same way.
// Old purchase lines without a category (written before purchase_items had the column) get one
// only from evidence: a catalog product of exactly that name, or keyword rules that place the name
// in exactly one category. Anything ambiguous stays as it is.
//
// Preview first, then apply. Every UPDATE re-checks the value the plan saw (a row changed in between
// is skipped), writes go out in batches of 1,000, and every purchase with a changed line gets its
// expenses recomputed so the budget split follows (its total does not change).

import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'
import { normalizeSearchText } from '@/lib/product-search'
import { normalizeProductText } from '@/lib/product-normalize'
import { classifySubcategoryByKeyword, hasSubcategoryKeyword, placeByKeywordInOneCategory } from '@/lib/product-subcategories'
import type { ItemCategory } from '@/lib/types'

const CHUNK = 1000

export type Move = { id: string; name: string; category: ItemCategory; from: string | null; to: string | null }
export type LineMove = Move & { purchaseId: string | null }
export type CategoryGuess = { id: string; name: string; category: ItemCategory; subcategory: string | null; purchaseId: string; evidence: 'catalog' | 'rules' }
export type ReclassifyPlan = { products: Move[]; purchaseItems: LineMove[]; pantryItems: LineMove[]; lineCategories: CategoryGuess[] }
export type ReclassifyScope = { productIds?: string[]; purchaseIds?: string[] }

const UNCHANGED = Symbol('unchanged')

/** Where a row named `name` in `category`, now in subcategory `from`, belongs — or UNCHANGED. */
function targetFor(category: ItemCategory, name: string, from: string | null): string | null | typeof UNCHANGED {
  const normalized = normalizeProductText(name)
  const to = classifySubcategoryByKeyword(category, normalized)
  if (to === from) return UNCHANGED
  if (to) return to
  // The rules place it nowhere: take the subcategory away only if a rule could have given it.
  if (from && hasSubcategoryKeyword(category, from, normalized)) return null
  return UNCHANGED
}

async function subcategoryCatalog() {
  const rows = await getDb().query.productSubcategories.findMany({ columns: { id: true, category: true, name: true } })
  return {
    nameOf: (id: string | null) => (id ? rows.find((row) => row.id === id)?.name ?? null : null),
    idOf: (category: ItemCategory, name: string | null) => {
      if (name == null) return null
      const id = rows.find((row) => row.category === category && row.name === name)?.id
      if (!id) throw new Error(`Unknown subcategory ${category} ▸ ${name}`)
      return id
    },
  }
}

/** What would change. Read-only. `scope` limits it to some rows (tests use it). */
export async function planReclassification(scope: ReclassifyScope = {}): Promise<ReclassifyPlan> {
  const db = getDb()
  const { nameOf } = await subcategoryCatalog()

  const products = await db.query.products.findMany({
    where: scope.productIds ? inArray(schema.products.id, scope.productIds) : undefined,
    columns: { id: true, name: true, subcategoryId: true },
    with: { category: { columns: { name: true } } },
  })
  const productMoves: Move[] = []
  const movedProduct = new Map<string, Move>()
  for (const product of products) {
    const category = product.category.name
    const from = nameOf(product.subcategoryId)
    const to = targetFor(category, product.name, from)
    if (to === UNCHANGED) continue
    const move = { id: product.id, name: product.name, category, from, to }
    productMoves.push(move)
    movedProduct.set(product.id, move)
  }

  // A linked line follows its product when it sat where the product sat (a line a household
  // re-placed on its own keeps that); an unlinked line is placed by its own name.
  const lineMove = (row: { id: string; name: string; category: ItemCategory; subcategoryId: string | null; productId: string | null; purchaseId: string | null }): LineMove | null => {
    const from = nameOf(row.subcategoryId)
    if (row.productId) {
      const product = movedProduct.get(row.productId)
      if (!product || product.category !== row.category || product.from !== from) return null
      return { id: row.id, name: row.name, category: row.category, from, to: product.to, purchaseId: row.purchaseId }
    }
    const to = targetFor(row.category, row.name, from)
    return to === UNCHANGED ? null : { id: row.id, name: row.name, category: row.category, from, to, purchaseId: row.purchaseId }
  }

  const purchaseRows = await db.query.purchaseItems.findMany({
    where: scope.purchaseIds ? inArray(schema.purchaseItems.purchaseId, scope.purchaseIds) : undefined,
    columns: { id: true, name: true, category: true, subcategoryId: true, productId: true, purchaseId: true },
  })
  const purchaseItems = purchaseRows.flatMap((row) => {
    if (row.category == null) return []
    const move = lineMove({ ...row, category: row.category })
    return move ? [move] : []
  })

  const pantryRows = await db.query.pantryItems.findMany({
    where: scope.productIds ? inArray(schema.pantryItems.productId, scope.productIds) : undefined,
    columns: { id: true, name: true, category: true, subcategoryId: true, productId: true },
  })
  const pantryItems = pantryRows.flatMap((row) => {
    const move = lineMove({ ...row, purchaseId: null })
    return move ? [move] : []
  })

  return { products: productMoves, purchaseItems, pantryItems, lineCategories: await planLineCategories(scope) }
}

/** Old purchase lines with no category and no product: a category only from evidence. */
async function planLineCategories(scope: ReclassifyScope): Promise<CategoryGuess[]> {
  const db = getDb()
  const rows = await db.query.purchaseItems.findMany({
    where: and(
      isNull(schema.purchaseItems.category),
      isNull(schema.purchaseItems.productId),
      scope.purchaseIds ? inArray(schema.purchaseItems.purchaseId, scope.purchaseIds) : undefined,
    ),
    columns: { id: true, name: true, purchaseId: true },
  })
  if (rows.length === 0) return []
  // A catalog product of exactly this name (the same accent- and case-insensitive form the
  // catalog lookup uses).
  const forms = [...new Set(rows.map((row) => normalizeSearchText(row.name.trim())))]
  const catalog = await db.query.products.findMany({
    where: inArray(schema.products.searchName, forms),
    columns: { name: true, searchName: true },
    with: { category: { columns: { name: true } } },
  })
  const guesses: CategoryGuess[] = []
  for (const row of rows) {
    const form = normalizeSearchText(row.name.trim())
    const categories = [...new Set(catalog.filter((product) => product.searchName === form).map((product) => product.category.name))]
    const normalized = normalizeProductText(row.name)
    if (categories.length === 1) {
      const category = categories[0]
      guesses.push({ id: row.id, name: row.name, category, subcategory: classifySubcategoryByKeyword(category, normalized), purchaseId: row.purchaseId, evidence: 'catalog' })
      continue
    }
    if (categories.length > 1) continue
    const placed = placeByKeywordInOneCategory(normalized)
    if (placed) guesses.push({ id: row.id, name: row.name, ...placed, purchaseId: row.purchaseId, evidence: 'rules' })
  }
  return guesses
}

/** Ids grouped by (from, to), in chunks — each batch re-checks `from` when it writes. */
function batches<T extends Move>(moves: T[]): { category: ItemCategory; from: string | null; to: string | null; ids: string[] }[] {
  const groups = new Map<string, { category: ItemCategory; from: string | null; to: string | null; ids: string[] }>()
  for (const move of moves) {
    const key = `${move.category}|${move.from ?? ''}|${move.to ?? ''}`
    const group = groups.get(key) ?? { category: move.category, from: move.from, to: move.to, ids: [] }
    group.ids.push(move.id)
    groups.set(key, group)
  }
  return [...groups.values()].flatMap((group) => {
    const out = []
    for (let i = 0; i < group.ids.length; i += CHUNK) out.push({ ...group, ids: group.ids.slice(i, i + CHUNK) })
    return out
  })
}

const sameSubcategory = (
  column: typeof schema.products.subcategoryId | typeof schema.purchaseItems.subcategoryId | typeof schema.pantryItems.subcategoryId,
  id: string | null,
): SQL => (id ? eq(column, id) : isNull(column))

/** Applies a plan from `planReclassification()`. Returns how many rows changed. */
export async function applyReclassification(plan: ReclassifyPlan): Promise<{ products: number; purchaseItems: number; pantryItems: number; lineCategories: number; purchasesRecomputed: number }> {
  const db = getDb()
  const { idOf } = await subcategoryCatalog()
  const done = { products: 0, purchaseItems: 0, pantryItems: 0, lineCategories: 0, purchasesRecomputed: 0 }

  for (const batch of batches(plan.products)) {
    const rows = await db
      .update(schema.products)
      .set({ subcategoryId: idOf(batch.category, batch.to) })
      .where(and(inArray(schema.products.id, batch.ids), sameSubcategory(schema.products.subcategoryId, idOf(batch.category, batch.from))))
      .returning({ id: schema.products.id })
    done.products += rows.length
  }
  const touchedPurchases = new Set<string>()
  for (const batch of batches(plan.purchaseItems)) {
    const rows = await db
      .update(schema.purchaseItems)
      .set({ subcategoryId: idOf(batch.category, batch.to) })
      .where(and(inArray(schema.purchaseItems.id, batch.ids), eq(schema.purchaseItems.category, batch.category), sameSubcategory(schema.purchaseItems.subcategoryId, idOf(batch.category, batch.from))))
      .returning({ id: schema.purchaseItems.id, purchaseId: schema.purchaseItems.purchaseId })
    done.purchaseItems += rows.length
    for (const row of rows) touchedPurchases.add(row.purchaseId)
  }
  for (const batch of batches(plan.pantryItems)) {
    const rows = await db
      .update(schema.pantryItems)
      .set({ subcategoryId: idOf(batch.category, batch.to) })
      .where(and(inArray(schema.pantryItems.id, batch.ids), eq(schema.pantryItems.category, batch.category), sameSubcategory(schema.pantryItems.subcategoryId, idOf(batch.category, batch.from))))
      .returning({ id: schema.pantryItems.id })
    done.pantryItems += rows.length
  }
  // Old lines without a category: grouped by the category and subcategory they get.
  const groups = new Map<string, CategoryGuess[]>()
  for (const guess of plan.lineCategories) groups.set(`${guess.category}|${guess.subcategory ?? ''}`, [...(groups.get(`${guess.category}|${guess.subcategory ?? ''}`) ?? []), guess])
  for (const guesses of groups.values()) {
    const { category, subcategory } = guesses[0]
    for (let i = 0; i < guesses.length; i += CHUNK) {
      const rows = await db
        .update(schema.purchaseItems)
        .set({ category, subcategoryId: idOf(category, subcategory) })
        .where(and(inArray(schema.purchaseItems.id, guesses.slice(i, i + CHUNK).map((guess) => guess.id)), isNull(schema.purchaseItems.category)))
        .returning({ id: schema.purchaseItems.id, purchaseId: schema.purchaseItems.purchaseId })
      done.lineCategories += rows.length
      for (const row of rows) touchedPurchases.add(row.purchaseId)
    }
  }
  for (const purchaseId of touchedPurchases) await recomputePurchaseExpenses(db, purchaseId)
  done.purchasesRecomputed = touchedPurchases.size
  return done
}
