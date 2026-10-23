import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { customPlaceIdFromKey, PANTRY_LOCATIONS } from '@/lib/pantry'
import type { PantryLocation } from '@/lib/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PantryInputError extends Error {}
export class PantryResourceNotFoundError extends Error {}

export async function updatePantryItemForHousehold(
  householdId: string,
  pantryItemId: string,
  change: { quantity: number; expectedQuantity?: number } | { placeKey: string },
): Promise<void> {
  if (!UUID_PATTERN.test(pantryItemId)) throw new PantryResourceNotFoundError('Pantry item not found')
  // This quantity read drives compare-and-set. Use the dedicated cache-disabled Hyperdrive
  // binding so a write made by the same or another household member is visible immediately.
  const db = getDb('quantity' in change ? 'HYPERDRIVE_PANTRY_FRESH' : 'HYPERDRIVE')
  const item = await db.query.pantryItems.findFirst({
    where: and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)),
    columns: { id: true, quantity: true },
    with: { contents: { columns: { id: true } } },
  })
  if (!item) throw new PantryResourceNotFoundError('Pantry item not found')

  if ('quantity' in change) {
    if (!Number.isFinite(change.quantity) || change.quantity < 0) throw new PantryInputError('Množství nesmí být záporné.')
    if ((item.contents?.length ?? 0) > 0) throw new PantryInputError('Upravte množství jednotlivých produktů v detailu zásoby.')
    // Compare-and-set: when the caller says which amount it expected to find, the write only goes
    // through if that is still the stored amount. A request that was overtaken — a second tap, or
    // another member of the household — can then no longer overwrite the newer amount with an
    // older one. Callers that do not know the previous amount (the mobile API) are unaffected.
    if (change.expectedQuantity != null && Number(item.quantity) !== change.expectedQuantity) {
      throw new PantryInputError('Množství mezitím změnil někdo jiný. Zkontrolujte prosím aktuální stav a zkuste to znovu.')
    }
    const updateConditions = [eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)]
    if (change.expectedQuantity != null) updateConditions.push(eq(schema.pantryItems.quantity, change.expectedQuantity))
    const updated = await db
      .update(schema.pantryItems)
      .set({ quantity: change.quantity })
      .where(and(...updateConditions))
      .returning({ id: schema.pantryItems.id })
    // Keep the comparison atomic as well: another member may update after the fresh read but
    // before this write reaches PostgreSQL.
    if (change.expectedQuantity != null && updated.length === 0) {
      throw new PantryInputError('Množství mezitím změnil někdo jiný. Zkontrolujte prosím aktuální stav a zkuste to znovu.')
    }
    return
  }

  const customPlaceId = customPlaceIdFromKey(change.placeKey)
  if (customPlaceId) {
    if (!UUID_PATTERN.test(customPlaceId)) throw new PantryInputError('Vlastní místo nenalezeno.')
    const place = await db.query.pantryPlaces.findFirst({
      where: and(eq(schema.pantryPlaces.id, customPlaceId), eq(schema.pantryPlaces.householdId, householdId)),
      columns: { id: true },
    })
    if (!place) throw new PantryInputError('Vlastní místo nenalezeno.')
    await db
      .update(schema.pantryItems)
      .set({ customPlaceId })
      .where(and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)))
    return
  }

  if (!(PANTRY_LOCATIONS as string[]).includes(change.placeKey)) throw new PantryInputError('Neplatné umístění.')
  await db
    .update(schema.pantryItems)
    .set({ location: change.placeKey as PantryLocation, customPlaceId: null })
    .where(and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)))
}
