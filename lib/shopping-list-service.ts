import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { getProductPrices, getStandaloneOffers } from '@/lib/db/queries'
import { getProductCatalogCached } from '@/lib/db/cached-reads'
import * as schema from '@/lib/db/schema'
import { checkItemChoices, checkOptionalText, checkRequiredText, ITEM_DETAIL_MAX, ITEM_NAME_MAX, ITEM_NOTE_MAX, ShoppingInputError } from '@/lib/shopping-input'
import { todayInPrague } from '@/lib/today'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import { offerBeatsKnownPrices, shortOfferDate } from '@/lib/offers'
import { assessDealQuality, effectivePrice } from '@/lib/prices'
import { guessItemCategory } from '@/lib/categorization'
import { matchProductByName } from '@/lib/products'
import { validProductTypeKeys } from '@/lib/product-types'
import { ITEM_UNITS } from '@/lib/units'
import type { Item, ItemUnit, Notification } from '@/lib/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ShoppingResourceNotFoundError extends Error {}

async function assertOwnsList(householdId: string, listId: string) {
  const list = await getDb().query.shoppingLists.findFirst({ where: eq(schema.shoppingLists.id, listId) })
  if (!list || list.householdId !== householdId) throw new ShoppingResourceNotFoundError('Shopping list not found')
}

/** Removes only checked rows from the specified household shopping list. Checking an item is a
 *  reminder action; clearing it must not create a purchase, expense, or pantry stock. Shared by the
 *  PWA action and the authenticated mobile API. */
export async function clearDoneShoppingItemsForHousehold(householdId: string, listId: string): Promise<{ removed: number }> {
  await assertOwnsList(householdId, listId)
  const removed = await getDb()
    .delete(schema.shoppingListItems)
    .where(and(eq(schema.shoppingListItems.listId, listId), eq(schema.shoppingListItems.done, true)))
    .returning({ id: schema.shoppingListItems.id })
  return { removed: removed.length }
}

async function assertOwnsItem(householdId: string, itemId: string) {
  const item = await getDb().query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, itemId), with: { list: true } })
  if (!item || item.list.householdId !== householdId) throw new ShoppingResourceNotFoundError('Shopping list item not found')
}

function toItem(row: typeof schema.shoppingListItems.$inferSelect): Item {
  return {
    id: row.id,
    productId: row.productId,
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
    productTypes: row.productTypes ?? null,
  }
}

export async function addShoppingItemForHousehold(
  householdId: string,
  userId: string,
  listId: string,
  name: string,
  overrides: Partial<Pick<Item, 'detail' | 'category' | 'unit' | 'quantity'>> = {},
  clientId?: string,
  selection?: { kind: 'product'; productId: string } | { kind: 'type'; productTypeKey: string },
): Promise<{ item: Item; notification: Notification | null }> {
  await assertOwnsList(householdId, listId)
  if (clientId !== undefined && (typeof clientId !== 'string' || !UUID_PATTERN.test(clientId))) throw new ShoppingInputError('Neplatný identifikátor položky.')
  checkRequiredText(name, 'Název položky', ITEM_NAME_MAX)
  checkOptionalText(overrides.detail, 'Detail položky', ITEM_DETAIL_MAX)
  checkItemChoices({ unit: overrides.unit, category: overrides.category })
  const quantity = overrides.quantity ?? 1
  if (!(Number.isFinite(quantity) && quantity > 0 && quantity < 10_000_000)) throw new ShoppingInputError('Množství musí být kladné číslo.')
  const db = getDb()

  let selectedProductId: string | null = null
  let selectedProductTypeKey: string | null = null
  if (selection?.kind === 'product') {
    const selected = await db.query.products.findFirst({ where: eq(schema.products.id, selection.productId), columns: { id: true, name: true } })
    if (!selected) throw new ShoppingInputError('Neplatný produkt.')
    selectedProductId = selected.id
  } else if (selection?.kind === 'type') {
    if (!validProductTypeKeys([selection.productTypeKey])) throw new ShoppingInputError('Neplatný druh zboží.')
    selectedProductTypeKey = selection.productTypeKey
  }

  if (clientId !== undefined) {
    const existing = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, clientId) })
    if (existing && existing.listId !== listId) throw new ShoppingInputError('Neplatný identifikátor položky.')
    if (existing) return { item: toItem(existing), notification: null }
  }

  const catalog = await getProductCatalogCached([name])
  const cachedMatch = matchProductByName(catalog, name)
  const matchedProduct =
    cachedMatch && (await db.query.products.findFirst({ where: eq(schema.products.id, cachedMatch.id), columns: { id: true } })) ? cachedMatch : null
  const canonicalName = matchedProduct?.name ?? name
  const resolvedProductId = selection?.kind === 'type' ? null : selectedProductId ?? matchedProduct?.id

  const [inserted] = await db
    .insert(schema.shoppingListItems)
    .values({
      ...(clientId && { id: clientId }),
      listId,
      name,
      productId: resolvedProductId ?? undefined,
      productTypes: selectedProductTypeKey ? [selectedProductTypeKey] : undefined,
      detail: overrides.detail ?? '1 ks · bez detailu',
      quantity: Math.round(quantity * 1000) / 1000,
      category: overrides.category ?? matchedProduct?.category ?? guessItemCategory(name) ?? undefined,
      unit: overrides.unit ?? matchedProduct?.defaultUnit,
    })
    .onConflictDoNothing()
    .returning()
  const row = inserted ?? (clientId ? await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, clientId) }) : null)
  if (!row) throw new Error('Položku se nepodařilo přidat.')
  if (row.listId !== listId) throw new ShoppingInputError('Neplatný identifikátor položky.')
  if (!inserted) return { item: toItem(row), notification: null }

  const today = todayInPrague()
  const productPrices = await getProductPrices({ names: [canonicalName], runningDeals: false })
  const bestDeal = assessDealQuality(productPrices, today).find((assessment) => assessment.product.productName === canonicalName && assessment.isBestPrice)
  let notification: Notification | null = null
  if (bestDeal) {
    const notificationRow = await createHouseholdNotification(
      db,
      householdId,
      {
        title: 'Skvělá cena na vašem seznamu',
        detail: `${name} je nyní v akci v ${bestDeal.price.store} za ${money(effectivePrice(bestDeal.price))} — nejlepší cena mezi obchody.`,
      },
      { kind: 'deal_on_list', tab: 'Nákup', excludeUserId: userId },
    )
    notification = { id: notificationRow.id, title: notificationRow.title, detail: notificationRow.detail, unread: notificationRow.unread, kind: notificationRow.kind }
  } else {
    const [offer] = await getStandaloneOffers(today, [canonicalName])
    if (offer && offerBeatsKnownPrices(offer, productPrices)) {
      const notificationRow = await createHouseholdNotification(
        db,
        householdId,
        {
          title: 'Akce na vaší položce',
          detail: `${name} je nyní v akci v ${offer.store} za ${money(offer.dealPrice)}, akce do ${shortOfferDate(offer.validUntil)}.`,
        },
        { kind: 'deal_on_list', tab: 'Nákup', excludeUserId: userId },
      )
      notification = { id: notificationRow.id, title: notificationRow.title, detail: notificationRow.detail, unread: notificationRow.unread, kind: notificationRow.kind }
    }
  }

  return { item: toItem(row), notification }
}

export type ShoppingItemChanges = Partial<Pick<Item, 'quantity' | 'price' | 'unit' | 'category' | 'priority' | 'note' | 'onSale' | 'store' | 'productTypes'>>

export async function updateShoppingItemForHousehold(householdId: string, itemId: string, changes: ShoppingItemChanges) {
  await assertOwnsItem(householdId, itemId)
  checkOptionalText(changes.note, 'Poznámka', ITEM_NOTE_MAX)
  checkItemChoices(changes)
  let productTypes: string[] | null | undefined
  if (changes.productTypes !== undefined) {
    productTypes = changes.productTypes === null ? null : validProductTypeKeys(changes.productTypes)
    if (productTypes === undefined) throw new ShoppingInputError('Neplatný druh zboží.')
  }
  if (changes.quantity != null && !(Number.isFinite(changes.quantity) && changes.quantity > 0 && changes.quantity < 10_000_000)) {
    throw new ShoppingInputError('Množství musí být kladné číslo.')
  }
  if (changes.price != null && !(Number.isFinite(changes.price) && changes.price >= 0 && changes.price < 100_000_000)) {
    throw new ShoppingInputError('Cena musí být nezáporné číslo.')
  }
  const db = getDb()
  let preferredStoreLocationId: string | null | undefined
  if (changes.store !== undefined) {
    if (changes.store) {
      const store = await db.query.stores.findFirst({ where: eq(schema.stores.chain, changes.store) })
      const location = store ? await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.storeId, store.id) }) : null
      preferredStoreLocationId = location?.id ?? null
    } else {
      preferredStoreLocationId = null
    }
  }
  await db
    .update(schema.shoppingListItems)
    .set({
      ...(changes.quantity != null && { quantity: Math.round(changes.quantity * 1000) / 1000 }),
      ...(changes.price != null && { price: (Math.round(changes.price * 100) / 100).toString() }),
      ...(changes.unit != null && { unit: changes.unit }),
      ...(changes.category != null && { category: changes.category }),
      ...(changes.priority != null && { priority: changes.priority }),
      ...(changes.note !== undefined && { note: changes.note || null }),
      ...(changes.onSale != null && { onSale: changes.onSale }),
      ...(productTypes !== undefined && { productTypes }),
      ...(preferredStoreLocationId !== undefined && { preferredStoreLocationId }),
    })
    .where(eq(schema.shoppingListItems.id, itemId))
}

export async function toggleShoppingItemForHousehold(householdId: string, itemId: string, done: boolean) {
  await assertOwnsItem(householdId, itemId)
  await getDb().update(schema.shoppingListItems).set({ done }).where(eq(schema.shoppingListItems.id, itemId))
}

export function isShoppingItemUnit(value: unknown): value is ItemUnit {
  return (ITEM_UNITS as readonly unknown[]).includes(value)
}
