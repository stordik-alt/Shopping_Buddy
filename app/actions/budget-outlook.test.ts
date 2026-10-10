import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Integration tests against the test database: the outlook for the periods ahead and the planned
// transfer between periods (docs/15_BUDGET_PERIODS.md §14, §16). Every household uses calendar months.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { getBudgetOutlookAction, setPlannedCarryAction } from '@/app/actions/budget-outlook'
import { closePeriodAction } from '@/app/actions/period-closing'
import { addPocketAction, getBudgetLedgerAction, transferToPocketAction } from '@/app/actions/pockets'
import { nextPeriodStartFor, periodStartFor, previousPeriodStartFor, type PeriodConfig } from '@/lib/budget-period'
import { OUTLOOK_PERIODS } from '@/lib/budget-outlook'
import { todayInPrague } from '@/lib/today'

const db = getDb()
const calendar: PeriodConfig = { type: 'calendar' }
const createdHouseholdIds: string[] = []
let householdId: string

const today = todayInPrague()
const currentStart = periodStartFor(calendar, today)
const nextStart = nextPeriodStartFor(calendar, currentStart)
const previousStart = previousPeriodStartFor(calendar, currentStart)

async function createHousehold() {
  const [household] = await db
    .insert(schema.households)
    .values({ name: '__test_household_outlook__', monthlyBudget: '20000', budgetPeriodType: 'calendar', budgetPeriodStartDay: 1 })
    .returning()
  createdHouseholdIds.push(household.id)
  return household.id
}

const carryRow = (periodStart: string, id = householdId) =>
  db.query.plannedCarries.findFirst({ where: and(eq(schema.plannedCarries.householdId, id), eq(schema.plannedCarries.periodStart, periodStart)) })

beforeEach(async () => {
  householdId = await createHousehold()
  currentHouseholdId = householdId
})

afterAll(async () => {
  // Deleting the household removes everything that belongs to it (ON DELETE CASCADE).
  for (const id of createdHouseholdIds) await db.delete(schema.households).where(eq(schema.households.id, id))
})

describe('planned carry (§14 "Plánovaný převod")', () => {
  it('stores one plan per period, replaces it and clears it with a blank amount', async () => {
    await setPlannedCarryAction(nextStart, 2_000)
    await setPlannedCarryAction(nextStart, 2_500.456)
    expect(Number((await carryRow(nextStart))?.amount)).toBe(2_500.46)
    expect(await db.query.plannedCarries.findMany({ where: eq(schema.plannedCarries.householdId, householdId) })).toHaveLength(1)
    await setPlannedCarryAction(nextStart, null)
    expect(await carryRow(nextStart)).toBeUndefined()
    // Clearing what is not there is fine.
    await setPlannedCarryAction(nextStart, 0)
  })

  it('accepts any date inside the period and stores the period start', async () => {
    await setPlannedCarryAction(today, 1_000)
    expect(await carryRow(currentStart)).toBeDefined()
  })

  it('refuses a finished period, a negative amount and a malformed date', async () => {
    await expect(setPlannedCarryAction(previousStart, 100)).rejects.toThrow('běžné a budoucí')
    await expect(setPlannedCarryAction(currentStart, -5)).rejects.toThrow('od 0 Kč')
    await expect(setPlannedCarryAction('nonsense', 100)).rejects.toThrow('Neplatné')
  })

  it('is kept apart per household', async () => {
    await setPlannedCarryAction(nextStart, 1_000)
    const other = await createHousehold()
    currentHouseholdId = other
    await setPlannedCarryAction(nextStart, 9_000)
    expect(Number((await carryRow(nextStart, householdId))?.amount)).toBe(1_000)
    expect(Number((await carryRow(nextStart, other))?.amount)).toBe(9_000)
  })

  it('is replaced by the real transfer when the period is closed, and pre-fills the closing before that', async () => {
    await db.insert(schema.incomes).values({ householdId, amount: '1000', date: previousStart, status: 'actual' })
    // Planned while that period was still running; planning a finished one is refused above.
    await db.insert(schema.plannedCarries).values({ householdId, periodStart: previousStart, amount: '2000' })
    expect((await getBudgetLedgerAction(currentStart)).toClose).toMatchObject({ periodStart: previousStart, result: 1_000, plannedCarry: 2_000 })

    await closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [], carryOn: 1_000 })
    expect(await carryRow(previousStart)).toBeUndefined()
  })
})

describe('budget outlook (§14, §16)', () => {
  it('covers the running period and a year ahead, each cut by the household’s period', async () => {
    const outlook = await getBudgetOutlookAction()
    expect(outlook.periods).toHaveLength(OUTLOOK_PERIODS)
    expect(outlook.periods[0].periodStart).toBe(currentStart)
    expect(outlook.periods[1].periodStart).toBe(nextStart)
    expect(outlook.periods[0].budget).toBe(20_000)
  })

  it('reports the actual balance and spending of the running period, not planned money', async () => {
    await db.insert(schema.incomes).values({ householdId, amount: '38000', date: today, status: 'actual' })
    await db.insert(schema.incomes).values({ householdId, amount: '5000', date: today, status: 'planned' })
    await db.insert(schema.expenses).values({ householdId, amount: '31200', date: today, category: 'Ostatní' })
    const outlook = await getBudgetOutlookAction()
    expect(outlook).toMatchObject({ actualNow: 6_800, spentNow: 31_200 })
    // The received income is already in the balance; only the planned one is still to come.
    expect(outlook.periods[0]).toMatchObject({ plannedIncome: 5_000, receivedIncome: 0 })
  })

  it('sums planned and received income, unpaid planned expenses and the plan of each period ahead', async () => {
    await db.insert(schema.incomes).values({ householdId, amount: '38000', date: nextStart, status: 'planned' })
    await db.insert(schema.incomes).values({ householdId, amount: '1500', date: nextStart, status: 'actual' })
    await db.insert(schema.plannedExpenses).values({ householdId, amount: '4000', date: nextStart, category: 'Ostatní', status: 'planned' })
    await db.insert(schema.plannedExpenses).values({ householdId, amount: '900', date: nextStart, category: 'Ostatní', status: 'paid' })
    await setPlannedCarryAction(nextStart, 3_000)
    const next = (await getBudgetOutlookAction()).periods[1]
    expect(next).toMatchObject({ periodStart: nextStart, plannedIncome: 38_000, receivedIncome: 1_500, plannedExpenses: 4_000, plannedCarry: 3_000 })
  })

  it('counts a planned Kapsa contribution as still to make in the running period only as far as it is not deposited', async () => {
    await db.insert(schema.incomes).values({ householdId, amount: '10000', date: today, status: 'actual' })
    await addPocketAction({ name: 'Auto', icon: 'piggy-bank', targetAmount: null, targetDate: null, openingAmount: 0, plannedContribution: 2_000 })
    expect((await getBudgetOutlookAction()).periods.map((period) => period.plannedTransfers).slice(0, 2)).toEqual([2_000, 2_000])

    const pocket = (await getBudgetLedgerAction(currentStart)).pockets[0]
    await transferToPocketAction(pocket.id, 500)
    const periods = (await getBudgetOutlookAction()).periods
    // 500 of the 2 000 is already real in the running period; the period ahead has made none.
    expect(periods[0].plannedTransfers).toBe(1_500)
    expect(periods[1].plannedTransfers).toBe(2_000)
  })

  it('does not show another household’s money', async () => {
    await db.insert(schema.incomes).values({ householdId, amount: '777', date: nextStart, status: 'planned' })
    currentHouseholdId = await createHousehold()
    const outlook = await getBudgetOutlookAction()
    expect(outlook.periods[1].plannedIncome).toBe(0)
    expect(outlook.actualNow).toBe(0)
  })
})
