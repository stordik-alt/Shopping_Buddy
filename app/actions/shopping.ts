'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import { getProductCatalog, getProductPrices } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import { assessDealQuality, effectivePrice } from '@/lib/prices'
import { matchProductByName } from '@/lib/products'
import type { Item, Notification } from '@/lib/types'

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
): Promise<{ item: Item; notification: Notification | null }> {
  const householdId = await requireHouseholdId()
  await assertOwnsList(householdId, listId)
  const db = getDb()

  // Per CLAUDE.md ("do not treat product names as sufficient identifiers"): resolve the typed
  // free-text name to a real catalog product, case/whitespace-insensitively, and store the real
  // productId link (shoppingListItems.productId existed in the schema but was never populated —
  // every consumer instead matched on the raw name string). Falls back to the typed name verbatim
  // when nothing matches, same as before.
  const catalog = await getProductCatalog()
  const matchedProduct = matchProductByName(catalog, name)
  const canonicalName = matchedProduct?.name ?? name

  const [row] = await db
    .insert(schema.shoppingListItems)
    .values({
      listId,
      name,
      productId: matchedProduct?.id,
      detail: overrides.detail ?? '1 ks · bez detailu',
      ...(overrides.category && { category: overrides.category }),
    })
    .returning()

  // Per docs/04_ROADMAP.md Phase D "price/deal alerts": if the product just added to the list has
  // a currently active deal that is genuinely the best price across known stores (not just a
  // discount off its own regular price — see assessDealQuality), let the household know. Matches
  // on the resolved canonical catalog name, not the raw typed one, so casing/whitespace
  // differences no longer silently miss a real deal.
  let notification: Notification | null = null
  const productPrices = await getProductPrices()
  const bestDeal = assessDealQuality(productPrices, TODAY).find((assessment) => assessment.product.productName === canonicalName && assessment.isBestPrice)
  if (bestDeal) {
    const [notificationRow] = await db
      .insert(schema.notifications)
      .values({
        householdId,
        title: 'Skvělá cena na vašem seznamu',
        detail: `${name} je nyní v akci v ${bestDeal.price.store} za ${money(effectivePrice(bestDeal.price))} — nejlepší cena mezi obchody.`,
      })
      .returning()
    notification = { id: notificationRow.id, title: notificationRow.title, detail: notificationRow.detail, unread: notificationRow.unread }
  }

  revalidatePath('/')
  return {
    item: {
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
    },
    notification,
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
