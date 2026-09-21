'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { PurchaseRecord } from '@/lib/types'

async function assertOwnsList(householdId: string, listId: string) {
  const db = getDb()
  const list = await db.query.shoppingLists.findFirst({ where: eq(schema.shoppingLists.id, listId) })
  if (!list || list.householdId !== householdId) throw new Error('Shopping list not found')
}

/** Turns a finished shopping trip into real purchase history — until now `purchases`/
 *  `purchase_items` were seeded once and never written to again (docs/01_CURRENT_STATE.md,
 *  "Purchase analytics"). Takes every done item on the list, groups it by preferred store (items
 *  with none share one purchase with no store — a real, valid case, not an error), and records one
 *  `purchases` row + its `purchase_items` per group. Removes the completed items from the active
 *  list, since the trip is over. Per docs/05_BUSINESS_RULES.md ("past purchases are historical
 *  facts... must not be rewritten"), this only ever creates new purchases, never edits one. */
export async function completePurchaseAction(listId: string): Promise<{ purchases: PurchaseRecord[] }> {
  const householdId = await requireHouseholdId()
  await assertOwnsList(householdId, listId)
  const db = getDb()

  const doneItems = await db.query.shoppingListItems.findMany({
    where: and(eq(schema.shoppingListItems.listId, listId), eq(schema.shoppingListItems.done, true)),
    with: { preferredStoreLocation: { with: { store: true } } },
  })
  if (doneItems.length === 0) return { purchases: [] }

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
