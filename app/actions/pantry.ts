'use server'

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import { proposeProductSubcategory } from '@/lib/db/subcategory-changes'
import * as schema from '@/lib/db/schema'
import { classifySubcategory } from '@/lib/categorization'
import type { CatalogChangeOutcome } from '@/lib/product-subcategory-changes'
import { PRODUCT_SUBCATEGORIES, subcategoriesOfItem } from '@/lib/product-subcategories'
import { CHECKIN_DAYS_BY_CATEGORY, checkinSubcategoryKey, customPlaceIdFromKey, MAX_PANTRY_REVIEW_ITEMS, PANTRY_AREAS, PANTRY_LOCATIONS, PANTRY_TRACKING, splitPantryReview } from '@/lib/pantry'
import type { ItemCategory, PantryArea, PantryTracking } from '@/lib/types'

async function assertOwnsPantryItem(householdId: string, pantryItemId: string) {
  const db = getDb()
  const item = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, pantryItemId) })
  if (!item || item.householdId !== householdId) throw new Error('Pantry item not found')
}

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
  // compute on the database for nothing. Other members see it on their next refresh (once a minute).
}

/** Reassigns which place an item lives in — e.g. moving freshly bought chilled meat into the
 *  freezer for later use, or into one of the household's own custom places (lib/pantry.ts's
 *  `PantryPlaceOption.key`: a fixed `PantryLocation` name, or `custom:<pantry_places.id>`).
 *  General-purpose (any place to any other), which also covers the specific "lednice → mrazák" case
 *  without a separate action for it. */
export async function movePantryItemAction(pantryItemId: string, placeKey: string) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  const db = getDb()
  const customPlaceId = customPlaceIdFromKey(placeKey)
  if (customPlaceId) {
    const place = await db.query.pantryPlaces.findFirst({ where: eq(schema.pantryPlaces.id, customPlaceId) })
    if (!place || place.householdId !== householdId) throw new Error('Vlastní místo nenalezeno.')
    await db.update(schema.pantryItems).set({ customPlaceId }).where(eq(schema.pantryItems.id, pantryItemId))
  } else {
    if (!(PANTRY_LOCATIONS as string[]).includes(placeKey)) throw new Error('Neplatné umístění.')
    await db
      .update(schema.pantryItems)
      .set({ location: placeKey as (typeof PANTRY_LOCATIONS)[number], customPlaceId: null })
      .where(eq(schema.pantryItems.id, pantryItemId))
  }
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next refresh (once a minute).
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
  revalidatePath('/')
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
  revalidatePath('/')
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
  revalidatePath('/')
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
  revalidatePath('/')
}

/** Sets a pantry item's quantity to an exact value — covers both the "−/+" stepper and typing an
 *  exact amount (e.g. "1.5 kg") in the pantry UI. Takes the new absolute quantity, not a delta, so
 *  the client and server always agree on the result regardless of network timing. Never negative
 *  (the household ran out, not into debt) — 0 is a valid, meaningful result ("do šlo") and the row
 *  stays in the pantry at 0 rather than being deleted; deleting it entirely is `removePantryItemAction`,
 *  a separate, explicit choice. Never touches `purchase_items` — purchase history is a record of
 *  what was bought, not of what's currently on hand, and must never be rewritten by a stock edit. */
export async function adjustPantryItemQuantityAction(pantryItemId: string, quantity: number) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Množství nesmí být záporné.')
  const db = getDb()
  await db.update(schema.pantryItems).set({ quantity }).where(eq(schema.pantryItems.id, pantryItemId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next refresh (once a minute).
}

/** "Došlo" — the household no longer has this item, so it's removed from the pantry entirely
 *  (not marked "out" — there's nothing useful to keep once it's gone; buying it again creates a
 *  fresh pantry row via completePurchaseAction). */
export async function removePantryItemAction(pantryItemId: string) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  const db = getDb()
  await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
  // No revalidatePath: the app has already shown this change (components/app-shell.tsx updates its own
  // state first), and re-rendering the whole page for every tap re-ran every household query —
  // compute on the database for nothing. Other members see it on their next refresh (once a minute).
}

/** "Zkontrolovat zásoby" — saves a bulk check in one go: the items marked gone are removed, every
 *  other reviewed item is confirmed like "Ještě mám" (addedAt now, askedAt cleared). All ids must
 *  belong to the caller's household — one foreign or unknown id rejects the whole check, nothing is
 *  written. Both writes go in one batch, so a check is never saved half. Returns what was done so
 *  the client can report it. */
export async function reviewPantryAction(input: { reviewedIds: string[]; goneIds: string[] }): Promise<{ removed: number; confirmed: number }> {
  const householdId = await requireHouseholdId()
  const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === 'string')
  if (!isIdList(input?.reviewedIds) || !isIdList(input?.goneIds)) throw new Error('Neplatná kontrola zásob.')
  const { goneIds, keptIds } = splitPantryReview(input.reviewedIds, input.goneIds)
  const all = [...goneIds, ...keptIds]
  if (all.length === 0) return { removed: 0, confirmed: 0 }
  if (all.length > MAX_PANTRY_REVIEW_ITEMS) throw new Error('Kontrola obsahuje příliš mnoho položek.')

  const db = getDb()
  const owned = await db
    .select({ id: schema.pantryItems.id })
    .from(schema.pantryItems)
    .where(and(eq(schema.pantryItems.householdId, householdId), inArray(schema.pantryItems.id, all)))
  if (owned.length !== all.length) throw new Error('Pantry item not found')

  const inHousehold = (ids: string[]) => and(eq(schema.pantryItems.householdId, householdId), inArray(schema.pantryItems.id, ids))
  const now = new Date()
  if (goneIds.length > 0 && keptIds.length > 0) {
    await db.batch([
      db.delete(schema.pantryItems).where(inHousehold(goneIds)),
      db.update(schema.pantryItems).set({ addedAt: now, askedAt: null }).where(inHousehold(keptIds)),
    ])
  } else if (goneIds.length > 0) {
    await db.delete(schema.pantryItems).where(inHousehold(goneIds))
  } else {
    await db.update(schema.pantryItems).set({ addedAt: now, askedAt: null }).where(inHousehold(keptIds))
  }
  revalidatePath('/')
  return { removed: goneIds.length, confirmed: keptIds.length }
}

/** Resolves a subcategory name of `category` to its row id; throws on a name outside the fixed list. */
async function subcategoryIdFor(category: ItemCategory, name: string): Promise<string> {
  if (!subcategoriesOfItem(category).includes(name)) throw new Error('Neplatná podkategorie.')
  const row = await getDb().query.productSubcategories.findFirst({
    where: and(eq(schema.productSubcategories.category, category), eq(schema.productSubcategories.name, name)),
    columns: { id: true },
  })
  if (!row) throw new Error('Neplatná podkategorie.')
  return row.id
}

/** Sets (or clears, with null) an item's subcategory by hand. The name must belong to the item's own
 *  category (lib/product-subcategories.ts) — the server, not the select in the UI, is the authority. */
export async function setPantryItemSubcategoryAction(pantryItemId: string, subcategory: string | null): Promise<CatalogChangeOutcome | 'none'> {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const item = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, pantryItemId) })
  if (!item || item.householdId !== householdId) throw new Error('Pantry item not found')
  const subcategoryId = subcategory === null ? null : await subcategoryIdFor(item.category, subcategory)
  await db.update(schema.pantryItems).set({ subcategoryId }).where(eq(schema.pantryItems.id, pantryItemId))
  // Learn from the correction: a product's subcategory is a fact about the product, not the
  // household, so the shared catalog remembers it and every later receipt of that product (any
  // household) is placed — and counted in the budget — under it automatically. Only a hand-made
  // choice teaches the catalog; clearing one does not erase what the catalog already knows. A product
  // that has already been moved several times waits for an administrator ('pending') instead.
  if (item.productId && subcategory !== null) return proposeProductSubcategory(householdId, item.productId, item.category, subcategory)
  return 'none'
}

/** Changes an item's category by hand (e.g. a drink the receipt filed under Ostatní). The subcategory
 *  belongs to the old category, so it is cleared — the household or the keyword rules place it again.
 *  A product's category is a fact about the product, so the shared catalog learns it too and later
 *  receipts of the product (any household) land in the corrected category. The catalog product's old
 *  subcategory is cleared for the same reason as the item's. Unlike subcategory moves, category
 *  changes have no administrator approval step. */
export async function setPantryItemCategoryAction(pantryItemId: string, category: ItemCategory): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(PRODUCT_SUBCATEGORIES, category)) throw new Error('Neplatná kategorie.')
  const householdId = await requireHouseholdId()
  const db = getDb()
  const item = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, pantryItemId) })
  if (!item || item.householdId !== householdId) throw new Error('Pantry item not found')
  if (item.category === category) return
  await db.update(schema.pantryItems).set({ category, subcategoryId: null }).where(eq(schema.pantryItems.id, pantryItemId))
  if (item.productId) {
    const categoryRow = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, category), columns: { id: true } })
    if (!categoryRow) throw new Error('Neplatná kategorie.')
    await db.update(schema.products).set({ categoryId: categoryRow.id, subcategoryId: null }).where(eq(schema.products.id, item.productId))
  }
  revalidatePath('/')
}

/** Places every uncategorized item of the household by the deterministic keyword rules — the same
 *  ones a receipt import uses (lib/categorization.ts classifySubcategory) — never AI. Items the rules
 *  cannot place stay uncategorized for the household to choose by hand. Returns what was assigned so
 *  the client can show it without reloading. */
export async function autoCategorizePantryAction(): Promise<{ id: string; subcategory: string }[]> {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const rows = await db.query.pantryItems.findMany({
    where: and(eq(schema.pantryItems.householdId, householdId), isNull(schema.pantryItems.subcategoryId)),
    columns: { id: true, name: true, category: true },
  })
  const assigned: { id: string; subcategory: string }[] = []
  const idCache = new Map<string, string>()
  for (const row of rows) {
    const match = classifySubcategory(row.category, row.name, null)
    if (!match) continue
    const cacheKey = `${row.category}:${match.subcategory}`
    let subcategoryId = idCache.get(cacheKey)
    if (!subcategoryId) {
      subcategoryId = await subcategoryIdFor(row.category, match.subcategory)
      idCache.set(cacheKey, subcategoryId)
    }
    await db.update(schema.pantryItems).set({ subcategoryId }).where(and(eq(schema.pantryItems.id, row.id), eq(schema.pantryItems.householdId, householdId)))
    assigned.push({ id: row.id, subcategory: match.subcategory })
  }
  return assigned
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
  // compute on the database for nothing. Other members see it on their next refresh (once a minute).
}
