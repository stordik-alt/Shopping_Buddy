import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts. addExpenseAction
// has no client-supplied resource id to check ownership of (it only ever touches the caller's own
// household), so the interesting integration behavior here is the budget-threshold notification —
// already unit-tested as a pure function in lib/budget.test.ts, but never exercised end-to-end
// against a real household's real monthlyBudget/expenses before.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { addExpenseAction } from '@/app/actions/budget'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_budget__', monthlyBudget: '1000' }).returning()
  householdId = household.id
  createdHouseholdIds.push(householdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.notifications).where(eq(schema.notifications.householdId, id))
    await db.delete(schema.expenses).where(eq(schema.expenses.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('addExpenseAction', () => {
  it('persists the expense against the caller\'s own household', async () => {
    const { expense } = await addExpenseAction({ amount: 250, note: 'Nákup', category: 'Potraviny', date: '2026-09-21' })
    const row = await db.query.expenses.findFirst({ where: eq(schema.expenses.id, expense.id) })
    expect(row?.householdId).toBe(householdId)
    expect(Number(row?.amount)).toBe(250)
  })

  it('does not notify while comfortably under the 80% threshold', async () => {
    const { notification } = await addExpenseAction({ amount: 100, note: '', category: 'Potraviny', date: '2026-09-21' })
    expect(notification).toBeNull()
  })

  it('fires a "reached" notification exactly when spending crosses 80% of the real household budget', async () => {
    await addExpenseAction({ amount: 700, note: '', category: 'Potraviny', date: '2026-09-21' }) // 70%, under threshold
    const { notification } = await addExpenseAction({ amount: 150, note: '', category: 'Potraviny', date: '2026-09-21' }) // 85%, crosses 80%
    expect(notification?.title).toBe('Blížíte se limitu rozpočtu')
  })

  it('fires an "exceeded" notification exactly when spending crosses 100%, and does not re-fire while already over', async () => {
    await addExpenseAction({ amount: 950, note: '', category: 'Potraviny', date: '2026-09-21' }) // 95%
    const crossing = await addExpenseAction({ amount: 100, note: '', category: 'Potraviny', date: '2026-09-21' }) // 105%, crosses 100%
    expect(crossing.notification?.title).toBe('Rozpočet byl překročen')

    const stillOver = await addExpenseAction({ amount: 50, note: '', category: 'Potraviny', date: '2026-09-21' }) // 110%, already over
    expect(stillOver.notification).toBeNull()
  })

  it('counts only the month the expense falls in, so a new month starts from zero', async () => {
    await addExpenseAction({ amount: 950, note: '', category: 'Potraviny', date: '2026-09-21' }) // 95% of September
    // October's first expense is 10% of October's budget, not 105% of "everything ever spent".
    const october = await addExpenseAction({ amount: 100, note: '', category: 'Potraviny', date: '2026-10-01' })
    expect(october.notification).toBeNull()
  })
})
