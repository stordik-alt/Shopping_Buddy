'use server'

import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import { invalidateProductCatalogCache } from '@/lib/db/cache-invalidation'
import { getPantryItems, restockPantryItem, upsertProductCatalogDefaults } from '@/lib/db/queries'
import { getProductCatalogCached, getSubcategoryCatalogCached } from '@/lib/db/cached-reads'
import * as schema from '@/lib/db/schema'
import type { CatalogChangeOutcome, CategoryChangeOutcome } from '@/lib/product-subcategory-changes'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import { checkLocationRemoval, type PantryQuantityChange } from '@/lib/pantry'
import { ITEM_UNITS } from '@/lib/units'
import { getRestockDismissals, getStockLevels } from '@/lib/db/restock'
import { productTypeByKey } from '@/lib/product-types'
import { validateStockLevels, type StockLevel } from '@/lib/pantry-restock'
import { autoCategorizePantryForHousehold, updatePantryItemForHousehold } from '@/lib/pantry-mobile-mutations'
import { CHECKIN_DAYS_BY_CATEGORY, checkinSubcategoryKey, customPlaceIdFromKey, inferPantryLocation, PANTRY_AREAS, PANTRY_LOCATIONS, PANTRY_TRACKING } from '@/lib/pantry'
import { reviewPantryForHousehold } from '@/lib/pantry-review'
import { matchProductByName } from '@/lib/products'
import type { ItemCategory, ItemUnit, PantryArea, PantryItem, PantryLocation, PantryTracking } from '@/lib/types'

// No revalidatePath in this file: each of these saves is already shown by components/app-shell.tsx from its
// own state or from the data the action returns. Re-rendering the whole page after every save re-ran
// every household query and re-sent the result (Neon network transfer) and, at worst, reset the view.

async function assertOwnsPantryItem(householdId: string, pantryItemId: string) {
  const db = getDb()
  const item = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, pantryItemId) })
  if (!item || item.householdId !== householdId) throw new Error('Pantry item not found')
}

/** Adds stock directly to Zásoby without creating a purchase or budget expense.
 * This is for things the household obtained without spending money — e.g. a gift, meat from
 * someone, or eggs/vegetables from the household's own production. A known catalog product keeps
 * its canonical category/subcategory; an unknown product requires the caller to provide a category.
 *
 * The existing pantry row is restocked/merged using the same quantity semantics as a real purchase.
 * No purchase, purchase_item or expense row is ever written by this action. */
export async function addPantryItemAction(input: {
  name: string
  quantity: number
  unit: ItemUnit
  category?: ItemCategory
  subcategory?: string | null
  placeKey?: string | null
  selection?: { kind: 'product'; productId: string } | { kind: 'type'; productTypeKey: string }
}): Promise<PantryItem[]> {
  const householdId = await requireHouseholdId()
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!name) throw new Error('Zadejte název položky.')
  if (name.length > 200) throw new Error('Název položky je příliš dlouhý.')

  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) throw new Error('Množství musí být větší než 0.')
  if (!(PANTRY_UNITS as string[]).includes(input.unit)) throw new Error('Neplatná jednotka.')
  if (input.category != null && !(PANTRY_ITEM_CATEGORIES as string[]).includes(input.category)) throw new Error('Neplatná kategorie.')

  const catalog = await getProductCatalogCached([name])
  const product = matchProductByName(catalog, name)
  if (product?.isNonInventory) throw new Error('Tento produkt nelze přidat do zásob.')

  let selectedProductId: string | null = null
  let selectedProductTypeId: string | null = null
  if (input.selection?.kind === 'product') {
    const selected = await getDb().query.products.findFirst({
      where: eq(schema.products.id, input.selection.productId),
      columns: { id: true, isNonInventory: true, categoryId: true, subcategoryId: true, productTypeId: true, name: true, defaultLocation: true },
    })
    if (!selected) throw new Error('Neplatný produkt.')
    if (selected.isNonInventory) throw new Error('Tento produkt nelze přidat do zásob.')
    selectedProductId = selected.id
    selectedProductTypeId = selected.productTypeId ?? null
  } else if (input.selection?.kind === 'type') {
    const type = await getDb().query.productTypes.findFirst({
      where: eq(schema.productTypes.key, input.selection.productTypeKey),
      columns: { id: true, category: true, unit: true, name: true },
    })
    if (!type) throw new Error('Neplatný druh zboží.')
    selectedProductTypeId = type.id
  }

  // A category selected during manual pantry entry is authoritative for this entry.
  // Catalog classification is only the fallback when the caller did not provide one.
  const category = input.category ?? product?.category
  if (!category) throw new Error('U nové položky vyberte kategorii.')

  const requestedSubcategory = input.subcategory ?? null
  if (requestedSubcategory !== null && !subcategoriesOfItem(category).includes(requestedSubcategory)) {
    throw new Error('Neplatná podkategorie.')
  }

  const placeKey = typeof input.placeKey === 'string' && input.placeKey.trim() ? input.placeKey.trim() : null
  let location = product?.defaultLocation ?? inferPantryLocation(category, name) ?? 'Spíž'
  let customPlaceId: string | null = null
  if (placeKey) {
    customPlaceId = customPlaceIdFromKey(placeKey)
    if (customPlaceId) {
      const db = getDb()
      const place = await db.query.pantryPlaces.findFirst({ where: eq(schema.pantryPlaces.id, customPlaceId) })
      if (!place || place.householdId !== householdId) throw new Error('Vlastní místo nenalezeno.')
    } else {
      if (!(PANTRY_LOCATIONS as string[]).includes(placeKey)) throw new Error('Neplatné umístění.')
      location = placeKey as typeof PANTRY_LOCATIONS[number]
    }
  }

  let subcategoryId: string | null = null
  const selectedSubcategory = requestedSubcategory ?? (input.category ? null : product?.subcategory ?? null)
  if (selectedSubcategory) {
    const subcategories = await getSubcategoryCatalogCached()
    subcategoryId = subcategories.find((row) => row.category === category && row.name === selectedSubcategory)?.id ?? null
    if (!subcategoryId) throw new Error('Neplatná podkategorie.')
  }

  await restockPantryItem(householdId, {
    productId: selectedProductId ?? (input.selection ? null : product?.id ?? null),
    productTypeId: selectedProductTypeId,
    name,
    category,
    quantity,
    unit: input.unit,
    location,
    customPlaceId,
    subcategoryId,
  })

  return getPantryItems(householdId)
}

const PANTRY_ITEM_CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const PANTRY_UNITS: ItemUnit[] = ITEM_UNITS

/** "Ještě mám" — confirms the household still has this pantry item. Resets addedAt to now and
 *  clears askedAt, so the check-in interval (lib/pantry.ts) restarts from a fresh confirmation
 *  rather than immediately asking again. */
export async function confirmPantryItemAction(pantryItemId: string) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  const db = getDb()
  await db.update(schema.pantryItems).set({ addedAt: new Date(), askedAt: null }).where(eq(schema.pantryItems.id, pantryItemId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

/** Reassigns which place an item lives in — e.g. moving freshly bought chilled meat into the
 *  freezer for later use, or into one of the household's own custom places (lib/pantry.ts's
 *  `PantryPlaceOption.key`: a fixed `PantryLocation` name, or `custom:<pantry_places.id>`).
 *  General-purpose (any place to any other), which also covers the specific "lednice → mrazák" case
 *  without a separate action for it. */
export async function movePantryItemAction(pantryItemId: string, placeKey: string) {
  const householdId = await requireHouseholdId()
  await updatePantryItemForHousehold(householdId, pantryItemId, { placeKey })
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

const MAX_PLACE_NAME_LENGTH = 60

/** Adds one of the household's own storage places (spec: "Uživatel musí mít možnost vytvořit vlastní
 *  místo"), e.g. "Kufr auta" under the Auto area. Rejects a duplicate name within the same area (the
 *  database's own unique index is the actual guarantee; this just gives a friendly message instead
 *  of a generic constraint-violation error). */
export async function addPantryPlaceAction(area: PantryArea, name: string): Promise<{ id: string; area: PantryArea; name: string }> {
  const householdId = await requireHouseholdId()
  if (!(PANTRY_AREAS as string[]).includes(area)) throw new Error('Neplatná oblast.')
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('Zadejte název místa.')
  if (trimmed.length > MAX_PLACE_NAME_LENGTH) throw new Error('Název místa je příliš dlouhý.')
  const db = getDb()
  const existing = await db.query.pantryPlaces.findFirst({ where: and(eq(schema.pantryPlaces.householdId, householdId), eq(schema.pantryPlaces.area, area), eq(schema.pantryPlaces.name, trimmed)) })
  if (existing) throw new Error('Toto místo už v dané oblasti existuje.')
  const [place] = await db.insert(schema.pantryPlaces).values({ householdId, area, name: trimmed }).returning()
  return { id: place.id, area: place.area, name: place.name }
}

/** Sets (or, with `days: null`, clears back to the fixed default) how many days a pantry item of
 *  `category` can go unconfirmed before the weekly check-in asks about it (spec section 13, Profil
 *  domácnosti → Zásoby). Returns every category's override, same shape as `setCategoryBudgetAction`. */
export async function setPantryCheckinDaysAction(category: ItemCategory, days: number | null): Promise<Partial<Record<ItemCategory, number>>> {
  const householdId = await requireHouseholdId()
  if (!(category in CHECKIN_DAYS_BY_CATEGORY)) throw new Error('Neznámá kategorie.')
  const db = getDb()
  if (days === null) {
    await db.delete(schema.pantryCheckinIntervals).where(and(eq(schema.pantryCheckinIntervals.householdId, householdId), eq(schema.pantryCheckinIntervals.category, category)))
  } else {
    if (!Number.isInteger(days) || days <= 0 || days > 365) throw new Error('Počet dní musí být celé číslo mezi 1 a 365.')
    await db
      .insert(schema.pantryCheckinIntervals)
      .values({ householdId, category, days })
      .onConflictDoUpdate({ target: [schema.pantryCheckinIntervals.householdId, schema.pantryCheckinIntervals.category], set: { days, updatedAt: new Date() } })
  }
  const rows = await db.query.pantryCheckinIntervals.findMany({ where: eq(schema.pantryCheckinIntervals.householdId, householdId) })
  return Object.fromEntries(rows.map((row) => [row.category, row.days]))
}

/** The same for one subcategory (Potraviny ▸ Pečivo …); `days: null` clears back to the built-in
 *  default (`CHECKIN_DAYS_BY_SUBCATEGORY`). Returns every subcategory override, keyed by
 *  `checkinSubcategoryKey`. */
export async function setPantrySubcategoryCheckinDaysAction(category: ItemCategory, subcategory: string, days: number | null): Promise<Record<string, number>> {
  const householdId = await requireHouseholdId()
  if (!(category in CHECKIN_DAYS_BY_CATEGORY)) throw new Error('Neznámá kategorie.')
  if (typeof subcategory !== 'string' || !(subcategoriesOfItem(category) as readonly string[]).includes(subcategory)) throw new Error('Neznámá podkategorie.')
  const db = getDb()
  if (days === null) {
    await db
      .delete(schema.pantryCheckinSubcategoryIntervals)
      .where(and(eq(schema.pantryCheckinSubcategoryIntervals.householdId, householdId), eq(schema.pantryCheckinSubcategoryIntervals.category, category), eq(schema.pantryCheckinSubcategoryIntervals.subcategory, subcategory)))
  } else {
    if (!Number.isInteger(days) || days <= 0 || days > 365) throw new Error('Počet dní musí být celé číslo mezi 1 a 365.')
    await db
      .insert(schema.pantryCheckinSubcategoryIntervals)
      .values({ householdId, category, subcategory, days })
      .onConflictDoUpdate({
        target: [schema.pantryCheckinSubcategoryIntervals.householdId, schema.pantryCheckinSubcategoryIntervals.category, schema.pantryCheckinSubcategoryIntervals.subcategory],
        set: { days, updatedAt: new Date() },
      })
  }
  const rows = await db.query.pantryCheckinSubcategoryIntervals.findMany({ where: eq(schema.pantryCheckinSubcategoryIntervals.householdId, householdId) })
  return Object.fromEntries(rows.map((row) => [checkinSubcategoryKey(row.category, row.subcategory), row.days]))
}

/** Removes one of the household's own storage places. Refuses while it still holds items — the
 *  household must move them first — rather than silently reassigning them to a fixed location that
 *  might not describe where they actually are (the same "don't guess" rule the rest of Zásoby
 *  already follows, e.g. `inferPantryLocation()`). */
export async function removePantryPlaceAction(placeId: string) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const place = await db.query.pantryPlaces.findFirst({ where: eq(schema.pantryPlaces.id, placeId) })
  if (!place || place.householdId !== householdId) throw new Error('Vlastní místo nenalezeno.')
  const [itemHere] = await db.select({ id: schema.pantryItems.id }).from(schema.pantryItems).where(eq(schema.pantryItems.customPlaceId, placeId)).limit(1)
  if (itemHere) throw new Error('Nejdřív přesuňte položky z tohoto místa jinam.')
  await db.delete(schema.pantryPlaces).where(eq(schema.pantryPlaces.id, placeId))
}

/** Removes a fixed location (Spíž, Lednice, ...) from the household's Zásoby so it can replace the
 *  defaults with its own places. Items still kept there are moved to `targetKey` first (a remaining
 *  fixed location or one of the household's own places), never dropped or guessed, so nothing that
 *  references the location is left dangling; `pantry_items.location` keeps its value for rows that
 *  moved to a custom place. Refused when it would leave no place at all (lib/pantry.ts
 *  `checkLocationRemoval`). */
export async function removePantryLocationAction(location: PantryLocation, targetKey?: string | null) {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const [hiddenRows, placeRows, itemRows] = await Promise.all([
    db.select({ location: schema.pantryHiddenLocations.location }).from(schema.pantryHiddenLocations).where(eq(schema.pantryHiddenLocations.householdId, householdId)),
    db.select({ id: schema.pantryPlaces.id, area: schema.pantryPlaces.area, name: schema.pantryPlaces.name }).from(schema.pantryPlaces).where(eq(schema.pantryPlaces.householdId, householdId)),
    db.select({ location: schema.pantryItems.location, customPlaceId: schema.pantryItems.customPlaceId }).from(schema.pantryItems).where(and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.location, location))),
  ])
  const check = checkLocationRemoval({ location, hiddenLocations: hiddenRows.map((row) => row.location), customPlaces: placeRows, items: itemRows, targetKey })
  if ('error' in check) throw new Error(check.error)
  if (check.itemCount > 0 && targetKey) {
    const customPlaceId = customPlaceIdFromKey(targetKey)
    const here = and(eq(schema.pantryItems.householdId, householdId), eq(schema.pantryItems.location, location), isNull(schema.pantryItems.customPlaceId))
    await db
      .update(schema.pantryItems)
      .set(customPlaceId ? { customPlaceId } : { location: targetKey as PantryLocation })
      .where(here)
  }
  await db.insert(schema.pantryHiddenLocations).values({ householdId, location }).onConflictDoNothing()
}

/** Brings a removed fixed location back. */
export async function restorePantryLocationAction(location: PantryLocation) {
  const householdId = await requireHouseholdId()
  if (!(PANTRY_LOCATIONS as string[]).includes(location)) throw new Error('Neplatné umístění.')
  const db = getDb()
  await db.delete(schema.pantryHiddenLocations).where(and(eq(schema.pantryHiddenLocations.householdId, householdId), eq(schema.pantryHiddenLocations.location, location)))
}

/** Sets a pantry item's quantity to an exact value — covers both the "−/+" stepper and typing an
 *  exact amount (e.g. "1.5 kg") in the pantry UI. Takes the new absolute quantity, not a delta, so
 *  the client and server always agree on the result regardless of network timing. Never negative
 *  (the household ran out, not into debt) — 0 is a valid, meaningful result ("do šlo") and the row
 *  stays in the pantry at 0 rather than being deleted; deleting it entirely is `removePantryItemAction`,
 *  a separate, explicit choice. Never touches `purchase_items` — purchase history is a record of
 *  what was bought, not of what's currently on hand, and must never be rewritten by a stock edit.
 *  `expectedQuantity` is an optional compare-and-set: the write only goes through when the stored
 *  amount still is the one the caller saw, so a request that was overtaken cannot overwrite a newer
 *  amount with an older one. */
export async function adjustPantryItemQuantityAction(pantryItemId: string, quantity: number, expectedQuantity?: number) {
  const householdId = await requireHouseholdId()
  await updatePantryItemForHousehold(householdId, pantryItemId, { quantity, expectedQuantity })
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

/** Adjusts one recorded concrete product within an aggregated product-type stock row and keeps its
 *  total in sync. The contents are read through their parent so an id from another household cannot
 *  be used to change stock. */
export async function adjustPantryItemContentQuantityAction(contentId: string, quantity: number, expectedQuantity?: number): Promise<number> {
  const householdId = await requireHouseholdId()
  const parsed = Number(quantity)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) throw new Error('Množství musí být číslo od nuly do 1 000 000.')
  const db = getDb('HYPERDRIVE_PANTRY_FRESH')
  const content = await db.query.pantryItemContents.findFirst({
    where: eq(schema.pantryItemContents.id, contentId),
    with: { pantryItem: { columns: { id: true, householdId: true } } },
  })
  if (!content || content.pantryItem.householdId !== householdId) throw new Error('Pantry item not found')
  if (expectedQuantity != null && content.quantity !== expectedQuantity) throw new Error('Zásoby mezitím upravil někdo jiný. Obnovte prosím přehled.')
  await db.update(schema.pantryItemContents).set({ quantity: parsed }).where(eq(schema.pantryItemContents.id, contentId))
  const totals = await db.select({ quantity: sql<number>`coalesce(sum(${schema.pantryItemContents.quantity}), 0)` })
    .from(schema.pantryItemContents)
    .where(eq(schema.pantryItemContents.pantryItemId, content.pantryItemId))
  const total = Number(totals[0]?.quantity ?? 0)
  await db.update(schema.pantryItems).set({ quantity: total, addedAt: new Date(), askedAt: null })
    .where(eq(schema.pantryItems.id, content.pantryItemId))
  return total
}

/** Saves a type correction to the stock row and its known concrete products, so the catalog uses it
 *  the next time one of those products appears on a receipt. */
export async function setPantryItemProductTypeAction(pantryItemId: string, productTypeKey: string | null): Promise<string | null> {
  const householdId = await requireHouseholdId()
  const result = await updatePantryItemForHousehold(householdId, pantryItemId, { productTypeKey })
  if (result && 'productTypeId' in result) return result.productTypeId
  return null
}

/** "Došlo" — the household no longer has this item, so it's removed from the pantry entirely
 *  (not marked "out" — there's nothing useful to keep once it's gone; buying it again creates a
 *  fresh pantry row via a receipt or manual purchase). */
export async function removePantryItemAction(pantryItemId: string) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  const db = getDb()
  await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

/** "Zkontrolovat zásoby" — saves a bulk check in one go: the items marked gone are removed, every
 *  other reviewed item is confirmed like "Ještě mám" (addedAt now, askedAt cleared), and an item whose
 *  remaining amount the household set ("had 4, 1 left") gets that quantity. All ids must belong to the
 *  caller's household and every quantity to an item that stays — one bad id or quantity rejects the
 *  whole check, nothing is written. All writes go in one batch, so a check is never saved half.
 *  Returns what was done so the client can report it. */
export async function reviewPantryAction(input: { reviewedIds: string[]; goneIds: string[]; quantities?: PantryQuantityChange[] }): Promise<{ removed: number; confirmed: number; adjusted: number }> {
  const householdId = await requireHouseholdId()
  return reviewPantryForHousehold({ householdId, ...input })
}

/** Sets (or clears, with null) an item's subcategory by hand. The name must belong to the item's own
 *  category (lib/product-subcategories.ts) — the server, not the select in the UI, is the authority. */
export async function setPantryItemSubcategoryAction(pantryItemId: string, subcategory: string | null): Promise<CatalogChangeOutcome | 'none'> {
  const householdId = await requireHouseholdId()
  const result = await updatePantryItemForHousehold(householdId, pantryItemId, { subcategory })
  if (result && 'subcategoryOutcome' in result) return result.subcategoryOutcome
  return 'none'
}

/** Changes an item's category by hand (e.g. a drink the receipt filed under Ostatní). The subcategory
 *  belongs to the old category, so it is cleared — the household or the keyword rules place it again.
 *  A product's category is a fact about the product, so the shared catalog learns it too and later
 *  receipts of the product (any household) land in the corrected category. The catalog product's old
 *  subcategory is cleared for the same reason as the item's. A product moved more than a few times
 *  waits for an administrator ('pending': the household's own item keeps its choice); once an
 *  administrator has decided, the product's category is final and the item cannot be changed
 *  ('locked', nothing is written). */
export async function setPantryItemCategoryAction(pantryItemId: string, category: ItemCategory): Promise<CategoryChangeOutcome> {
  const householdId = await requireHouseholdId()
  const result = await updatePantryItemForHousehold(householdId, pantryItemId, { category })
  if (result && 'categoryOutcome' in result) return result.categoryOutcome
  return 'unchanged'
}

/** Places every uncategorized item of the household by the deterministic keyword rules — the same
 *  ones a receipt import uses (lib/categorization.ts classifySubcategory) — never AI. Items the rules
 *  cannot place stay uncategorized for the household to choose by hand. Returns what was assigned so
 *  the client can show it without reloading. */
export async function autoCategorizePantryAction(): Promise<{ id: string; subcategory: string }[]> {
  const householdId = await requireHouseholdId()
  return autoCategorizePantryForHousehold(householdId)
}

/** How closely the household wants an item watched (lib/pantry.ts PANTRY_TRACKING): 'rare' and
 *  'off' drop it from the "asi došlo" estimate, and 'off' from every check. Changing it also clears
 *  a pending "Máte ještě?" question — the household just said how they want the item treated. */
export async function setPantryTrackingAction(pantryItemId: string, tracking: PantryTracking) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  if (!PANTRY_TRACKING.some((option) => option.value === tracking)) throw new Error('Neplatná volba sledování.')
  await getDb().update(schema.pantryItems).set({ tracking, askedAt: null }).where(eq(schema.pantryItems.id, pantryItemId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next reload.
}

/** Sets the wanted stock of a product TYPE (Profil ▸ Hlídané zásoby): the minimum at which the app suggests
 *  stocking up when a preferred chain runs a promotion on any product of the type, and the maximum to
 *  stock up to (lib/pantry-restock.ts). One level per type; saving again replaces it. The household is
 *  taken from the session, never from the client. Returns the household's levels. */
export async function setStockLevelAction(productTypeKey: string, minQuantity: number, maxQuantity: number, unit: ItemUnit): Promise<StockLevel[]> {
  const householdId = await requireHouseholdId()
  const definition = productTypeByKey(productTypeKey)
  if (!definition) throw new Error('Neplatný druh zboží.')
  if (!ITEM_UNITS.includes(unit)) throw new Error('Neplatná jednotka.')
  const problem = validateStockLevels(minQuantity, maxQuantity)
  if (problem) throw new Error(problem)
  const db = getDb()
  const type = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, productTypeKey), columns: { id: true } })
  if (!type) throw new Error('Neplatný druh zboží.')
  await db
    .insert(schema.householdStockLevels)
    .values({ householdId, productTypeId: type.id, minQuantity, maxQuantity, unit })
    .onConflictDoUpdate({ target: [schema.householdStockLevels.householdId, schema.householdStockLevels.productTypeId], set: { minQuantity, maxQuantity, unit } })
  return getStockLevels(householdId)
}

/** Stops watching a product type's stock. Only the household's own level can be removed. */
export async function removeStockLevelAction(levelId: string): Promise<StockLevel[]> {
  const householdId = await requireHouseholdId()
  await getDb().delete(schema.householdStockLevels).where(and(eq(schema.householdStockLevels.id, levelId), eq(schema.householdStockLevels.householdId, householdId)))
  return getStockLevels(householdId)
}

/** Refuses a restock suggestion for the whole household: the offer is identified by the type, the product
 *  and the day the promotion ends, so a different or better promotion is offered again. Returns the
 *  household's refused offers still running. */
export async function dismissRestockSuggestionAction(productTypeKey: string, productId: string, validUntil: string, today: string): Promise<string[]> {
  const householdId = await requireHouseholdId()
  if (!productTypeByKey(productTypeKey)) throw new Error('Neplatný druh zboží.')
  if (typeof productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) throw new Error('Neplatný produkt.')
  const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
  if (!isDay(validUntil) || !isDay(today)) throw new Error('Neplatné datum.')
  const db = getDb()
  const type = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, productTypeKey), columns: { id: true } })
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId), columns: { id: true } })
  if (!type || !product) throw new Error('Neplatný návrh.')
  await db.insert(schema.restockDismissals).values({ householdId, productTypeId: type.id, productId, validUntil }).onConflictDoNothing()
  // Offers that have ended can never come back, so their refusals are dropped along the way.
  await db.delete(schema.restockDismissals).where(and(eq(schema.restockDismissals.householdId, householdId), lt(schema.restockDismissals.validUntil, today)))
  return getRestockDismissals(householdId, today)
}
