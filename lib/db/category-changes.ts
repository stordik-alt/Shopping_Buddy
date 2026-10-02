import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { moveNeedsApproval, type CategoryChangeOutcome } from '@/lib/product-subcategory-changes'
import type { ItemCategory } from '@/lib/types'
import { syncProductClassificationToPurchases } from '@/lib/db/purchase-items'

/** A household's hand-made category change of a shared catalog product. Applies it to the catalog at
 *  once while the product has had fewer than FREE_SUBCATEGORY_MOVES category moves; after that it is
 *  stored as a pending proposal for an administrator (the household's own pantry item keeps its
 *  choice — the caller sets that). A product whose category an administrator already decided is
 *  locked for good: 'locked', nothing changes. The catalog product's subcategory belongs to the old
 *  category, so an applied change clears it. */
export async function proposeProductCategory(householdId: string, productId: string, category: ItemCategory): Promise<CategoryChangeOutcome> {
  const db = getDb()
  const target = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, category), columns: { id: true } })
  if (!target) throw new Error('Neplatná kategorie.')
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId), columns: { categoryId: true, categoryLocked: true } })
  if (!product) throw new Error('Produkt nenalezen.')
  if (product.categoryLocked) return 'locked'
  if (product.categoryId === target.id) return 'unchanged'

  const [row] = await db
    .select({ moves: count() })
    .from(schema.productCategoryChanges)
    .where(and(eq(schema.productCategoryChanges.productId, productId), inArray(schema.productCategoryChanges.status, ['applied', 'approved'])))

  if (moveNeedsApproval(row.moves)) {
    await db
      .insert(schema.productCategoryChanges)
      .values({ productId, householdId, fromCategoryId: product.categoryId, toCategoryId: target.id, status: 'pending' })
      .onConflictDoNothing()
    return 'pending'
  }
  await db.update(schema.products).set({ categoryId: target.id, subcategoryId: null }).where(eq(schema.products.id, productId))
  await syncProductClassificationToPurchases(productId)
  invalidateProductCatalogCache()  await db.insert(schema.productCategoryChanges).values({ productId, householdId, fromCategoryId: product.categoryId, toCategoryId: target.id, status: 'applied' })
  return 'applied'
}

export type PendingCategoryChange = {
  id: string
  productName: string
  fromName: string
  toName: string
  householdName: string
  createdAt: string
}

/** The category proposals waiting for an administrator, oldest first. */
export async function listPendingCategoryChanges(): Promise<PendingCategoryChange[]> {
  const rows = await getDb().query.productCategoryChanges.findMany({
    where: eq(schema.productCategoryChanges.status, 'pending'),
    orderBy: [asc(schema.productCategoryChanges.createdAt)],
    with: { product: { columns: { name: true } }, household: { columns: { name: true } }, from: { columns: { name: true } }, to: { columns: { name: true } } },
  })
  return rows.map((row) => ({
    id: row.id,
    productName: row.product.name,
    fromName: row.from.name,
    toName: row.to.name,
    householdName: row.household.name,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** Approves or rejects a pending category proposal; returns false if it was no longer pending. Either
 *  way the product's category is locked afterwards; approval also moves the product (and clears its
 *  subcategory). The check-and-flip is one conditional UPDATE, so two admins cannot both decide. */
export async function decideCategoryChange(changeId: string, approve: boolean, adminUserId: string): Promise<boolean> {
  const db = getDb()
  const [change] = await db
    .update(schema.productCategoryChanges)
    .set({ status: approve ? 'approved' : 'rejected', decidedAt: new Date(), decidedBy: adminUserId })
    .where(and(eq(schema.productCategoryChanges.id, changeId), eq(schema.productCategoryChanges.status, 'pending')))
    .returning()
  if (!change) return false
  await db
    .update(schema.products)
    .set(approve ? { categoryId: change.toCategoryId, subcategoryId: null, categoryLocked: true } : { categoryLocked: true })
    .where(eq(schema.products.id, change.productId))
  if (approve) await syncProductClassificationToPurchases(change.productId)
  // Other households' waiting proposals for the same product are settled by this decision.
  await db
    .update(schema.productCategoryChanges)
    .set({ status: 'rejected', decidedAt: new Date(), decidedBy: adminUserId })
    .where(and(eq(schema.productCategoryChanges.productId, change.productId), eq(schema.productCategoryChanges.status, 'pending')))
  return true
}
