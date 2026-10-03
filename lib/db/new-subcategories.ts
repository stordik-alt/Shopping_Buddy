import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import * as schema from '@/lib/db/schema'
import { normalizeProductText } from '@/lib/product-normalize'
import { classifySubcategoryByKeyword, hasSubcategoryKeyword, NEW_FOOD_SUBCATEGORIES } from '@/lib/product-subcategories'

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
// Re-running it also takes back what an earlier, looser version of the rules put into a new
// subcategory (the first production run, 2026-10-03, put liqueur chocolates among the drinks and
// lentil soups among the pulses): a row in a new subcategory that the rules now place elsewhere moves
// there, or loses its subcategory when that subcategory's own rule now vetoes it. A row the rules
// never touched — no keyword of its subcategory in its name, so a household put it there — stays.
//
// Writes go out in batches — one UPDATE per target subcategory and 1,000 rows — since every round
// trip keeps the Neon compute busy. Preview first (nothing written), then apply.

const NEW_NAMES = new Set<string>(NEW_FOOD_SUBCATEGORIES)
const CHUNK = 1000

/** `to: null` takes the subcategory away (the rules place the row nowhere). */
export type SubcategoryMove = { id: string; name: string; from: string | null; to: string | null }
export type MovePlan = {
  products: SubcategoryMove[]
  purchaseItems: (SubcategoryMove & { purchaseId: string })[]
  pantryItems: SubcategoryMove[]
}

const UNCHANGED = Symbol('unchanged')

/** Where a Potraviny row named `name`, now in `from`, moves — or UNCHANGED. Into a new subcategory
 *  whenever the rules place it there (the owner's decision, overriding even a hand-set one); out of a
 *  new subcategory only when that subcategory's keyword is in the name, i.e. a rule put it there. */
function targetFor(name: string, from: string | null): string | null | typeof UNCHANGED {
  const normalized = normalizeProductText(name)
  const to = classifySubcategoryByKeyword('Potraviny', normalized)
  if (to === from) return UNCHANGED
  if (to && NEW_NAMES.has(to)) return to
  if (from && NEW_NAMES.has(from) && hasSubcategoryKeyword('Potraviny', from, normalized)) return to
  return UNCHANGED
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
    const from = product.subcategoryId ? nameById.get(product.subcategoryId) ?? null : null
    const to = targetFor(product.name, from)
    productTarget.set(product.id, to === UNCHANGED ? from : to)
    if (to !== UNCHANGED) productMoves.push({ id: product.id, name: product.name, from, to })
  }

  // A line linked to a product goes where its product now is, as long as that is into or out of a
  // new subcategory; an unlinked line is placed by its own name.
  const lineTarget = (productId: string | null, name: string, from: string | null): string | null | typeof UNCHANGED => {
    if (productId && productTarget.has(productId)) {
      const target = productTarget.get(productId) ?? null
      if (target === from) return UNCHANGED
      return (target && NEW_NAMES.has(target)) || (from && NEW_NAMES.has(from)) ? target : UNCHANGED
    }
    return targetFor(name, from)
  }

  const purchaseRows = await db.query.purchaseItems.findMany({
    where: and(eq(schema.purchaseItems.category, 'Potraviny'), scope ? inArray(schema.purchaseItems.productId, scope) : undefined),
    columns: { id: true, name: true, productId: true, subcategoryId: true, purchaseId: true },
  })
  const purchaseItems = purchaseRows.flatMap((row) => {
    const from = row.subcategoryId ? nameById.get(row.subcategoryId) ?? null : null
    const to = lineTarget(row.productId, row.name, from)
    return to === UNCHANGED ? [] : [{ id: row.id, name: row.name, from, to, purchaseId: row.purchaseId }]
  })

  const pantryRows = await db.query.pantryItems.findMany({
    where: and(eq(schema.pantryItems.category, 'Potraviny'), scope ? inArray(schema.pantryItems.productId, scope) : undefined),
    columns: { id: true, name: true, productId: true, subcategoryId: true },
  })
  const pantryItems = pantryRows.flatMap((row) => {
    const from = row.subcategoryId ? nameById.get(row.subcategoryId) ?? null : null
    const to = lineTarget(row.productId, row.name, from)
    return to === UNCHANGED ? [] : [{ id: row.id, name: row.name, from, to }]
  })

  return { products: productMoves, purchaseItems, pantryItems }
}

/** Ids grouped by target subcategory, in chunks — the shape the batched UPDATEs need. */
function batches(moves: SubcategoryMove[]): { to: string | null; ids: string[] }[] {
  const byTarget = new Map<string | null, string[]>()
  for (const move of moves) {
    const ids = byTarget.get(move.to)
    if (ids) ids.push(move.id)
    else byTarget.set(move.to, [move.id])
  }
  return [...byTarget].flatMap(([to, ids]) => {
    const out: { to: string | null; ids: string[] }[] = []
    for (let i = 0; i < ids.length; i += CHUNK) out.push({ to, ids: ids.slice(i, i + CHUNK) })
    return out
  })
}

/** Applies a plan from `planNewSubcategoryMoves()`. Returns how many rows and purchases changed. */
export async function applyNewSubcategoryMoves(plan: MovePlan): Promise<{ products: number; purchaseItems: number; pantryItems: number; purchasesRecomputed: number }> {
  const db = getDb()
  const { idByName } = await subcategoryIds()
  const target = (name: string | null): string | null => {
    if (name == null) return null
    const id = idByName.get(name)
    if (!id) throw new Error(`Unknown Potraviny subcategory ${name}`)
    return id
  }

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
