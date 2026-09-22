'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { PantryLocation } from '@/lib/types'

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
  revalidatePath('/')
}

/** Reassigns which pantry location an item lives in — e.g. moving freshly bought chilled meat
 *  into the freezer for later use. General-purpose (any location to any other), which also covers
 *  the specific "lednice → mrazák" case without a separate action for it. */
export async function movePantryItemAction(pantryItemId: string, location: PantryLocation) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  const db = getDb()
  await db.update(schema.pantryItems).set({ location }).where(eq(schema.pantryItems.id, pantryItemId))
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
  revalidatePath('/')
}

/** "Došlo" — the household no longer has this item, so it's removed from the pantry entirely
 *  (not marked "out" — there's nothing useful to keep once it's gone; buying it again creates a
 *  fresh pantry row via completePurchaseAction). */
export async function removePantryItemAction(pantryItemId: string) {
  const householdId = await requireHouseholdId()
  await assertOwnsPantryItem(householdId, pantryItemId)
  const db = getDb()
  await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
  revalidatePath('/')
}
