import { and, asc, count, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { moveNeedsApproval, type CatalogChangeOutcome } from '@/lib/product-subcategory-changes'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import type { ItemCategory } from '@/lib/types'

/** A household's hand-made subcategory choice for a shared catalog product. Applies it to the catalog
 *  at once while the product has had fewer than FREE_SUBCATEGORY_MOVES moves; after that it is stored
 *  as a pending proposal for an administrator instead (the household's own pantry item keeps its
 *  choice either way — the caller sets that). The name must belong to `category`'s fixed list. */
export async function proposeProductSubcategory(
  householdId: string,
  productId: string,
  category: ItemCategory,
  subcategoryName: string,
): Promise<CatalogChangeOutcome> {
  if (!subcategoriesOfItem(category).includes(subcategoryName)) throw new Error('Neplatná podkategorie.')
  const db = getDb()
  const target = await db.query.productSubcategories.findFirst({
    where: and(eq(schema.productSubcategories.category, category), eq(schema.productSubcategories.name, subcategoryName)),
    columns: { id: true },
  })
  if (!target) throw new Error('Neplatná podkategorie.')
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId), columns: { subcategoryId: true } })
  if (!product) throw new Error('Produkt nenalezen.')
  if (product.subcategoryId === target.id) return 'unchanged'

  // A move is a change of a subcategory the product already had; the first placement is free.
  let moves = 0
  if (product.subcategoryId) {
    const [row] = await db
      .select({ moves: count() })
      .from(schema.productSubcategoryChanges)
      .where(
        and(
          eq(schema.productSubcategoryChanges.productId, productId),
          isNotNull(schema.productSubcategoryChanges.fromSubcategoryId),
          inArray(schema.productSubcategoryChanges.status, ['applied', 'approved']),
        ),
      )
    moves = row.moves
  }

  if (product.subcategoryId && moveNeedsApproval(moves)) {
    await db
      .insert(schema.productSubcategoryChanges)
      .values({ productId, householdId, fromSubcategoryId: product.subcategoryId, toSubcategoryId: target.id, status: 'pending' })
      .onConflictDoNothing()
    return 'pending'
  }
  await db.update(schema.products).set({ subcategoryId: target.id }).where(eq(schema.products.id, productId))
  await db.insert(schema.productSubcategoryChanges).values({ productId, householdId, fromSubcategoryId: product.subcategoryId, toSubcategoryId: target.id, status: 'applied' })
  return 'applied'
}

export type PendingSubcategoryChange = {
  id: string
  productName: string
  category: ItemCategory
  fromName: string | null
  toName: string
  householdName: string
  createdAt: string
}

/** The proposals waiting for an administrator, oldest first. */
export async function listPendingSubcategoryChanges(): Promise<PendingSubcategoryChange[]> {
  const rows = await getDb().query.productSubcategoryChanges.findMany({
    where: eq(schema.productSubcategoryChanges.status, 'pending'),
    orderBy: [asc(schema.productSubcategoryChanges.createdAt)],
    with: { product: { columns: { name: true } }, household: { columns: { name: true } }, from: { columns: { name: true } }, to: { columns: { name: true, category: true } } },
  })
  return rows.map((row) => ({
      id: row.id,
      productName: row.product.name,
      category: row.to.category,
      fromName: row.from?.name ?? null,
      toName: row.to.name,
      householdName: row.household.name,
      createdAt: row.createdAt.toISOString(),
    }))
}

/** Approves (applies to the catalog) or rejects a pending proposal; returns false if it was no
 *  longer pending. The check-and-flip is one conditional UPDATE, so two admins cannot both decide. */
export async function decideSubcategoryChange(changeId: string, approve: boolean, adminUserId: string): Promise<boolean> {
  const db = getDb()
  const [change] = await db
    .update(schema.productSubcategoryChanges)
    .set({ status: approve ? 'approved' : 'rejected', decidedAt: new Date(), decidedBy: adminUserId })
    .where(and(eq(schema.productSubcategoryChanges.id, changeId), eq(schema.productSubcategoryChanges.status, 'pending')))
    .returning()
  if (!change) return false
  if (approve) await db.update(schema.products).set({ subcategoryId: change.toSubcategoryId }).where(eq(schema.products.id, change.productId))
  return true
}
