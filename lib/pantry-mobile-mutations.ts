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
  change: { quantity: number } | { placeKey: string },
): Promise<void> {
  if (!UUID_PATTERN.test(pantryItemId)) throw new PantryResourceNotFoundError('Pantry item not found')
  const db = getDb()
  const item = await db.query.pantryItems.findFirst({
    where: and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)),
    columns: { id: true },
  })
  if (!item) throw new PantryResourceNotFoundError('Pantry item not found')

  if ('quantity' in change) {
    if (!Number.isFinite(change.quantity) || change.quantity < 0) throw new PantryInputError('Množství nesmí být záporné.')
    await db
      .update(schema.pantryItems)
      .set({ quantity: change.quantity })
      .where(and(eq(schema.pantryItems.id, pantryItemId), eq(schema.pantryItems.householdId, householdId)))
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
