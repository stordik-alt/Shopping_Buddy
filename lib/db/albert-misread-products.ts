import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { albertNameProblem } from '@/lib/ingestion/albert'

// Repair for products the Albert flyer import created before `albertNameProblem` existed: an offer
// whose "name" was a claim printed on the pack ("MÁSLO + JIHOČESKÉ FERMENTOVANÉ PODMÁSLÍ"). The
// import never deletes, and the flyer pages are cached, so without this such a product keeps its
// price and shows up in searches and the shopping plan. Only data the import itself wrote is
// removed — a product any household uses (a list item, purchase, pantry item or pin) or that another
// source also describes is reported and left alone. Nothing true is lost: the rows describe an offer
// under a name that is not the product's.

const ALBERT_SOURCE = 'albert'

export type MisreadProduct = { productId: string; name: string; reason: string; prices: number; deals: number }
export type MisreadReport = { removed: MisreadProduct[]; keptInUse: MisreadProduct[]; applied: boolean }

export async function removeAlbertMisreadProducts(options: { apply: boolean }): Promise<MisreadReport> {
  const db = getDb()
  const candidates = await db
    .selectDistinct({ productId: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .innerJoin(schema.productExternalRefs, eq(schema.productExternalRefs.productId, schema.products.id))
    .where(eq(schema.productExternalRefs.source, ALBERT_SOURCE))

  const report: MisreadReport = { removed: [], keptInUse: [], applied: options.apply }
  for (const candidate of candidates) {
    const reason = albertNameProblem(candidate.name)
    if (!reason) continue
    const count = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0
    const id = candidate.productId
    const entry: MisreadProduct = {
      ...candidate,
      reason,
      prices: await count(db.select({ n: sql<number>`count(*)::int` }).from(schema.prices).where(eq(schema.prices.productId, id))),
      deals: await count(db.select({ n: sql<number>`count(*)::int` }).from(schema.deals).where(eq(schema.deals.productId, id))),
    }
    // Anything a household or another source put on this product stops the removal.
    const inUse =
      (await count(db.select({ n: sql<number>`count(*)::int` }).from(schema.shoppingListItems).where(eq(schema.shoppingListItems.productId, id)))) +
      (await count(db.select({ n: sql<number>`count(*)::int` }).from(schema.purchaseItems).where(eq(schema.purchaseItems.productId, id)))) +
      (await count(db.select({ n: sql<number>`count(*)::int` }).from(schema.pantryItems).where(eq(schema.pantryItems.productId, id)))) +
      (await count(db.select({ n: sql<number>`count(*)::int` }).from(schema.shoppingListItemPins).where(eq(schema.shoppingListItemPins.productId, id)))) +
      (await count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.productExternalRefs)
          .where(and(eq(schema.productExternalRefs.productId, id), sql`${schema.productExternalRefs.source} <> ${ALBERT_SOURCE}`)),
      ))
    if (inUse > 0) {
      report.keptInUse.push(entry)
      continue
    }
    report.removed.push(entry)
    if (!options.apply) continue
    // One atomic batch: the product and everything the import wrote for it go together or not at all.
    await db.batch([
      db.delete(schema.deals).where(eq(schema.deals.productId, id)),
      db.delete(schema.prices).where(eq(schema.prices.productId, id)),
      db.delete(schema.productExternalRefs).where(eq(schema.productExternalRefs.productId, id)),
      db.delete(schema.products).where(eq(schema.products.id, id)),
    ])
  }
  return report
}
