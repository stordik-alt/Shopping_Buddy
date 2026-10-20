'use server'

import { and, asc, eq, inArray } from 'drizzle-orm'
import { requireHousehold, requireHouseholdId } from '@/lib/auth/authorize'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isRecurringIncomeDueDate, recurringIncomeOverview, validateRecurringIncomeInput, type RecurringIncome, type RecurringIncomeInput, type RecurringIncomeOccurrence } from '@/lib/recurring-incomes'
import { isIsoDate, validateIncomeInput, validateReceivedDate } from '@/lib/income-input'
import { todayInPrague } from '@/lib/today'
import type { Income } from '@/lib/types'

type RecurringIncomeRow = typeof schema.recurringIncomes.$inferSelect

function toRecurringIncome(row: RecurringIncomeRow): RecurringIncome {
  return {
    id: row.id,
    description: row.description,
    expectedAmount: Number(row.expectedAmount),
    intervalMonths: row.intervalMonths as RecurringIncome['intervalMonths'],
    startDate: row.startDate,
    active: row.active,
  }
}

async function ownRecurringIncome(householdId: string, id: string): Promise<RecurringIncomeRow> {
  const row = await getDb().query.recurringIncomes.findFirst({
    where: and(eq(schema.recurringIncomes.id, id), eq(schema.recurringIncomes.householdId, householdId)),
  })
  if (!row) throw new Error('Pravidelný příjem nebyl nalezen.')
  return row
}

function validOrThrow(input: RecurringIncomeInput) {
  const result = validateRecurringIncomeInput(input, todayInPrague())
  if ('error' in result) throw new Error(result.error)
  return result.income
}

export async function getRecurringIncomeOverviewAction(): Promise<{
  payments: RecurringIncome[]
  due: { income: RecurringIncome; dueDate: string }[]
  upcoming: { income: RecurringIncome; dueDate: string }[]
}> {
  const householdId = await requireHouseholdId()
  const db = getDb()
  const rows = await db.query.recurringIncomes.findMany({
    where: eq(schema.recurringIncomes.householdId, householdId),
    orderBy: [asc(schema.recurringIncomes.startDate), asc(schema.recurringIncomes.description)],
  })
  const ids = rows.map((row) => row.id)
  const occurrenceRows = ids.length
    ? await db.query.recurringIncomeOccurrences.findMany({
        where: inArray(schema.recurringIncomeOccurrences.recurringIncomeId, ids),
      })
    : []
  const occurrences: RecurringIncomeOccurrence[] = occurrenceRows.map((row) => ({
    recurringIncomeId: row.recurringIncomeId,
    dueDate: row.dueDate,
    status: row.status as RecurringIncomeOccurrence['status'],
  }))
  const payments = rows.map(toRecurringIncome)
  return { payments, ...recurringIncomeOverview(payments, occurrences, todayInPrague()) }
}

export async function saveRecurringIncomeAction(input: RecurringIncomeInput, incomeId?: string): Promise<RecurringIncome> {
  const { householdId, memberId } = await requireHousehold()
  const income = validOrThrow(input)
  const db = getDb()
  const values = {
    description: income.description,
    expectedAmount: income.expectedAmount.toString(),
    intervalMonths: income.intervalMonths,
    startDate: income.startDate,
  }
  let row: RecurringIncomeRow
  if (incomeId) {
    await ownRecurringIncome(householdId, incomeId)
    const [updated] = await db.update(schema.recurringIncomes)
      .set(values)
      .where(and(eq(schema.recurringIncomes.id, incomeId), eq(schema.recurringIncomes.householdId, householdId)))
      .returning()
    row = updated
  } else {
    const [created] = await db.insert(schema.recurringIncomes)
      .values({ householdId, ...values })
      .returning()
    row = created
  }
  await recordAudit({ householdId, memberId }, incomeId ? 'recurring_income.updated' : 'recurring_income.added', {
    expectedAmount: income.expectedAmount,
    intervalMonths: income.intervalMonths,
    startDate: income.startDate,
  }, row.id)
  return toRecurringIncome(row)
}

/** Stops future reminders and forecasts; all already received income rows remain in history. */
export async function stopRecurringIncomeAction(incomeId: string): Promise<void> {
  const { householdId, memberId } = await requireHousehold()
  const existing = await ownRecurringIncome(householdId, incomeId)
  await getDb().update(schema.recurringIncomes)
    .set({ active: false })
    .where(and(eq(schema.recurringIncomes.id, incomeId), eq(schema.recurringIncomes.householdId, householdId)))
  await recordAudit({ householdId, memberId }, 'recurring_income.stopped', { description: existing.description }, incomeId)
}

/** Confirms one due occurrence as a separate actual income row. The unique occurrence key prevents races. */
export async function confirmRecurringIncomeAction(
  incomeId: string,
  dueDate: string,
  received: { amount: number; date: string },
): Promise<{ income: Income; dueDate: string }> {
  const { householdId, memberId } = await requireHousehold()
  const row = await ownRecurringIncome(householdId, incomeId)
  if (!row.active) throw new Error('Tento pravidelný příjem je zastavený.')
  if (!isIsoDate(dueDate) || !isRecurringIncomeDueDate(toRecurringIncome(row), dueDate)) throw new Error('V tento den není příjem očekáván.')
  const today = todayInPrague()
  if (dueDate > today) throw new Error('Příjem lze potvrdit až v den očekávaného přijetí.')
  const handled = await getDb().query.recurringIncomeOccurrences.findFirst({
    where: and(eq(schema.recurringIncomeOccurrences.recurringIncomeId, incomeId), eq(schema.recurringIncomeOccurrences.dueDate, dueDate)),
  })
  if (handled) throw new Error(handled.status === 'received' ? 'Tento příjem už byl potvrzen.' : 'Tento termín příjmu už byl přeskočen.')
  const dateError = validateReceivedDate(received.date, today)
  if (dateError) throw new Error(dateError)
  const checked = validateIncomeInput({
    amount: received.amount,
    description: row.description,
    date: received.date,
    status: 'actual',
  }, today)
  if ('error' in checked) throw new Error(checked.error)
  const income = checked.income
  const db = getDb()
  const actualIncomeId = crypto.randomUUID()
  try {
    await db.batch([
      db.insert(schema.incomes).values({
        id: actualIncomeId,
        householdId,
        amount: income.amount.toString(),
        description: income.description,
        date: income.date,
        status: 'actual',
      }),
      db.insert(schema.recurringIncomeOccurrences).values({
        recurringIncomeId: incomeId,
        dueDate,
        status: 'received',
        incomeId: actualIncomeId,
      }),
    ])
  } catch (err) {
    if (String(err).includes('recurring_income_occurrences_recurring_income_id_due_date_pk')) {
      throw new Error('Tento příjem už mezitím potvrdil někdo jiný.')
    }
    throw err
  }
  await recordAudit({ householdId, memberId }, 'recurring_income.received', {
    expectedAmount: Number(row.expectedAmount),
    actualAmount: income.amount,
    dueDate,
    receivedDate: income.date,
  }, actualIncomeId)
  return {
    income: { id: actualIncomeId, amount: income.amount, description: income.description, date: income.date, status: 'actual' },
    dueDate,
  }
}

/** Records that no money arrived for this occurrence, so it is not offered repeatedly. */
export async function skipRecurringIncomeAction(incomeId: string, dueDate: string): Promise<RecurringIncomeOccurrence> {
  const { householdId, memberId } = await requireHousehold()
  const row = await ownRecurringIncome(householdId, incomeId)
  if (!row.active) throw new Error('Tento pravidelný příjem je zastavený.')
  if (!isIsoDate(dueDate) || !isRecurringIncomeDueDate(toRecurringIncome(row), dueDate)) throw new Error('V tento den není příjem očekáván.')
  if (dueDate > todayInPrague()) throw new Error('Budoucí termín nelze přeskočit.')
  const inserted = await getDb().insert(schema.recurringIncomeOccurrences)
    .values({ recurringIncomeId: incomeId, dueDate, status: 'skipped', incomeId: null })
    .onConflictDoNothing()
    .returning()
  if (inserted.length === 0) throw new Error('Tento termín už mezitím vyřídil někdo jiný.')
  await recordAudit({ householdId, memberId }, 'recurring_income.skipped', { dueDate }, incomeId)
  return { recurringIncomeId: incomeId, dueDate, status: 'skipped' }
}
