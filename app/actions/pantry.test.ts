import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { PANTRY_LOCATIONS } from '@/lib/pantry'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { adjustPantryItemQuantityAction, confirmPantryItemAction, movePantryItemAction, removePantryItemAction, reviewPantryAction, setPantryTrackingAction } from '@/app/actions/pantry'

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

describe('movePantryItemAction', () => {
  it('rejects a pantry item id belonging to a different household', async () => {
    const [otherItem] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Kuřecí prsa', category: 'Potraviny', location: 'Lednice' }).returning()
    await expect(movePantryItemAction(otherItem.id, 'Mrazák')).rejects.toThrow('Pantry item not found')
  })

  it('moves the caller\'s own item to a new location, e.g. lednice to mrazák', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Kuřecí prsa', category: 'Potraviny', location: 'Lednice' }).returning()
    await movePantryItemAction(item.id, 'Mrazák')
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row?.location).toBe('Mrazák')
  })

  it('moves an item into and out of every one of the six locations, including Lékárnička and Drogérka', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Obvaz', category: 'Ostatní', location: 'Spíž' }).returning()

    // Walk the item through every location in turn (each move starts from the previous one's
    // destination, so every location is both a source and a destination), then back home.
    for (const location of [...PANTRY_LOCATIONS, 'Spíž' as const]) {
      await movePantryItemAction(item.id, location)
      const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
      expect(row?.location).toBe(location)
    }
  })

  it('keeps the item\'s quantity, unit and category when it moves', async () => {
    const [item] = await db
      .insert(schema.pantryItems)
      .values({ householdId, name: 'Ibalgin', category: 'Ostatní', location: 'Domácnost', quantity: 2, unit: 'ks' })
      .returning()
    await movePantryItemAction(item.id, 'Lékárnička')
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row).toMatchObject({ location: 'Lékárnička', quantity: 2, unit: 'ks', category: 'Ostatní', name: 'Ibalgin' })
  })
})

describe('adjustPantryItemQuantityAction', () => {
  it('rejects a pantry item id belonging to a different household', async () => {
    const [otherItem] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Mléko', category: 'Potraviny', quantity: 4 }).returning()
    await expect(adjustPantryItemQuantityAction(otherItem.id, 3)).rejects.toThrow('Pantry item not found')
  })

  it('sets the quantity to the given absolute value (covers both the +/- stepper and typing an exact amount)', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Mléko', category: 'Potraviny', quantity: 4 }).returning()
    await adjustPantryItemQuantityAction(item.id, 3)
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row?.quantity).toBe(3)
  })

  it('accepts a fractional quantity in the item\'s own unit, e.g. 1.5 kg', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Kuřecí prsa', category: 'Potraviny', unit: 'kg', quantity: 2 }).returning()
    await adjustPantryItemQuantityAction(item.id, 1.5)
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row?.quantity).toBe(1.5)
  })

  it('allows reaching exactly 0 — the item stays in the pantry, it is not deleted', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Mléko', category: 'Potraviny', quantity: 1 }).returning()
    await adjustPantryItemQuantityAction(item.id, 0)
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row).toBeDefined()
    expect(row?.quantity).toBe(0)
  })

  it('rejects a negative quantity — stock must never go below 0', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Mléko', category: 'Potraviny', quantity: 1 }).returning()
    await expect(adjustPantryItemQuantityAction(item.id, -1)).rejects.toThrow('nesmí být záporné')
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row?.quantity).toBe(1) // unchanged
  })

  it('never touches purchase_items — a manual stock edit is not a rewrite of purchase history', async () => {
    const [purchase] = await db.insert(schema.purchases).values({ householdId, date: '2026-09-22', total: '10' }).returning()
    await db.insert(schema.purchaseItems).values({ purchaseId: purchase.id, name: 'Mléko', quantity: 4, price: '10' })
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Mléko', category: 'Potraviny', quantity: 4 }).returning()

    await adjustPantryItemQuantityAction(item.id, 1)

    const purchaseItemRow = await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })
    expect(purchaseItemRow?.quantity).toBe(4) // untouched
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

describe('reviewPantryAction', () => {
  const weekAgo = () => new Date(Date.now() - 7 * 86_400_000)

  it('removes what ran out and confirms everything else in one save', async () => {
    const [milk, eggs, rice] = await db
      .insert(schema.pantryItems)
      .values([
        { householdId, name: 'Mléko', category: 'Potraviny', addedAt: weekAgo(), askedAt: weekAgo() },
        { householdId, name: 'Vejce', category: 'Potraviny', addedAt: weekAgo() },
        { householdId, name: 'Rýže', category: 'Potraviny', addedAt: weekAgo(), askedAt: weekAgo() },
      ])
      .returning()

    const result = await reviewPantryAction({ reviewedIds: [milk.id, eggs.id, rice.id], goneIds: [eggs.id] })

    expect(result).toEqual({ removed: 1, confirmed: 2 })
    const rows = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(rows.map((row) => row.name).sort()).toEqual(['Mléko', 'Rýže'])
    for (const row of rows) {
      expect(row.askedAt).toBeNull()
      expect(row.addedAt.getTime()).toBeGreaterThan(Date.now() - 60_000)
    }
  })

  it('rejects the whole check when any id belongs to another household, and writes nothing', async () => {
    const [mine] = await db.insert(schema.pantryItems).values({ householdId, name: 'Máslo', category: 'Potraviny', addedAt: weekAgo() }).returning()
    const [theirs] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Sýr', category: 'Potraviny' }).returning()

    await expect(reviewPantryAction({ reviewedIds: [mine.id, theirs.id], goneIds: [mine.id, theirs.id] })).rejects.toThrow('Pantry item not found')

    expect(await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, mine.id) })).toBeDefined()
    expect(await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, theirs.id) })).toBeDefined()
  })

  it('ignores a gone mark for an item that was not part of the check', async () => {
    const [shown, hidden] = await db
      .insert(schema.pantryItems)
      .values([
        { householdId, name: 'Chléb', category: 'Potraviny' },
        { householdId, name: 'Mouka', category: 'Potraviny' },
      ])
      .returning()
    expect(await reviewPantryAction({ reviewedIds: [shown.id], goneIds: [hidden.id] })).toEqual({ removed: 0, confirmed: 1 })
    expect(await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, hidden.id) })).toBeDefined()
  })

  it('rejects malformed input', async () => {
    await expect(reviewPantryAction({ reviewedIds: 'x' as unknown as string[], goneIds: [] })).rejects.toThrow('Neplatná kontrola')
    expect(await reviewPantryAction({ reviewedIds: [], goneIds: [] })).toEqual({ removed: 0, confirmed: 0 })
  })
})

describe('setPantryTrackingAction', () => {
  it("sets the caller's own item and clears a pending question; refuses another household's item and unknown values", async () => {
    const [mine] = await db.insert(schema.pantryItems).values({ householdId, name: 'Sůl', category: 'Potraviny', askedAt: new Date() }).returning()
    const [theirs] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Pepř', category: 'Potraviny' }).returning()
    await setPantryTrackingAction(mine.id, 'rare')
    const row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, mine.id) })
    expect(row).toMatchObject({ tracking: 'rare', askedAt: null })
    await expect(setPantryTrackingAction(theirs.id, 'off')).rejects.toThrow('Pantry item not found')
    await expect(setPantryTrackingAction(mine.id, 'sometimes' as never)).rejects.toThrow('Neplatná volba')
  })
})
