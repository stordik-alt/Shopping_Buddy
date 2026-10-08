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

import {
  addExpenseAction,
  deleteExpenseAction,
  getBudgetHistoryAction,
  getPeriodExpensesAction,
  setCategoryBudgetAction,
  setPeriodBudgetAction,
  setSavingsGoalAction,
  updateExpenseAction,
} from '@/app/actions/budget'
import { nextPeriodStart, periodStart } from '@/lib/budget'
import { todayInPrague } from '@/lib/today'

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

describe('manual autocomplete selection', () => {
  it('persists a selected generic product type on a manual expense', async () => {
    const type = (await db.query.productTypes.findFirst())!
    const { expense } = await addExpenseAction({
      amount: 12.5,
      note: type.name,
      category: 'Potraviny',
      subcategory: null,
      date: '2026-09-05',
      selection: { kind: 'type', productTypeKey: type.key },
    })
    expect(expense.productId).toBeNull()
    expect(expense.productTypeId).toBe(type.id)
    await db.delete(schema.expenses).where(eq(schema.expenses.id, expense.id))
  })
})

describe('addExpenseAction', () => {
  it('persists the expense against the caller\'s own household', async () => {
    const { expense } = await addExpenseAction({ amount: 250, note: 'Nákup', category: 'Potraviny', subcategory: null, date: '2026-09-21' })
    const row = await db.query.expenses.findFirst({ where: eq(schema.expenses.id, expense.id) })
    expect(row?.householdId).toBe(householdId)
    expect(Number(row?.amount)).toBe(250)
  })

  it('does not notify while comfortably under the 80% threshold', async () => {
    const { notifications } = await addExpenseAction({ amount: 100, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-21' })
    expect(notifications).toEqual([])
  })

  it('fires a "reached" notification exactly when spending crosses 80% of the real household budget', async () => {
    await addExpenseAction({ amount: 700, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-21' }) // 70%, under threshold
    const { notifications } = await addExpenseAction({ amount: 150, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-21' }) // 85%, crosses 80%
    expect(notifications.map((entry) => entry.title)).toEqual(['Blížíte se limitu rozpočtu'])
  })

  it('fires an "exceeded" notification exactly when spending crosses 100%, and does not re-fire while already over', async () => {
    await addExpenseAction({ amount: 950, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-21' }) // 95%
    const crossing = await addExpenseAction({ amount: 100, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-21' }) // 105%, crosses 100%
    expect(crossing.notifications.map((entry) => entry.title)).toEqual(['Rozpočet byl překročen'])

    const stillOver = await addExpenseAction({ amount: 50, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-21' }) // 110%, already over
    expect(stillOver.notifications).toEqual([])
  })

  it('counts only the month the expense falls in, so a new month starts from zero', async () => {
    await addExpenseAction({ amount: 950, note: '', category: 'Potraviny', subcategory: null, date: '2026-08-21' }) // 95% of August
    // September's first expense is 10% of September's budget, not 105% of "everything ever spent".
    // (Past months: an expense is money already paid, so a future date is refused.)
    const september = await addExpenseAction({ amount: 100, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-01' })
    expect(september.notifications).toEqual([])
  })

  it('stores the new categories with their subcategory and the chosen date', async () => {
    const { expense } = await addExpenseAction({ amount: 1890.5, note: 'Záloha', category: 'Bydlení', subcategory: 'Elektřina', date: '2026-09-05' })
    expect(expense).toMatchObject({ amount: 1890.5, category: 'Bydlení', subcategory: 'Elektřina', date: '2026-09-05' })
    const row = await db.query.expenses.findFirst({ where: eq(schema.expenses.id, expense.id) })
    expect(row).toMatchObject({ category: 'Bydlení', subcategory: 'Elektřina', date: '2026-09-05' })
  })

  it('refuses what the form should never send', async () => {
    await expect(addExpenseAction({ amount: 0, note: '', category: 'Auto', subcategory: null, date: '2026-09-05' })).rejects.toThrow('Zadejte částku větší než 0.')
    await expect(addExpenseAction({ amount: 10, note: '', category: 'Auto', subcategory: 'Elektřina', date: '2026-09-05' })).rejects.toThrow('Podkategorie nepatří')
    await expect(addExpenseAction({ amount: 10, note: '', category: 'Auto', subcategory: null, date: '2999-01-01' })).rejects.toThrow('v budoucnosti')
    expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })).toHaveLength(0)
  })
})

describe('updateExpenseAction and deleteExpenseAction', () => {
  it("correct and remove the household's own expense", async () => {
    const { expense } = await addExpenseAction({ amount: 1200, note: 'Tankování', category: 'Auto', subcategory: 'Palivo', date: '2026-09-10' })
    const { expense: updated } = await updateExpenseAction(expense.id, { amount: 1250, note: 'Tankování Shell', category: 'Auto', subcategory: 'Palivo', date: '2026-09-09' })
    expect(updated).toMatchObject({ id: expense.id, amount: 1250, note: 'Tankování Shell', date: '2026-09-09' })

    await deleteExpenseAction(expense.id)
    expect(await db.query.expenses.findFirst({ where: eq(schema.expenses.id, expense.id) })).toBeUndefined()
  })

  it("never touch another household's expense", async () => {
    const { expense } = await addExpenseAction({ amount: 300, note: 'Cizí', category: 'Ostatní', subcategory: null, date: '2026-09-10' })
    const [other] = await db.insert(schema.households).values({ name: '__test_household_budget_other__' }).returning()
    createdHouseholdIds.push(other.id)
    currentHouseholdId = other.id
    await expect(updateExpenseAction(expense.id, { amount: 1, note: '', category: 'Ostatní', subcategory: null, date: '2026-09-10' })).rejects.toThrow('Výdaj nebyl nalezen.')
    await expect(deleteExpenseAction(expense.id)).rejects.toThrow('Výdaj nebyl nalezen.')
    const row = await db.query.expenses.findFirst({ where: eq(schema.expenses.id, expense.id) })
    expect(Number(row?.amount)).toBe(300)
  })
})

describe('category limits', () => {
  it('sets, changes and removes a category limit', async () => {
    expect(await setCategoryBudgetAction('Auto', 5000)).toEqual({ Auto: 5000 })
    expect(await setCategoryBudgetAction('Auto', 4500.555)).toEqual({ Auto: 4500.56 })
    expect(await setCategoryBudgetAction('Bydlení', 15000)).toEqual({ Auto: 4500.56, Bydlení: 15000 })
    expect(await setCategoryBudgetAction('Auto', null)).toEqual({ Bydlení: 15000 })
  })

  it('refuses an unknown category and an amount that is not positive', async () => {
    await expect(setCategoryBudgetAction('Kasino', 100)).rejects.toThrow('Neznámá kategorie výdaje.')
    await expect(setCategoryBudgetAction('Auto', 0)).rejects.toThrow('Limit musí být částka větší než 0.')
    await expect(setCategoryBudgetAction('Auto', Number.NaN)).rejects.toThrow('Limit musí být částka větší než 0.')
  })

  it('notifies once when a category crosses 80 % and 100 % of its limit, in its own words', async () => {
    await setCategoryBudgetAction('Auto', 500)
    // The overall budget of this test household is 1000; the Auto limit 500 crosses first.
    const first = await addExpenseAction({ amount: 300, note: '', category: 'Auto', subcategory: 'Palivo', date: '2026-09-10' })
    expect(first.notifications).toEqual([])
    const reached = await addExpenseAction({ amount: 110, note: '', category: 'Auto', subcategory: 'Palivo', date: '2026-09-11' }) // 410 = 82 % of 500
    expect(reached.notifications.map((entry) => entry.title)).toEqual(['Auto: 80 % limitu'])
    const over = await addExpenseAction({ amount: 100, note: '', category: 'Auto', subcategory: 'Servis a opravy', date: '2026-09-12' }) // 510
    expect(over.notifications.map((entry) => entry.title)).toEqual(['Auto: limit překročen'])
    // Another category takes the whole month past 80 % of the overall budget: only that one speaks.
    const overall = await addExpenseAction({ amount: 300, note: '', category: 'Zdraví', subcategory: null, date: '2026-09-12' }) // 810 of 1000
    expect(overall.notifications.map((entry) => entry.title)).toEqual(['Blížíte se limitu rozpočtu'])
    const again = await addExpenseAction({ amount: 10, note: '', category: 'Auto', subcategory: null, date: '2026-09-13' })
    expect(again.notifications).toEqual([])
  })

  it("never touches another household's limits", async () => {
    await setCategoryBudgetAction('Zdraví', 700)
    const [other] = await db.insert(schema.households).values({ name: '__test_household_budget_limits__' }).returning()
    createdHouseholdIds.push(other.id)
    currentHouseholdId = other.id
    expect(await setCategoryBudgetAction('Auto', 100)).toEqual({ Auto: 100 })
  })
})

describe('budget thresholds follow the household\'s budget period', () => {
  it('counts a period that starts on the 28th across the month boundary, and starts from zero on the next 28th', async () => {
    await db.update(schema.households).set({ budgetPeriodStartDay: 28 }).where(eq(schema.households.id, householdId))
    // 28 Aug – 27 Sep is one period: 700 on 30 Aug plus 150 on 5 Sep is 85 % of 1 000.
    await addExpenseAction({ amount: 700, note: '', category: 'Potraviny', subcategory: null, date: '2026-08-30' })
    const crossing = await addExpenseAction({ amount: 150, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-05' })
    expect(crossing.notifications.map((entry) => entry.title)).toEqual(['Blížíte se limitu rozpočtu'])

    // 27 Aug belongs to the period before, so it does not count towards this one (700 + 150 + 200 = 105 % once added below).
    const earlier = await addExpenseAction({ amount: 900, note: '', category: 'Potraviny', subcategory: null, date: '2026-08-27' })
    expect(earlier.notifications.map((entry) => entry.title)).toEqual(['Blížíte se limitu rozpočtu'])
    const later = await addExpenseAction({ amount: 200, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-06' })
    expect(later.notifications.map((entry) => entry.title)).toEqual(['Rozpočet byl překročen'])
  })
})

describe('budget by period', () => {
  const current = periodStart(todayInPrague())
  const next = nextPeriodStart(current)

  it('sets the current and next period budget, back to the default with null, never a finished period', async () => {
    expect(await setPeriodBudgetAction(next, 1500)).toEqual({ [next]: 1500 })
    expect(await setPeriodBudgetAction(current, 800)).toEqual({ [next]: 1500, [current]: 800 })
    expect(await setPeriodBudgetAction(current, 900)).toEqual({ [next]: 1500, [current]: 900 })
    expect(await setPeriodBudgetAction(next, null)).toEqual({ [current]: 900 })
    await expect(setPeriodBudgetAction('2020-01-01', 100)).rejects.toThrow('aktuální a příští')
    await expect(setPeriodBudgetAction(current, -1)).rejects.toThrow()
  })

  it("checks the thresholds against the period's own budget", async () => {
    await setPeriodBudgetAction(current, 500)
    const { notifications } = await addExpenseAction({ amount: 450, note: '', category: 'Potraviny', subcategory: null, date: todayInPrague() })
    // 450 is 45 % of the default 1 000 but 90 % of this period's 500.
    expect(notifications.map((entry) => entry.title)).toEqual(['Blížíte se limitu rozpočtu'])
  })

  it('stores the savings goal and refuses a negative one', async () => {
    expect(await setSavingsGoalAction(2500.556)).toBe(2500.56)
    const row = await db.query.households.findFirst({ where: eq(schema.households.id, householdId) })
    expect(Number(row?.savingsGoal)).toBe(2500.56)
    await expect(setSavingsGoalAction(-5)).rejects.toThrow()
  })

  it("returns daily totals and a past period's expenses, only the household's own", async () => {
    await addExpenseAction({ amount: 100, note: '', category: 'Potraviny', subcategory: null, date: '2026-08-03' })
    await addExpenseAction({ amount: 50.5, note: '', category: 'Drogerie', subcategory: null, date: '2026-08-03' })
    await addExpenseAction({ amount: 70, note: '', category: 'Potraviny', subcategory: null, date: '2026-09-01' })
    expect(await getBudgetHistoryAction()).toEqual([
      { date: '2026-08-03', total: 150.5 },
      { date: '2026-09-01', total: 70 },
    ])
    expect((await getPeriodExpensesAction('2026-08-20')).map((expense) => expense.amount).sort((a, b) => a - b)).toEqual([50.5, 100])

    const [other] = await db.insert(schema.households).values({ name: '__test_household_budget_history__' }).returning()
    createdHouseholdIds.push(other.id)
    currentHouseholdId = other.id
    expect(await getBudgetHistoryAction()).toEqual([])
    expect(await getPeriodExpensesAction('2026-08-01')).toEqual([])
  })
})
