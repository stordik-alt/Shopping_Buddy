// Gives older pantry rows their product type (druh zboží) so recipes can match them by type
// (lib/meal-plans.ts's matchIngredientToStock). Rows created before stock was kept by type carry only
// the receipt's wording. The type comes from the row's concrete product when it has one, otherwise
// from the type rules read off its name (lib/product-types.ts's resolveReceiptLineType); a row the
// rules cannot place, or place in more than one type, is left alone and reported.
//
// Only `product_type_id` is written: no row is renamed, moved or merged with another, so nothing the
// household sees changes except that its stock now matches recipes. Rows that already have a type
// are never touched.

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { loadProductTypeIds } from '@/lib/db/product-type-assignment'
import { resolveReceiptLineType } from '@/lib/product-types'

export type PantryTypeAssignment = { id: string; name: string; typeKey: string; typeId: string; fromProduct: boolean }
export type PantryTypeBackfillPlan = { assignments: PantryTypeAssignment[]; unplaced: Array<{ id: string; name: string }> }

/** What the backfill would do. Read-only. `householdId` limits it (tests). */
export async function planPantryTypeBackfill(options: { householdId?: string } = {}): Promise<PantryTypeBackfillPlan> {
  const db = getDb()
  const typeIds = await loadProductTypeIds()
  const rows = await db.query.pantryItems.findMany({
    where: options.householdId
      ? and(isNull(schema.pantryItems.productTypeId), eq(schema.pantryItems.householdId, options.householdId))
      : isNull(schema.pantryItems.productTypeId),
    columns: { id: true, name: true, category: true },
    with: { product: { columns: { id: true }, with: { productType: { columns: { key: true } } } } },
  })

  const assignments: PantryTypeAssignment[] = []
  const unplaced: Array<{ id: string; name: string }> = []
  for (const row of rows) {
    const resolved = resolveReceiptLineType({ productTypeKey: row.product?.productType?.key ?? null, category: row.category, name: row.name })
    const typeId = resolved ? typeIds.get(resolved.key) : undefined
    if (!resolved || !typeId) {
      unplaced.push({ id: row.id, name: row.name })
      continue
    }
    assignments.push({ id: row.id, name: row.name, typeKey: resolved.key, typeId, fromProduct: resolved.fromProduct })
  }
  return { assignments, unplaced }
}

/** Writes the planned types. The `product_type_id IS NULL` guard keeps a row that got a type since
 *  the plan was made (e.g. a restock) untouched. Returns the number of rows updated. */
export async function applyPantryTypeBackfill(assignments: PantryTypeAssignment[]): Promise<number> {
  const db = getDb()
  let updated = 0
  const byType = new Map<string, string[]>()
  for (const assignment of assignments) byType.set(assignment.typeId, [...(byType.get(assignment.typeId) ?? []), assignment.id])
  for (const [typeId, ids] of byType) {
    for (let start = 0; start < ids.length; start += 500) {
      const part = ids.slice(start, start + 500)
      const result = await db
        .update(schema.pantryItems)
        .set({ productTypeId: typeId })
        .where(and(inArray(schema.pantryItems.id, part), isNull(schema.pantryItems.productTypeId)))
        .returning({ id: schema.pantryItems.id })
      updated += result.length
    }
  }
  return updated
}
