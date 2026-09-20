'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { Item } from '@/lib/types'

export async function addShoppingItemAction(
  listId: string,
  name: string,
  overrides: Partial<Pick<Item, 'detail' | 'category'>> = {},
): Promise<Item> {
  const db = getDb()
  const [row] = await db
    .insert(schema.shoppingListItems)
    .values({ listId, name, detail: overrides.detail ?? '1 ks · bez detailu', ...(overrides.category && { category: overrides.category }) })
    .returning()
  revalidatePath('/')
  return {
    id: row.id,
    name: row.name,
    detail: row.detail,
    price: Number(row.price),
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    done: row.done,
    color: 'bg-emerald-100 text-emerald-700',
    priority: row.priority,
    note: row.note ?? undefined,
    onSale: row.onSale,
  }
}

export async function updateShoppingItemAction(
  itemId: string,
  changes: Partial<Pick<Item, 'quantity' | 'price' | 'unit' | 'category' | 'priority' | 'note' | 'onSale' | 'store'>>,
) {
  const db = getDb()
  let preferredStoreLocationId: string | null | undefined
  if (changes.store !== undefined) {
    if (changes.store) {
      const store = await db.query.stores.findFirst({ where: eq(schema.stores.chain, changes.store as (typeof schema.storeChainEnum.enumValues)[number]) })
      const location = store ? await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.storeId, store.id) }) : null
      preferredStoreLocationId = location?.id ?? null
    } else {
      preferredStoreLocationId = null
    }
  }
  await db
    .update(schema.shoppingListItems)
    .set({
      ...(changes.quantity != null && { quantity: changes.quantity }),
      ...(changes.price != null && { price: changes.price.toString() }),
      ...(changes.unit != null && { unit: changes.unit }),
      ...(changes.category != null && { category: changes.category }),
      ...(changes.priority != null && { priority: changes.priority }),
      ...(changes.note !== undefined && { note: changes.note || null }),
      ...(changes.onSale != null && { onSale: changes.onSale }),
      ...(preferredStoreLocationId !== undefined && { preferredStoreLocationId }),
    })
    .where(eq(schema.shoppingListItems.id, itemId))
  revalidatePath('/')
}

export async function toggleShoppingItemAction(itemId: string, done: boolean) {
  const db = getDb()
  await db.update(schema.shoppingListItems).set({ done }).where(eq(schema.shoppingListItems.id, itemId))
  revalidatePath('/')
}

export async function removeShoppingItemAction(itemId: string) {
  const db = getDb()
  await db.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, itemId))
  revalidatePath('/')
}

export async function addShoppingListAction(householdId: string, name: string) {
  const db = getDb()
  await db.insert(schema.shoppingLists).values({ householdId, name })
  revalidatePath('/')
}
