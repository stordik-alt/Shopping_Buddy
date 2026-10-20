import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'
import { remindDueRecurringIncomes } from '@/lib/db/recurring-income-reminders'

let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner', memberId: '00000000-0000-4000-8000-000000000002' }),
}))

import { getPeriodIncomesAction } from '@/app/actions/incomes'
import {
  confirmRecurringIncomeAction,
  saveRecurringIncomeAction,
  skipRecurringIncomeAction,
  stopRecurringIncomeAction,
} from '@/app/actions/recurring-incomes'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string

async function createHousehold() {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_recurring_incomes__', monthlyBudget: '1000' }).returning()
  createdHouseholdIds.push(household.id)
  return household.id
}

beforeEach(async () => {
  householdId = await createHousehold()
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.notifications).where(eq(schema.notifications.householdId, id))
    await db.delete(schema.incomes).where(eq(schema.incomes.householdId, id))
    await db.delete(schema.recurringIncomes).where(eq(schema.recurringIncomes.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('recurring income reminders', () => {
  it('notifies the household once on the expected date and respects handled occurrences', async () => {
    const today = todayInPrague()
    await saveRecurringIncomeAction({ description: 'Výplata', expectedAmount: 30_000, intervalMonths: 1, startDate: today })
    expect(await remindDueRecurringIncomes(db, today)).toEqual({ households: 1, incomes: 1 })
    expect(await remindDueRecurringIncomes(db, today)).toEqual({ households: 0, incomes: 0 })
    const notifications = await db.query.notifications.findMany({ where: eq(schema.notifications.householdId, householdId) })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ title: 'Dnes očekáváte pravidelný příjem', kind: 'recurring_income' })
  })

  it('does not remind after the occurrence was received or skipped', async () => {
    const today = todayInPrague()
    const schedule = await saveRecurringIncomeAction({ description: 'Výplata', expectedAmount: 30_000, intervalMonths: 1, startDate: today })
    await confirmRecurringIncomeAction(schedule.id, today, { amount: 29_500, date: today })
    expect(await remindDueRecurringIncomes(db, today)).toEqual({ households: 0, incomes: 0 })
    expect(await db.query.notifications.findMany({ where: eq(schema.notifications.householdId, householdId) })).toEqual([])
  })
})

describe('recurring income confirmation', () => {
  it('adds expected occurrences to the budget forecast and replaces them with actual receipts', async () => {
    const today = todayInPrague()
    const schedule = await saveRecurringIncomeAction({
      description: 'Příspěvek na bydlení',
      expectedAmount: 4_000,
      intervalMonths: 1,
      startDate: today,
    })
    const planned = await getPeriodIncomesAction(today)
    expect(planned).toContainEqual(expect.objectContaining({
      recurringIncomeId: schedule.id,
      occurrenceDueDate: today,
      amount: 4_000,
      status: 'planned',
    }))

    await confirmRecurringIncomeAction(schedule.id, today, { amount: 4_250, date: today })
    const actual = await getPeriodIncomesAction(today)
    expect(actual).toContainEqual(expect.objectContaining({
      recurringIncomeId: schedule.id,
      occurrenceDueDate: today,
      amount: 4_250,
      status: 'actual',
    }))
    expect(actual.filter((income) => income.recurringIncomeId === schedule.id)).toHaveLength(1)
  })

  it('stores the actual received amount as a separate historical income row', async () => {
    const today = todayInPrague()
    const schedule = await saveRecurringIncomeAction({
      description: 'Příspěvek na bydlení',
      expectedAmount: 4_000,
      intervalMonths: 1,
      startDate: today,
    })
    const result = await confirmRecurringIncomeAction(schedule.id, today, { amount: 4_250, date: today })
    expect(result.income).toMatchObject({ amount: 4_250, description: 'Příspěvek na bydlení', status: 'actual', date: today })
    const rows = await db.query.incomes.findMany({ where: eq(schema.incomes.householdId, householdId) })
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].amount)).toBe(4_250)
    await expect(confirmRecurringIncomeAction(schedule.id, today, { amount: 4_250, date: today })).rejects.toThrow('už byl potvrzen')
    expect(await db.query.incomes.findMany({ where: eq(schema.incomes.householdId, householdId) })).toHaveLength(1)
  })

  it('does not allow a future occurrence to be received', async () => {
    const schedule = await saveRecurringIncomeAction({
      description: 'Výplata',
      expectedAmount: 30_000,
      intervalMonths: 1,
      startDate: todayInPrague(),
    })
    const future = '2999-01-01'
    await expect(confirmRecurringIncomeAction(schedule.id, future, { amount: 30_000, date: future })).rejects.toThrow()
  })

  it('can skip an occurrence only once', async () => {
    const today = todayInPrague()
    const schedule = await saveRecurringIncomeAction({
      description: 'Výplata',
      expectedAmount: 30_000,
      intervalMonths: 1,
      startDate: today,
    })
    await skipRecurringIncomeAction(schedule.id, today)
    await expect(skipRecurringIncomeAction(schedule.id, today)).rejects.toThrow('vyřídil někdo jiný')
    expect(await db.query.incomes.findMany({ where: eq(schema.incomes.householdId, householdId) })).toHaveLength(0)
  })

  it('stopping a schedule preserves previously received income', async () => {
    const today = todayInPrague()
    const schedule = await saveRecurringIncomeAction({
      description: 'Výplata',
      expectedAmount: 30_000,
      intervalMonths: 1,
      startDate: today,
    })
    await confirmRecurringIncomeAction(schedule.id, today, { amount: 29_500, date: today })
    await stopRecurringIncomeAction(schedule.id)
    const saved = await db.query.recurringIncomes.findFirst({ where: and(eq(schema.recurringIncomes.id, schedule.id), eq(schema.recurringIncomes.householdId, householdId)) })
    expect(saved?.active).toBe(false)
    expect(await db.query.incomes.findMany({ where: eq(schema.incomes.householdId, householdId) })).toHaveLength(1)
  })

  it('does not allow a different household to operate the schedule', async () => {
    const schedule = await saveRecurringIncomeAction({
      description: 'Výplata',
      expectedAmount: 30_000,
      intervalMonths: 1,
      startDate: todayInPrague(),
    })
    currentHouseholdId = await createHousehold()
    await expect(stopRecurringIncomeAction(schedule.id)).rejects.toThrow('nebyl nalezen')
  })
})
