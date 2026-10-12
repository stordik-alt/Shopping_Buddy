import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: (...args: any[]) => any) => fn }))

import { refreshExpensesAction, refreshPantryAction, refreshPurchasesAction } from '@/app/actions/refresh'

const db = getDb()
const householdIds: string[] = []
let householdId: string
let otherHouseholdId: string

beforeEach(async () => {
  const [mine, theirs] = await db.insert(schema.households).values([{ name: '__test_refresh__' }, { name: '__test_refresh_other__' }]).returning()
  householdId = mine.id
  otherHouseholdId = theirs.id
  householdIds.push(householdId, otherHouseholdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of householdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
})

describe('section refreshes', () => {
  it("read only the caller's own household: pantry, purchases and expenses", async () => {
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(schema.pantryItems).values([
      { householdId, name: 'Moje máslo', category: 'Potraviny' },
      { householdId: otherHouseholdId, name: 'Cizí rýže', category: 'Potraviny' },
    ])
    await db.insert(schema.purchases).values([
      { householdId, date: today, total: '10' },
      { householdId: otherHouseholdId, date: today, total: '99' },
    ])
    await db.insert(schema.expenses).values([
      { householdId, amount: '5', date: today, note: 'moje' },
      { householdId: otherHouseholdId, amount: '7', date: today, note: 'cizí' },
    ])

    expect((await refreshPantryAction()).pantryItems.map((item) => item.name)).toEqual(['Moje máslo'])
    expect((await refreshPurchasesAction()).map((purchase) => purchase.total)).toEqual([10])
    expect((await refreshExpensesAction()).map((expense) => expense.note)).toEqual(['moje'])

    // What another member changes shows up on the next refresh.
    await db.insert(schema.pantryItems).values({ householdId, name: 'Nové mléko', category: 'Potraviny' })
    expect((await refreshPantryAction()).pantryItems.map((item) => item.name).sort()).toEqual(['Moje máslo', 'Nové mléko'])
  })
})
