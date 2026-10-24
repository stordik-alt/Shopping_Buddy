import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { MAX_PANTRY_REVIEW_ITEMS, reviewQuantityChanges, splitPantryReview, type PantryQuantityChange } from '@/lib/pantry'

export class PantryReviewInputError extends Error {}
export class PantryReviewNotFoundError extends Error {}

/** The one authoritative bulk check used by both the PWA action and the native API. */
export async function reviewPantryForHousehold(input: {
  householdId: string
  reviewedIds: string[]
  goneIds: string[]
  quantities?: PantryQuantityChange[]
}): Promise<{ removed: number; confirmed: number; adjusted: number }> {
  if (!Array.isArray(input?.reviewedIds) || !input.reviewedIds.every((id) => typeof id === 'string') ||
      !Array.isArray(input?.goneIds) || !input.goneIds.every((id) => typeof id === 'string')) {
    throw new PantryReviewInputError('Neplatná kontrola zásob.')
  }

  const { goneIds, keptIds } = splitPantryReview(input.reviewedIds, input.goneIds)
  let quantities: PantryQuantityChange[]
  try {
    quantities = reviewQuantityChanges(input.quantities, keptIds)
  } catch (error) {
    throw new PantryReviewInputError(error instanceof Error ? error.message : 'Neplatné množství v kontrole zásob.')
  }
  const all = [...goneIds, ...keptIds]
  if (all.length === 0) return { removed: 0, confirmed: 0, adjusted: 0 }
  if (all.length > MAX_PANTRY_REVIEW_ITEMS) throw new PantryReviewInputError('Kontrola obsahuje příliš mnoho položek.')

  const db = getDb()
  const owned = await db
    .select({ id: schema.pantryItems.id })
    .from(schema.pantryItems)
    .where(and(eq(schema.pantryItems.householdId, input.householdId), inArray(schema.pantryItems.id, all)))
  if (owned.length !== all.length) throw new PantryReviewNotFoundError('Pantry item not found')

  if (quantities.length > 0) {
    const detailedRows = await db.query.pantryItemContents.findMany({
      where: inArray(schema.pantryItemContents.pantryItemId, quantities.map((change) => change.id)),
      columns: { pantryItemId: true },
    })
    if (detailedRows.length > 0) throw new PantryReviewInputError('Upravte množství jednotlivých produktů v detailu zásoby.')
  }

  const inHousehold = (ids: string[]) => and(eq(schema.pantryItems.householdId, input.householdId), inArray(schema.pantryItems.id, ids))
  const now = new Date()
  const writes = [
    ...(goneIds.length > 0 ? [db.delete(schema.pantryItems).where(inHousehold(goneIds))] : []),
    ...(keptIds.length > 0 ? [db.update(schema.pantryItems).set({ addedAt: now, askedAt: null }).where(inHousehold(keptIds))] : []),
    ...quantities.map((change) => db.update(schema.pantryItems).set({ quantity: change.quantity }).where(inHousehold([change.id]))),
  ]
  await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]])
  return { removed: goneIds.length, confirmed: keptIds.length, adjusted: quantities.length }
}
