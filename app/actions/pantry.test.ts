import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { CHECKIN_DAYS_BY_CATEGORY, customPlaceKey, PANTRY_LOCATIONS } from '@/lib/pantry'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  addPantryPlaceAction,
  adjustPantryItemQuantityAction,
  autoCategorizePantryAction,
  setPantryItemSubcategoryAction,
  confirmPantryItemAction,
  movePantryItemAction,
  removePantryItemAction,
  removePantryPlaceAction,
  reviewPantryAction,
  setPantryCheckinDaysAction,
  setPantrySubcategoryCheckinDaysAction,
  setPantryTrackingAction,
} from '@/app/actions/pantry'

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
    await db.delete(schema.pantryPlaces).where(eq(schema.pantryPlaces.householdId, id))
    await db.delete(schema.pantryCheckinIntervals).where(eq(schema.pantryCheckinIntervals.householdId, id))
    await db.delete(schema.pantryCheckinSubcategoryIntervals).where(eq(schema.pantryCheckinSubcategoryIntervals.householdId, id))
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

  it('moves the caller\'s own item into one of the household\'s custom places, and back to a fixed location', async () => {
    const [place] = await db.insert(schema.pantryPlaces).values({ householdId, area: 'Auto', name: 'Kufr auta' }).returning()
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Motorový olej', category: 'Ostatní', location: 'Spíž' }).returning()

    await movePantryItemAction(item.id, customPlaceKey(place.id))
    let row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row?.customPlaceId).toBe(place.id)

    await movePantryItemAction(item.id, 'Domácnost')
    row = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, item.id) })
    expect(row).toMatchObject({ location: 'Domácnost', customPlaceId: null })
  })

  it('rejects a custom place belonging to a different household', async () => {
    const [theirPlace] = await db.insert(schema.pantryPlaces).values({ householdId: otherHouseholdId, area: 'Auto', name: 'Kufr auta' }).returning()
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Motorový olej', category: 'Ostatní' }).returning()
    await expect(movePantryItemAction(item.id, customPlaceKey(theirPlace.id))).rejects.toThrow('Vlastní místo nenalezeno')
  })

  it('rejects a place key that is neither a known fixed location nor a real custom place id', async () => {
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Mléko', category: 'Potraviny' }).returning()
    await expect(movePantryItemAction(item.id, 'Garáž')).rejects.toThrow('Neplatné umístění')
    await expect(movePantryItemAction(item.id, customPlaceKey('00000000-0000-0000-0000-000000000000'))).rejects.toThrow('Vlastní místo nenalezeno')
  })
})

describe('addPantryPlaceAction', () => {
  it('adds a custom place under the given area', async () => {
    const place = await addPantryPlaceAction('Auto', 'Kufr auta')
    expect(place).toMatchObject({ area: 'Auto', name: 'Kufr auta' })
    const row = await db.query.pantryPlaces.findFirst({ where: eq(schema.pantryPlaces.id, place.id) })
    expect(row).toMatchObject({ householdId, area: 'Auto', name: 'Kufr auta' })
  })

  it('trims the name and rejects an empty one', async () => {
    const place = await addPantryPlaceAction('Bydlení', '  Sklep  ')
    expect(place.name).toBe('Sklep')
    await expect(addPantryPlaceAction('Bydlení', '   ')).rejects.toThrow('Zadejte název')
  })

  it('rejects an unknown area', async () => {
    await expect(addPantryPlaceAction('Vesmír' as never, 'Raketa')).rejects.toThrow('Neplatná oblast')
  })

  it('rejects a duplicate name within the same area, but allows the same name in a different area', async () => {
    await addPantryPlaceAction('Auto', 'Garáž')
    await expect(addPantryPlaceAction('Auto', 'Garáž')).rejects.toThrow('už v dané oblasti existuje')
    await expect(addPantryPlaceAction('Bydlení', 'Garáž')).resolves.toMatchObject({ area: 'Bydlení', name: 'Garáž' })
  })
})

describe('removePantryPlaceAction', () => {
  it('removes an empty custom place', async () => {
    const place = await addPantryPlaceAction('Auto', 'Schránka')
    await removePantryPlaceAction(place.id)
    expect(await db.query.pantryPlaces.findFirst({ where: eq(schema.pantryPlaces.id, place.id) })).toBeUndefined()
  })

  it('refuses to remove a place that still holds items', async () => {
    const place = await addPantryPlaceAction('Auto', 'Kufr auta')
    const [item] = await db.insert(schema.pantryItems).values({ householdId, name: 'Motorový olej', category: 'Ostatní', customPlaceId: place.id }).returning()
    await expect(removePantryPlaceAction(place.id)).rejects.toThrow('Nejdřív přesuňte položky')
    expect(await db.query.pantryPlaces.findFirst({ where: eq(schema.pantryPlaces.id, place.id) })).toBeDefined()
    await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, item.id)) // clean up for the next test
  })

  it('rejects a place belonging to a different household', async () => {
    const [theirPlace] = await db.insert(schema.pantryPlaces).values({ householdId: otherHouseholdId, area: 'Auto', name: 'Kufr' }).returning()
    await expect(removePantryPlaceAction(theirPlace.id)).rejects.toThrow('Vlastní místo nenalezeno')
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

describe('setPantryItemSubcategoryAction', () => {
  it("sets and clears the caller's own item's subcategory; refuses another household's item and a foreign or unknown name", async () => {
    const [mine] = await db.insert(schema.pantryItems).values({ householdId, name: 'Rohlík', category: 'Potraviny' }).returning()
    const [theirs] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Chléb', category: 'Potraviny' }).returning()
    await setPantryItemSubcategoryAction(mine.id, 'Pečivo')
    const set = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, mine.id), with: { subcategory: true } })
    expect(set?.subcategory?.name).toBe('Pečivo')
    await setPantryItemSubcategoryAction(mine.id, null)
    const cleared = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.id, mine.id) })
    expect(cleared?.subcategoryId).toBeNull()
    await expect(setPantryItemSubcategoryAction(theirs.id, 'Pečivo')).rejects.toThrow('Pantry item not found')
    await expect(setPantryItemSubcategoryAction(mine.id, 'Neexistuje')).rejects.toThrow('Neplatná podkategorie')
    await expect(setPantryItemSubcategoryAction(mine.id, 'Kosmetika a hygiena')).rejects.toThrow('Neplatná podkategorie')
  })
})

describe('setPantryItemSubcategoryAction learning', () => {
  it("teaches the shared catalog product, so it is placed the same way for every household", async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const [product] = await db.insert(schema.products).values({ name: '__test_product_learning__', categoryId: category!.id }).returning()
    try {
      const [mine] = await db.insert(schema.pantryItems).values({ householdId, productId: product.id, name: product.name, category: 'Potraviny' }).returning()
      await setPantryItemSubcategoryAction(mine.id, 'Pečivo')
      const learned = await db.query.products.findFirst({ where: eq(schema.products.id, product.id), with: { subcategory: true } })
      expect(learned?.subcategory?.name).toBe('Pečivo')
    } finally {
      await db.delete(schema.pantryItems).where(eq(schema.pantryItems.productId, product.id))
      await db.delete(schema.products).where(eq(schema.products.id, product.id))
    }
  })
})

describe('autoCategorizePantryAction', () => {
  it("places the household's uncategorized items by keyword, leaves unknown ones, and never touches another household", async () => {
    const [bread] = await db.insert(schema.pantryItems).values({ householdId, name: 'Rohlík tukový', category: 'Potraviny' }).returning()
    const [unknown] = await db.insert(schema.pantryItems).values({ householdId, name: 'Zzxqv', category: 'Potraviny' }).returning()
    const [theirs] = await db.insert(schema.pantryItems).values({ householdId: otherHouseholdId, name: 'Rohlík', category: 'Potraviny' }).returning()
    const assigned = await autoCategorizePantryAction()
    expect(assigned).toEqual([{ id: bread.id, subcategory: 'Pečivo' }])
    const rows = await db.query.pantryItems.findMany({ where: inArray(schema.pantryItems.id, [bread.id, unknown.id, theirs.id]) })
    expect(rows.find((row) => row.id === bread.id)?.subcategoryId).not.toBeNull()
    expect(rows.find((row) => row.id === unknown.id)?.subcategoryId).toBeNull()
    expect(rows.find((row) => row.id === theirs.id)?.subcategoryId).toBeNull()
  })
})

describe('setPantrySubcategoryCheckinDaysAction', () => {
  it('sets, updates and clears a subcategory override', async () => {
    expect(await setPantrySubcategoryCheckinDaysAction('Potraviny', 'Pečivo', 2)).toEqual({ 'Potraviny::Pečivo': 2 })
    expect(await setPantrySubcategoryCheckinDaysAction('Potraviny', 'Pečivo', 4)).toEqual({ 'Potraviny::Pečivo': 4 })
    expect(await setPantrySubcategoryCheckinDaysAction('Potraviny', 'Pečivo', null)).toEqual({})
  })

  it('rejects an unknown subcategory, a subcategory of another category and bad day counts', async () => {
    await expect(setPantrySubcategoryCheckinDaysAction('Potraviny', 'Nákup potravin', 5)).rejects.toThrow('Neznámá podkategorie')
    await expect(setPantrySubcategoryCheckinDaysAction('Drogerie', 'Pečivo', 5)).rejects.toThrow('Neznámá podkategorie')
    await expect(setPantrySubcategoryCheckinDaysAction('Potraviny', 'Pečivo', 0)).rejects.toThrow('celé číslo')
  })
})

describe('setPantryCheckinDaysAction', () => {
  it('sets an override and returns every override of the household', async () => {
    const result = await setPantryCheckinDaysAction('Potraviny', 5)
    expect(result).toEqual({ Potraviny: 5 })
    const row = await db.query.pantryCheckinIntervals.findFirst({ where: eq(schema.pantryCheckinIntervals.householdId, householdId) })
    expect(row).toMatchObject({ category: 'Potraviny', days: 5 })
  })

  it('updates an existing override rather than duplicating it', async () => {
    await setPantryCheckinDaysAction('Drogerie', 20)
    const result = await setPantryCheckinDaysAction('Drogerie', 25)
    expect(result.Drogerie).toBe(25)
    const rows = await db.query.pantryCheckinIntervals.findMany({ where: and(eq(schema.pantryCheckinIntervals.householdId, householdId), eq(schema.pantryCheckinIntervals.category, 'Drogerie')) })
    expect(rows).toHaveLength(1)
  })

  it('clears an override back to the fixed default with days: null', async () => {
    await setPantryCheckinDaysAction('Děti', 10)
    const result = await setPantryCheckinDaysAction('Děti', null)
    expect(result.Děti).toBeUndefined()
    expect(await db.query.pantryCheckinIntervals.findFirst({ where: and(eq(schema.pantryCheckinIntervals.householdId, householdId), eq(schema.pantryCheckinIntervals.category, 'Děti')) })).toBeUndefined()
  })

  it('rejects a non-integer, zero, negative or absurdly large number of days', async () => {
    await expect(setPantryCheckinDaysAction('Potraviny', 1.5)).rejects.toThrow('celé číslo')
    await expect(setPantryCheckinDaysAction('Potraviny', 0)).rejects.toThrow('celé číslo')
    await expect(setPantryCheckinDaysAction('Potraviny', -3)).rejects.toThrow('celé číslo')
    await expect(setPantryCheckinDaysAction('Potraviny', 1000)).rejects.toThrow('celé číslo')
  })

  it('rejects an unknown category', async () => {
    await expect(setPantryCheckinDaysAction('Elektronika' as never, 5)).rejects.toThrow('Neznámá kategorie')
  })

  it('keeps one household\'s overrides separate from another\'s', async () => {
    await setPantryCheckinDaysAction('Ostatní', 3)
    currentHouseholdId = otherHouseholdId
    expect(await setPantryCheckinDaysAction('Ostatní', 40)).toEqual({ Ostatní: 40 })
    currentHouseholdId = householdId
    const mine = await db.query.pantryCheckinIntervals.findFirst({ where: and(eq(schema.pantryCheckinIntervals.householdId, householdId), eq(schema.pantryCheckinIntervals.category, 'Ostatní')) })
    expect(mine?.days).toBe(3)
  })

  it('every category in CHECKIN_DAYS_BY_CATEGORY is a valid category to override', async () => {
    for (const category of Object.keys(CHECKIN_DAYS_BY_CATEGORY) as (keyof typeof CHECKIN_DAYS_BY_CATEGORY)[]) {
      await expect(setPantryCheckinDaysAction(category, 7)).resolves.toBeDefined()
    }
  })
})
