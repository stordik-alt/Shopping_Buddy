import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { dueDateAt } from '@/lib/recurring-payments'
import { todayInPrague } from '@/lib/today'

// Recurring payments against the real test database: only the caller's household, a due date becomes
// an expense only when confirmed, and each due date is dealt with once.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { deleteExpenseAction } from '@/app/actions/budget'
import { confirmRecurringPaymentAction, saveRecurringPaymentAction, skipRecurringPaymentAction, stopRecurringPaymentAction } from '@/app/actions/recurring'
import { remindDueRecurringPayments } from '@/lib/db/recurring-reminders'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string
const today = todayInPrague()
// Due dates relative to the real date, so the tests hold whenever they run.
const lastMonth = dueDateAt(today, 1, -1)
const nextMonth = dueDateAt(today, 1, 1)

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_recurring__', monthlyBudget: '100000' }).returning()
  householdId = household.id
  createdHouseholdIds.push(householdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.notifications).where(eq(schema.notifications.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

const rent = (startDate = lastMonth) => ({ name: 'Nájem', category: 'Bydlení', subcategory: 'Nájem nebo hypotéka', amount: 12000, intervalMonths: 1, startDate })

describe('recurring payments', () => {
  it('saves a payment and refuses what the form should never send', async () => {
    const payment = await saveRecurringPaymentAction(rent())
    expect(payment).toMatchObject({ name: 'Nájem', category: 'Bydlení', amount: 12000, intervalMonths: 1, startDate: lastMonth, active: true })
    await expect(saveRecurringPaymentAction({ ...rent(), intervalMonths: 2 })).rejects.toThrow('Neznámý interval platby.')
    await expect(saveRecurringPaymentAction({ ...rent(), subcategory: 'Palivo' })).rejects.toThrow('Podkategorie nepatří')
    await expect(saveRecurringPaymentAction({ ...rent(), name: '  ' })).rejects.toThrow('Zadejte název platby.')
  })

  it('turns a confirmed due date into one expense, once', async () => {
    const payment = await saveRecurringPaymentAction(rent())
    const { expense, occurrence } = await confirmRecurringPaymentAction(payment.id, lastMonth, { amount: 12150, date: lastMonth })
    expect(expense).toMatchObject({ amount: 12150, category: 'Bydlení', subcategory: 'Nájem nebo hypotéka', note: 'Nájem', date: lastMonth })
    expect(occurrence).toEqual({ recurringPaymentId: payment.id, dueDate: lastMonth, status: 'paid' })
    await expect(confirmRecurringPaymentAction(payment.id, lastMonth, { amount: 12150, date: lastMonth })).rejects.toThrow('Tato platba už je zaplacená.')
    expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })).toHaveLength(1)
  })

  it('reopens a due date when its expense is deleted', async () => {
    const payment = await saveRecurringPaymentAction(rent())
    const { expense } = await confirmRecurringPaymentAction(payment.id, lastMonth, { amount: 12000, date: lastMonth })
    await deleteExpenseAction(expense.id)
    const again = await confirmRecurringPaymentAction(payment.id, lastMonth, { amount: 12000, date: lastMonth })
    expect(again.occurrence.status).toBe('paid')
  })

  it('skips a due date without counting anything', async () => {
    const payment = await saveRecurringPaymentAction(rent())
    expect(await skipRecurringPaymentAction(payment.id, lastMonth)).toEqual({ recurringPaymentId: payment.id, dueDate: lastMonth, status: 'skipped' })
    await expect(skipRecurringPaymentAction(payment.id, lastMonth)).rejects.toThrow('Tato platba už je přeskočená.')
    expect(await db.query.expenses.findMany({ where: eq(schema.expenses.householdId, householdId) })).toEqual([])
  })

  it('refuses a day that is not a due date, and a due date still to come', async () => {
    const payment = await saveRecurringPaymentAction(rent())
    // A monthly payment is due once a month, so another day of the same month is not a due date.
    const notDue = `${lastMonth.slice(0, 8)}${lastMonth.endsWith('-01') ? '02' : '01'}`
    await expect(confirmRecurringPaymentAction(payment.id, notDue, { amount: 1, date: lastMonth })).rejects.toThrow('V tento den platba není splatná.')
    await expect(confirmRecurringPaymentAction(payment.id, nextMonth, { amount: 1, date: today })).rejects.toThrow('Platbu lze potvrdit až v den splatnosti.')
  })

  it('stops a payment, which then offers nothing more', async () => {
    const payment = await saveRecurringPaymentAction(rent())
    await stopRecurringPaymentAction(payment.id)
    await expect(confirmRecurringPaymentAction(payment.id, lastMonth, { amount: 1, date: lastMonth })).rejects.toThrow('Tato pravidelná platba je zastavená.')
  })

  it("never touches another household's payment", async () => {
    const payment = await saveRecurringPaymentAction(rent())
    const [other] = await db.insert(schema.households).values({ name: '__test_household_recurring_other__' }).returning()
    createdHouseholdIds.push(other.id)
    currentHouseholdId = other.id
    await expect(confirmRecurringPaymentAction(payment.id, lastMonth, { amount: 1, date: lastMonth })).rejects.toThrow('Pravidelná platba nebyla nalezena.')
    await expect(saveRecurringPaymentAction(rent(), payment.id)).rejects.toThrow('Pravidelná platba nebyla nalezena.')
    await expect(stopRecurringPaymentAction(payment.id)).rejects.toThrow('Pravidelná platba nebyla nalezena.')
  })
})

describe('the morning reminder', () => {
  it('reminds a household of a payment due today, once', async () => {
    const payment = await saveRecurringPaymentAction(rent(today))
    await remindDueRecurringPayments(db, today)
    const notifications = await db.query.notifications.findMany({ where: eq(schema.notifications.householdId, householdId) })
    expect(notifications.map((entry) => entry.title)).toEqual(['Dnes je splatná platba'])
    expect(notifications[0].detail).toContain('Nájem')

    await remindDueRecurringPayments(db, today)
    expect(await db.query.notifications.findMany({ where: eq(schema.notifications.householdId, householdId) })).toHaveLength(1)
    const row = await db.query.recurringPayments.findFirst({ where: eq(schema.recurringPayments.id, payment.id) })
    expect(row?.remindedDueDate).toBe(today)
  })
})
