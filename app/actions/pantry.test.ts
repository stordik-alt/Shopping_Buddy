import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { confirmPantryItemAction, removePantryItemAction } from '@/app/actions/pantry'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string
let otherHouseholdId: string

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_pantry__' }).returning()
  const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_pantry_other__' }).returning()
  householdId = household.id
  otherHouseholdId = otherHousehold.id
  createdHouseholdIds.push(householdId, otherHouseholdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.pantryItems).where(eq(schema.pantryItems.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('confirmPantryItemAction', () => {
  it('rejects a pantry item id belonging to a different household', async () => {
    const [otherItem] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Mléko', category: 'Potraviny' }).returning()
    await expect(confirmPantryItemAction(otherItem.id)).rejects.toThrow('Pantry item not found')
  })

  it('resets addedAt to now and clears askedAt for the caller\'s own item', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Mléko', category: 'Potraviny', addedAt: twoDaysAgo, askedAt: twoDaysAgo }).returning()

    await confirmPantryItemAction(item.id)

    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row?.askedAt).toBeNull()
    expect(row?.addedAt.getTime()).toBeGreaterThan(twoDaysAgo.getTime())
  })
})

describe('removePantryItemAction', () => {
  it('rejects a pantry item id belonging to a different household', async () => {
    const [otherItem] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Mléko', category: 'Potraviny' }).returning()
    await expect(removePantryItemAction(otherItem.id)).rejects.toThrow('Pantry item not found')
    const stillThere = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, otherItem.id) })
    expect(stillThere).toBeDefined()
  })

  it('deletes the caller\'s own item entirely', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Mléko', category: 'Potraviny' }).returning()
    await removePantryItemAction(item.id)
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row).toBeUndefined()
  })
})
