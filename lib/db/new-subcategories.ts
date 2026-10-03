import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'
import { classifySubcategoryByKeyword, NEW_FOOD_SUBCATEGORIES } from '@/lib/product-subcategories'

// One-off move into the Potraviny subcategories added on 2026-10-03 (migration 0060): coffee and
// tea, alcohol, eggs, fish, spices, … had no subcategory of their own, so the keyword rules put them
// under a broader one ("Nápoje", "Trvanlivé potraviny") or left them without any.
//
// Owner decision (2026-10-03): move everything the current rules place in a new subcategory —
// including rows a household had set or corrected by hand. Unlike lib/db/recategorize.ts, which only
// fills empty rows, this overwrites; it only ever moves *into* one of the new subcategories, so no
// other assignment is touched. Purchase lines follow their product (or their own name when not
// linked to one), pantry rows likewise, and every purchase with a moved line gets its expenses
// recomputed so the budget shows the same split. A household's manual expense splits are kept as
// they are (recomputePurchaseExpenses applies them on top).
//
// Writes go out in batches — one UPDATE per target subcategory and 1,000 rows — since every round
// trip keeps the Neon compute busy. Preview first (nothing written), then apply.

const NEW_NAMES = new Set<string>(NEW_FOOD_SUBCATEGORIES)
const CHUNK = 1000

export type SubcategoryMove = { id: string; name: string; from: string | null; to: string }
export type MovePlan = {
  products: SubcategoryMove[]
  purchaseItems: (SubcategoryMove & { purchaseId: string })[]
  pantryItems: SubcategoryMove[]
}

/** Where a Potraviny name belongs when that is one of the new subcategories; otherwise null. */
function newSubcategoryFor(name: string): string | null {
  const subcategory = classifySubcategoryByKeyword('Potraviny', normalizeProductText(name))
  return subcategory && NEW_NAMES.has(subcategory) ? subcategory : null
}

async function subcategoryIds(): Promise<{ idByName: Map<string, string>; nameById: Map<string, string> }> {
  const rows = await getDb().query.productSubcategories.findMany({ where: eq(schema.productSubcategories.category, 'Potraviny'), columns: { id: true, name: true } })
  const idByName = new Map(rows.map((row) => [row.name, row.id]))
  const missing = NEW_FOOD_SUBCATEGORIES.filter((name) => !idByName.has(name))
  if (missing.length > 0) throw new Error(`Subcategories missing in the database (run the migrations first): ${missing.join(', ')}`)
  const nameById = new Map<string, string>()
  for (const row of await getDb().query.productSubcategories.findMany({ columns: { id: true, name: true } })) nameById.set(row.id, row.name)
  return { idByName, nameById }
}

/** What would move. Read-only. `productIds` limits the plan to those products and the lines linked
 *  to them (tests use it; the script plans everything). */
export async function planNewSubcategoryMoves(options: { productIds?: string[] } = {}): Promise<MovePlan> {
  const scope = options.productIds
  const db = getDb()
  const { nameById } = await subcategoryIds()

  const products = await db
    .select({ id: schema.products.id, name: schema.products.name, subcategoryId: schema.products.subcategoryId })
    .from(schema.products)
    .innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId))
    .where(and(eq(schema.productCategories.name, 'Potraviny'), scope ? inArray(schema.products.id, scope) : undefined))
  const productMoves: SubcategoryMove[] = []
  // Where each product ends up — moved or not — so lines linked to it follow it.
  const productTarget = new Map<string, string | null>()
  for (const product of products) {
    const to = newSubcategoryFor(product.name)
    const from = product.subcategoryId ? nameById.get(product.subcategoryId) ?? null : null
    productTarget.set(product.id, to ?? from)
    if (to && to !== from) productMoves.push({ id: product.id, name: product.name, from, to })
  }

  // A line linked to a product goes where its product now is, but only into a new subcategory; an
  // unlinked line is placed by its own name.
  const lineTarget = (productId: string | null, name: string): string | null => {
    if (productId && productTarget.has(productId)) {
      const target = productTarget.get(productId) ?? null
      return target && NEW_NAMES.has(target) ? target : null
    }
    return newSubcategoryFor(name)
  }

  const purchaseRows = await db.query.purchaseItems.findMany({
    where: and(eq(schema.purchaseItems.category, 'Potraviny'), scope ? inArray(schema.purchaseItems.productId, scope) : undefined),
    columns: { id: true, name: true, productId: true, subcategoryId: true, purchaseId: true },
  })
  const purchaseItems = purchaseRows.flatMap((row) => {
    const to = lineTarget(row.productId, row.name)
    const from = row.subcategoryId ? nameById.get(row.subcategoryId) ?? null : null
    return to && to !== from ? [{ id: row.id, name: row.name, from, to, purchaseId: row.purchaseId }] : []
  })

  const pantryRows = await db.query.pantryItems.findMany({
    where: and(eq(schema.pantryItems.category, 'Potraviny'), scope ? inArray(schema.pantryItems.productId, scope) : undefined),
    columns: { id: true, name: true, productId: true, subcategoryId: true },
  })
  const pantryItems = pantryRows.flatMap((row) => {
    const to = lineTarget(row.productId, row.name)
    const from = row.subcategoryId ? nameById.get(row.subcategoryId) ?? null : null
    return to && to !== from ? [{ id: row.id, name: row.name, from, to }] : []
  })

  return { products: productMoves, purchaseItems, pantryItems }
}

/** Ids grouped by target subcategory, in chunks — the shape the batched UPDATEs need. */
function batches(moves: SubcategoryMove[]): { to: string; ids: string[] }[] {
  const byTarget = new Map<string, string[]>()
  for (const move of moves) {
    const ids = byTarget.get(move.to)
    if (ids) ids.push(move.id)
    else byTarget.set(move.to, [move.id])
  }
  return [...byTarget].flatMap(([to, ids]) => {
    const out: { to: string; ids: string[] }[] = []
    for (let i = 0; i < ids.length; i += CHUNK) out.push({ to, ids: ids.slice(i, i + CHUNK) })
    return out
  })
}

/** Applies a plan from `planNewSubcategoryMoves()`. Returns how many rows and purchases changed. */
export async function applyNewSubcategoryMoves(plan: MovePlan): Promise<{ products: number; purchaseItems: number; pantryItems: number; purchasesRecomputed: number }> {
  const db = getDb()
  const { idByName } = await subcategoryIds()
  const target = (name: string) => idByName.get(name)!

  for (const batch of batches(plan.products)) {
    await db.update(schema.products).set({ subcategoryId: target(batch.to) }).where(inArray(schema.products.id, batch.ids))
  }
  for (const batch of batches(plan.purchaseItems)) {
    await db.update(schema.purchaseItems).set({ subcategoryId: target(batch.to) }).where(and(inArray(schema.purchaseItems.id, batch.ids), eq(schema.purchaseItems.category, 'Potraviny')))
  }
  for (const batch of batches(plan.pantryItems)) {
    await db.update(schema.pantryItems).set({ subcategoryId: target(batch.to) }).where(and(inArray(schema.pantryItems.id, batch.ids), eq(schema.pantryItems.category, 'Potraviny')))
  }

  // The budget reads expenses, which are derived from the purchase lines: recompute each purchase
  // that had a line moved, so its split matches the new subcategories.
  const purchaseIds = [...new Set(plan.purchaseItems.map((item) => item.purchaseId))]
  for (const purchaseId of purchaseIds) await recomputePurchaseExpenses(db, purchaseId)

  return { products: plan.products.length, purchaseItems: plan.purchaseItems.length, pantryItems: plan.pantryItems.length, purchasesRecomputed: purchaseIds.length }
}
