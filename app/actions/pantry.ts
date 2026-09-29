'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { customPlaceIdFromKey, MAX_PANTRY_REVIEW_ITEMS, PANTRY_AREAS, PANTRY_LOCATIONS, PANTRY_TRACKING, splitPantryReview } from '@/lib/pantry'
import type { PantryArea, PantryTracking } from '@/lib/types'

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
