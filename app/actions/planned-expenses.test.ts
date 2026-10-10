import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Integration tests against the test database: planned expenses, the financial reserve and the period
// history (docs/15_BUDGET_PERIODS.md §7–8, §11, §18). Every household uses calendar months.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { addPlannedExpenseAction, deletePlannedExpenseAction, getPeriodPlannedExpensesAction, payPlannedExpenseAction, updatePlannedExpenseAction } from '@/app/actions/planned-expenses'
import { getPeriodHistoryAction } from '@/app/actions/period-history'
import { addPocketAction, getBudgetLedgerAction, updatePocketAction } from '@/app/actions/pockets'
import { periodStartFor, type PeriodConfig } from '@/lib/budget-period'
import { todayInPrague } from '@/lib/today'

const db = getDb()
const calendar: PeriodConfig = { type: 'calendar' }
const createdHouseholdIds: string[] = []
let householdId: string

const today = todayInPrague()
const currentStart = periodStartFor(calendar, today)
const previousStart = (() => {
  const day = new Date(`${currentStart}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return periodStartFor(calendar, day.toISOString().slice(0, 10))
})()

async function createHousehold() {
  const [household] = await db
    .insert(schema.households)
    .values({ name: '__test_household_planned__', monthlyBudget: '1000', budgetPeriodType: 'calendar', budgetPeriodStartDay: 1 })
    .returning()
  createdHouseholdIds.push(household.id)
  return household.id
}

const planned = (over: Partial<Parameters<typeof addPlannedExpenseAction>[0]> = {}) => ({ amount: 4_000, note: 'Servis auta', category: 'Ostatní', date: today, ...over })
const pocketInput = (name: string, over: Partial<Parameters<typeof addPocketAction>[0]> = {}) => ({ name, icon: 'piggy-bank', targetAmount: null, targetDate: null, openingAmount: 0, plannedContribution: null, ...over })

beforeEach(async () => {
  householdId = await createHousehold()
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.periodClosings).where(eq(schema.periodClosings.householdId, id))
    await db.delete(schema.pockets).where(eq(schema.pockets.householdId, id))
    await db.delete(schema.plannedExpenses).where(eq(schema.plannedExpenses.householdId, id))
    await db.delete(schema.expenses).where(eq(schema.expenses.householdId, id))
    await db.delete(schema.incomes).where(eq(schema.incomes.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('planned expenses (§7–8)', () => {
  it('validates, stores and lists a plan without creating a real expense', async () => {
    await expect(addPlannedExpenseAction(planned({ amount: 0 }))).rejects.toThrow('větší než 0')
    await expect(addPlannedExpenseAction(planned({ category: 'Neznámá' }))).rejects.toThrow('kategorie')
    const added = await addPlannedExpenseAction(planned())
    expect(added).toMatchObject({ amount: 4_000, status: 'planned', note: 'Servis auta' })
    expect(await getPeriodPlannedExpensesAction(currentStart)).toHaveLength(1)
    // Planned money is not real: no expense exists.
    expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })).toHaveLength(0)
  })

  it('may be dated in the future, unlike a real expense', async () => {
    const future = new Date(`${today}T00:00:00Z`)
    future.setUTCDate(future.getUTCDate() + 20)
    await addPlannedExpenseAction(planned({ date: future.toISOString().slice(0, 10) }))
  })

  it('changes and removes only a still-planned expense', async () => {
    const added = await addPlannedExpenseAction(planned())
    const updated = await updatePlannedExpenseAction(added.id, planned({ amount: 4_500 }))
    expect(updated.amount).toBe(4_500)
    await payPlannedExpenseAction(added.id)
    await expect(updatePlannedExpenseAction(added.id, planned())).rejects.toThrow('Zaplacený')
    const second = await addPlannedExpenseAction(planned({ note: 'Dárek' }))
    await deletePlannedExpenseAction(second.id)
    expect(await getPeriodPlannedExpensesAction(currentStart)).toHaveLength(1)
  })

  it('paying creates exactly one real expense and links it; a second payment is refused', async () => {
    const added = await addPlannedExpenseAction(planned())
    const result = await payPlannedExpenseAction(added.id, { amount: 3_900, date: today })
    expect(result.expense).toMatchObject({ amount: 3_900, note: 'Servis auta', category: 'Ostatní' })
    expect(result.plannedExpense.status).toBe('paid')
    const expenses = await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })
    expect(expenses).toHaveLength(1)
    const row = await db.query.plannedExpenses.findFirst({ where: eq(schema.plannedExpenses.id, added.id) })
    expect(row?.expenseId).toBe(expenses[0].id)
    await expect(payPlannedExpenseAction(added.id)).rejects.toThrow('už byl zaplacen')
    expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })).toHaveLength(1)
  })

  it('cannot reach another household’s plan', async () => {
    const added = await addPlannedExpenseAction(planned())
    currentHouseholdId = await createHousehold()
    await expect(updatePlannedExpenseAction(added.id, planned())).rejects.toThrow('nebyl nalezen')
    await expect(payPlannedExpenseAction(added.id)).rejects.toThrow('nebyl nalezen')
    await expect(deletePlannedExpenseAction(added.id)).rejects.toThrow('nebyl nalezen')
    expect(await getPeriodPlannedExpensesAction(currentStart)).toHaveLength(0)
  })
})

describe('financial reserve (§11)', () => {
  it('allows one reserve per household: marking another takes the mark from the first', async () => {
    await addPocketAction(pocketInput('Rezerva', { isReserve: true }))
    await addPocketAction(pocketInput('Nová rezerva', { isReserve: true }))
    const pockets = (await getBudgetLedgerAction(currentStart)).pockets
    expect(pockets.filter((pocket) => pocket.isReserve).map((pocket) => pocket.name)).toEqual(['Nová rezerva'])
    const first = pockets.find((pocket) => pocket.name === 'Rezerva')!
    await updatePocketAction(first.id, pocketInput('Rezerva', { isReserve: true }))
    const after = (await getBudgetLedgerAction(currentStart)).pockets
    expect(after.filter((pocket) => pocket.isReserve).map((pocket) => pocket.name)).toEqual(['Rezerva'])
  })

  it('an ordinary Kapsa does not touch the reserve mark', async () => {
    await addPocketAction(pocketInput('Rezerva', { isReserve: true }))
    await addPocketAction(pocketInput('Auto'))
    expect((await getBudgetLedgerAction(currentStart)).pockets.filter((pocket) => pocket.isReserve)).toHaveLength(1)
  })
})

describe('period history (§18)', () => {
  it('is empty for a household with no records', async () => {
    expect(await getPeriodHistoryAction()).toEqual([])
  })

  it('lists past periods with their real money, newest first, and never the current one', async () => {
    await db.insert(schema.incomes).values({ householdId, amount: '38000', date: previousStart, status: 'actual' })
    await db.insert(schema.incomes).values({ householdId, amount: '5000', date: previousStart, status: 'planned' })
    await db.insert(schema.expenses).values({ householdId, amount: '31200', date: previousStart, category: 'Ostatní' })
    await db.insert(schema.expenses).values({ householdId, amount: '700', date: today, category: 'Ostatní' })
    const rows = await getPeriodHistoryAction()
    expect(rows).toHaveLength(1)
    // The planned income is not money; the current period's expense is not history.
    expect(rows[0]).toMatchObject({ periodStart: previousStart, periodEnd: currentStart, received: 38_000, expenses: 31_200, result: 6_800, budget: 1_000, closed: false, carryOut: null })
  })

  it('does not show another household’s periods', async () => {
    await db.insert(schema.expenses).values({ householdId, amount: '100', date: previousStart, category: 'Ostatní' })
    currentHouseholdId = await createHousehold()
    expect(await getPeriodHistoryAction()).toEqual([])
  })
})
