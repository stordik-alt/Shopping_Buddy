'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { monthSpending, notifyBudgetThresholds } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { validateExpenseInput } from '@/lib/expense-input'
import { isDueDate, validateRecurringPaymentInput, type RecurringInterval, type RecurringOccurrence, type RecurringPayment, type RecurringPaymentInput } from '@/lib/recurring-payments'
import { todayInPrague } from '@/lib/today'
import type { Expense, Notification } from '@/lib/types'

// Recurring payments (lib/recurring-payments.ts has the rules). Every action works only on the
// caller's own household's payments (CLAUDE.md section 9); a due date counts as an expense only once
// the household confirms it.

type PaymentRow = typeof schema.recurringPayments.$inferSelect

function toPayment(row: PaymentRow): RecurringPayment {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    amount: Number(row.amount),
    intervalMonths: row.intervalMonths as RecurringInterval,
    startDate: row.startDate,
    active: row.active,
  }
}

async function ownPayment(householdId: string, paymentId: string): Promise<PaymentRow> {
  const row = await getDb().query.recurringPayments.findFirst({ where: and(eq(schema.recurringPayments.id, paymentId), eq(schema.recurringPayments.householdId, householdId)) })
  if (!row) throw new Error('Pravidelná platba nebyla nalezena.')
  return row
}

function validOrThrow(input: RecurringPaymentInput) {
  const result = validateRecurringPaymentInput(input, todayInPrague())
  if ('error' in result) throw new Error(result.error)
  return result.payment
}

/** Adds a recurring payment, or — with `paymentId` — changes one. A change applies to the due dates
 *  still to come; the ones already paid keep the expenses they became. */
export async function saveRecurringPaymentAction(input: RecurringPaymentInput, paymentId?: string): Promise<RecurringPayment> {
  const householdId = await requireHouseholdId()
  const payment = validOrThrow(input)
  const db = getDb()
  const values = { ...payment, amount: payment.amount.toString() }
  let row: PaymentRow
  if (paymentId) {
    await ownPayment(householdId, paymentId)
    ;[row] = await db
      .update(schema.recurringPayments)
      .set(values)
      .where(and(eq(schema.recurringPayments.id, paymentId), eq(schema.recurringPayments.householdId, householdId)))
      .returning()
  } else {
    ;[row] = await db.insert(schema.recurringPayments).values({ householdId, ...values }).returning()
  }
  revalidatePath('/')
  return toPayment(row)
}

/** Stops a payment: no more due dates are offered. Its history (paid expenses) stays. */
export async function stopRecurringPaymentAction(paymentId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownPayment(householdId, paymentId)
  await getDb()
    .update(schema.recurringPayments)
    .set({ active: false })
    .where(and(eq(schema.recurringPayments.id, paymentId), eq(schema.recurringPayments.householdId, householdId)))
  revalidatePath('/')
}

/** A due date the household may still deal with: a real due date of an active payment, not after
 *  today, not already paid or skipped. */
async function openDueDate(householdId: string, paymentId: string, dueDate: string): Promise<PaymentRow> {
  const row = await ownPayment(householdId, paymentId)
  if (!row.active) throw new Error('Tato pravidelná platba je zastavená.')
  if (!isDueDate(toPayment(row), dueDate)) throw new Error('V tento den platba není splatná.')
  if (dueDate > todayInPrague()) throw new Error('Platbu lze potvrdit až v den splatnosti.')
  const handled = await getDb().query.recurringPaymentOccurrences.findFirst({
    where: and(eq(schema.recurringPaymentOccurrences.recurringPaymentId, paymentId), eq(schema.recurringPaymentOccurrences.dueDate, dueDate)),
  })
  if (handled) throw new Error(handled.status === 'paid' ? 'Tato platba už je zaplacená.' : 'Tato platba už je přeskočená.')
  return row
}

/** Confirms that a due date was paid: it becomes an expense (the payment's category and name; the
 *  amount and date as actually paid), with the budget's notifications. The expense and the paid mark
 *  are written together, so a double tap or two members at once can never count it twice. */
export async function confirmRecurringPaymentAction(
  paymentId: string,
  dueDate: string,
  paid: { amount: number; date: string },
): Promise<{ expense: Expense; occurrence: RecurringOccurrence; notifications: Notification[] }> {
  const { householdId, userId } = await requireHousehold()
  const row = await openDueDate(householdId, paymentId, dueDate)
  const result = validateExpenseInput({ amount: paid.amount, note: row.name, category: row.category, subcategory: row.subcategory, date: paid.date }, todayInPrague())
  if ('error' in result) throw new Error(result.error)
  const expense = result.expense
  const db = getDb()
  const before = await monthSpending(db, householdId, expense.date)
  const expenseId = crypto.randomUUID()
  try {
    await db.batch([
      db.insert(schema.expenses).values({ id: expenseId, householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, subcategory: expense.subcategory, date: expense.date }),
      db.insert(schema.recurringPaymentOccurrences).values({ recurringPaymentId: paymentId, dueDate, status: 'paid', expenseId }),
    ])
  } catch (err) {
    // The (payment, due date) key: someone else confirmed or skipped it a moment ago.
    if (String(err).includes('recurring_payment_occurrences_recurring_payment_id_due_date_pk')) throw new Error('Tuto platbu už mezitím vyřídil někdo jiný.')
    throw err
  }
  const notifications = await notifyBudgetThresholds(db, householdId, before, [{ category: expense.category, amount: expense.amount }], userId)
  revalidatePath('/')
  return {
    expense: { id: expenseId, ...expense, purchaseId: null },
    occurrence: { recurringPaymentId: paymentId, dueDate, status: 'paid' },
    notifications,
  }
}

/** Marks a due date as not paid this time (e.g. an advance waived); nothing is counted. */
export async function skipRecurringPaymentAction(paymentId: string, dueDate: string): Promise<RecurringOccurrence> {
  const householdId = await requireHouseholdId()
  await openDueDate(householdId, paymentId, dueDate)
  const inserted = await getDb()
    .insert(schema.recurringPaymentOccurrences)
    .values({ recurringPaymentId: paymentId, dueDate, status: 'skipped' })
    .onConflictDoNothing()
    .returning()
  if (inserted.length === 0) throw new Error('Tuto platbu už mezitím vyřídil někdo jiný.')
  revalidatePath('/')
  return { recurringPaymentId: paymentId, dueDate, status: 'skipped' }
}
