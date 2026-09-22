'use server'

import { and, eq, ilike, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { ItemCategory, ItemUnit, PurchaseRecord } from '@/lib/types'

async function assertOwnsList(householdId: string, listId: string) {
  const db = getDb()
  const list = await db.query.shoppingLists.findFirst({ where: eq(schema.shoppingLists.id, listId) })
  if (!list || list.householdId !== householdId) throw new Error('Shopping list not found')
}

/** Restocks (or creates) a pantry row for a purchased item — matched by `productId` when known,
 *  otherwise by name (case-insensitive, no fuzzy matching, same philosophy as
 *  `lib/products.ts`'s `matchProductByName`). Sums quantity into the existing row rather than
 *  overwriting it, per the product owner's explicit call ("sčítat množství"), and resets
 *  `addedAt`/`askedAt` so the check-in interval (`lib/pantry.ts`) restarts from a fresh restock. */
async function restockPantryItem(
  db: ReturnType<typeof getDb>,
  householdId: string,
  item: { productId: string | null; name: string; category: ItemCategory; quantity: number; unit: ItemUnit },
) {
  const existing = item.productId
    ? await db.query.pantryItems.findFirst({ where: and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.productId, item.productId)) })
    : await db.query.pantryItems.findFirst({
        where: and(eq(schema.pantryItems.householdId, householdId), ilike(schema.pantryItems.name, item.name.trim())),
      })

  if (existing) {
    await db
      .update(schema.pantryItems)
      .set({ quantity: existing.quantity + item.quantity, addedAt: new Date(), askedAt: null })
      .where(eq(schema.pantryItems.id, existing.id))
  } else {
    await db.insert(schema.pantryItems).values({
      householdId,
      productId: item.productId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
    })
  }
}

/** Turns a finished shopping trip into real purchase history — until now `purchases`/
 *  `purchase_items` were seeded once and never written to again (docs/01_CURRENT_STATE.md,
 *  "Purchase analytics"). Takes every done item on the list, groups it by preferred store (items
 *  with none share one purchase with no store — a real, valid case, not an error), and records one
 *  `purchases` row + its `purchase_items` per group. Also restocks the household's pantry
 *  (`lib/pantry.ts`) with each purchased item — per the product owner, every purchased item should
 *  land in the pantry. Removes the completed items from the active list, since the trip is over.
 *  Per docs/05_BUSINESS_RULES.md ("past purchases are historical facts... must not be rewritten"),
 *  this only ever creates new purchases, never edits one. */
export async function completePurchaseAction(listId: string): Promise<{ purchases: PurchaseRecord[] }> {
  const householdId = await requireHouseholdId()
  await assertOwnsList(householdId, listId)
  const db = getDb()

  const doneItems = await db.query.shoppingListItems.findMany({
    where: and(eq(schema.shoppingListItems.listId, listId), eq(schema.shoppingListItems.done, true)),
    with: { preferredStoreLocation: { with: { store: true } } },
  })
  if (doneItems.length === 0) return { purchases: [] }

  for (const item of doneItems) {
    await restockPantryItem(db, householdId, { productId: item.productId, name: item.name, category: item.category, quantity: item.quantity, unit: item.unit })
  }

  const groups = new Map<string, typeof doneItems>()
  for (const item of doneItems) {
    const key = item.preferredStoreLocationId ?? 'none'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  const created: PurchaseRecord[] = []
  for (const items of groups.values()) {
    const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    const [purchaseRow] = await db
      .insert(schema.purchases)
      .values({ householdId, storeLocationId: items[0].preferredStoreLocationId, date: TODAY, total: total.toString() })
      .returning()
    const itemRows = await db
      .insert(schema.purchaseItems)
      .values(
        items.map((item) => ({
          purchaseId: purchaseRow.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
        })),
      )
      .returning()

    created.push({
      id: purchaseRow.id,
      date: purchaseRow.date,
      store: items[0].preferredStoreLocation?.store.chain,
      total: Number(purchaseRow.total),
      discount: purchaseRow.discount != null ? Number(purchaseRow.discount) : undefined,
      items: itemRows.map((row) => ({ name: row.name, quantity: row.quantity, unit: row.unit, price: Number(row.price) })),
    })
  }

  await db.delete(schema.shoppingListItems).where(
    inArray(
      schema.shoppingListItems.id,
      doneItems.map((item) => item.id),
    ),
  )

  revalidatePath('/')
  return { purchases: created }
}
