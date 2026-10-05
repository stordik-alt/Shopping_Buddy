'use server'

import { eq } from 'drizzle-orm'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { todayInPrague } from '@/lib/today'
import { getDb } from '@/lib/db/client'
import { getProductPrices } from '@/lib/db/queries'
import { getProductCatalogCached } from '@/lib/db/cached-reads'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import { createHouseholdNotification } from '@/lib/notify'
import { assessDealQuality, effectivePrice } from '@/lib/prices'
import { matchProductByName } from '@/lib/products'
import { validProductTypeKeys } from '@/lib/product-types'
import type { Item, Notification } from '@/lib/types'

// No revalidatePath in this file: each of these saves is already shown by components/app-shell.tsx from its
// own state or from the data the action returns. Re-rendering the whole page after every save re-ran
// every household query and re-sent the result (Neon network transfer) and, at worst, reset the view.

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toItem(row: typeof schema.shoppingListItems.$inferSelect): Item {
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
    productTypes: row.productTypes ?? null,
  }
}

/** Adds an item to a list. `clientId` (a UUID the device made up) becomes the item's primary key, which
 *  makes the add idempotent: an add whose answer never reached the phone (a reload or a dropped
 *  connection while it was in flight) is replayed from the offline queue, and the second insert finds
 *  the row already there and returns it instead of adding a duplicate. */
export async function addShoppingItemAction(
  listId: string,
  name: string,
  overrides: Partial<Pick<Item, 'detail' | 'category' | 'unit' | 'quantity'>> = {},
  clientId?: string,
): Promise<{ item: Item; notification: Notification | null }> {
  const { householdId, userId } = await requireHousehold()
  await assertOwnsList(householdId, listId)
  if (clientId !== undefined && (typeof clientId !== 'string' || !UUID_PATTERN.test(clientId))) throw new Error('Neplatný identifikátor položky.')
  const quantity = overrides.quantity ?? 1
  if (!(Number.isFinite(quantity) && quantity > 0 && quantity < 10_000_000)) throw new Error('Množství musí být kladné číslo.')
  const db = getDb()

  if (clientId) {
    const existing = await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, clientId) })
    // Never hand back (or overwrite) a row of another list, whoever picked the id.
    if (existing && existing.listId !== listId) throw new Error('Neplatný identifikátor položky.')
    if (existing) return { item: toItem(existing), notification: null }
  }

  // Per CLAUDE.md ("do not treat product names as sufficient identifiers"): resolve the typed
  // free-text name to a real catalog product, case/whitespace-insensitively, and store the real
  // productId link (shoppingListItems.productId existed in the schema but was never populated —
  // every consumer instead matched on the raw name string). Falls back to the typed name verbatim
  // when nothing matches, same as before.
  // Only the candidates for this one name, not the whole ~47,000-product catalog.
  const catalog = await getProductCatalogCached([name])
  const matchedProduct = matchProductByName(catalog, name)
  const canonicalName = matchedProduct?.name ?? name

  const [inserted] = await db
    .insert(schema.shoppingListItems)
    .values({
      ...(clientId && { id: clientId }),
      listId,
      name,
      productId: matchedProduct?.id,
      detail: overrides.detail ?? '1 ks · bez detailu',
      quantity: Math.round(quantity * 1000) / 1000,
      // An explicit override wins; otherwise fall back to the matched product's real category
      // rather than the schema default ('Ostatní') — found missing while testing pantry-location
      // inference, which needs the item actually categorized 'Potraviny' to ever route it to
      // Lednice/Mrazák instead of defaulting everything typed via quick-add to Spíž.
      category: overrides.category ?? matchedProduct?.category,
      // Same reasoning for unit: without this, every quick-added item defaults to the schema's
      // 'ks', even for a catalog product remembered in a different unit (e.g. "Mléko polotučné" in
      // 'l') — which then makes any Kč/l-style unit-price comparison for that item meaningless. An
      // explicit override wins over the catalog's general default, for a caller that knows more
      // specifically what unit this particular item needs than the product's own remembered default.
      unit: overrides.unit ?? matchedProduct?.defaultUnit,
    })
    .onConflictDoNothing()
    .returning()
  // Lost a race with an identical replay that inserted between the check above and this insert.
  const row = inserted ?? (await db.query.shoppingListItems.findFirst({ where: eq(schema.shoppingListItems.id, clientId!) }))
  if (!row) throw new Error('Položku se nepodařilo přidat.')
  if (row.listId !== listId) throw new Error('Neplatný identifikátor položky.')
  if (!inserted) return { item: toItem(row), notification: null }

  // Per docs/04_ROADMAP.md Phase D "price/deal alerts": if the product just added to the list has
  // a currently active deal that is genuinely the best price across known stores (not just a
  // discount off its own regular price — see assessDealQuality), let the household know. Matches
  // on the resolved canonical catalog name, not the raw typed one, so casing/whitespace
  // differences no longer silently miss a real deal.
  let notification: Notification | null = null
  // Only this product: whether its deal is the best price is decided across its own stores.
  const productPrices = await getProductPrices({ names: [canonicalName], runningDeals: false })
  const bestDeal = assessDealQuality(productPrices, todayInPrague()).find((assessment) => assessment.product.productName === canonicalName && assessment.isBestPrice)
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
  }

  return {
    item: toItem(row),
    notification,
  }
}

export async function updateShoppingItemAction(
  itemId: string,
  changes: Partial<Pick<Item, 'quantity' | 'price' | 'unit' | 'category' | 'priority' | 'note' | 'onSale' | 'store' | 'productTypes'>>,
) {
  const householdId = await requireHouseholdId()
  await assertOwnsItem(householdId, itemId)
  // Product types come from the browser: only known type keys, at least one, no duplicates; null
  // returns the item to "derived from its name".
  let productTypes: string[] | null | undefined
  if (changes.productTypes !== undefined) {
    productTypes = changes.productTypes === null ? null : validProductTypeKeys(changes.productTypes)
    if (productTypes === undefined) throw new Error('Neplatný druh zboží.')
  }
  // The list's field saves only valid numbers, but the server decides (CLAUDE.md section 9): a
  // quantity is positive ("0,5 kg" is fine) and a price not negative, within what the numeric columns
  // hold (10, 3 and 10, 2), rounded to their scale.
  if (changes.quantity != null && !(Number.isFinite(changes.quantity) && changes.quantity > 0 && changes.quantity < 10_000_000)) {
    throw new Error('Množství musí být kladné číslo.')
  }
  if (changes.price != null && !(Number.isFinite(changes.price) && changes.price >= 0 && changes.price < 100_000_000)) {
    throw new Error('Cena musí být nezáporné číslo.')
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
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

export async function toggleShoppingItemAction(itemId: string, done: boolean) {
  const householdId = await requireHouseholdId()
  await assertOwnsItem(householdId, itemId)
  const db = getDb()
  await db.update(schema.shoppingListItems).set({ done }).where(eq(schema.shoppingListItems.id, itemId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

export async function removeShoppingItemAction(itemId: string) {
  const householdId = await requireHouseholdId()
  await assertOwnsItem(householdId, itemId)
  const db = getDb()
  await db.delete(schema.shoppingListItems).where(eq(schema.shoppingListItems.id, itemId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

export async function addShoppingListAction(name: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  await db.insert(schema.shoppingLists).values({ householdId, name })
}
