'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { Item } from '@/lib/types'

async function assertOwnsList(householdId: string, listId: string) {
  const db = getDb()
  const list = await db.query.shoppingLists.findFirst({ where: eq(schema.shoppingLists.id, listId) })
  if (!list || list.householdId !== householdId) throw new Error('Shopping list not found')
}

async function assertOwnsItem(householdId: string, itemId: string) {
  const db = getDb()
  const item = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, itemId), with: { list: true } })
  if (!item || item.list.householdId !== householdId) throw new Error('Shopping list item not found')
}

export async function addShoppingItemAction(
  listId: string,
  name: string,
  overrides: Partial<Pick<Item, 'detail' | 'category'>> = {},
): Promise<Item> {
  const householdId = await requireHouseholdId()
  await assertOwnsList(householdId, listId)
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
  const householdId = await requireHouseholdId()
  await assertOwnsItem(householdId, itemId)
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
  const householdId = await requireHouseholdId()
  await assertOwnsItem(householdId, itemId)
  const db = getDb()
  await db.update(schema.shoppingListItems).set({ done }).where(eq(schema.shoppingListItems.id, itemId))
  revalidatePath('/')
}

export async function removeShoppingItemAction(itemId: string) {
  const householdId = await requireHouseholdId()
  await assertOwnsItem(householdId, itemId)
  const db = getDb()
  await db.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, itemId))
  revalidatePath('/')
}

export async function addShoppingListAction(name: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  await db.insert(schema.shoppingLists).values({ householdId, name })
  revalidatePath('/')
}
