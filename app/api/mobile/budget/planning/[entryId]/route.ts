import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { notifyBudgetThresholds, periodSpending } from '@/lib/db/budget-notify'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isIsoDate, validateIncomeInput, validateReceivedDate } from '@/lib/income-input'
import { isRecurringIncomeDueDate, type RecurringIncome } from '@/lib/recurring-incomes'
import { validateExpenseInput } from '@/lib/expense-input'
import { validatePlannedExpenseInput } from '@/lib/planned-expense-input'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Context = { params: Promise<{ entryId: string }> }

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    if (!body || typeof body.kind !== 'string' || typeof body.action !== 'string') return json({ error: 'invalid_request' }, 400)
    const { entryId } = await context.params
    const db = getDb()
    const today = todayInPrague()

    if (body.kind === 'income') {
      const recurringMatch = /^recurring-income:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/i.exec(entryId)
      if (recurringMatch && body.action === 'receive') {
        const [, scheduleId, dueDate] = recurringMatch
        if (!UUID_PATTERN.test(scheduleId) || !isIsoDate(dueDate)) return json({ error: 'not_found' }, 404)
        const scheduleRow = await db.query.recurringIncomes.findFirst({ where: and(eq(schema.recurringIncomes.id, scheduleId), eq(schema.recurringIncomes.householdId, member.householdId)) })
        if (!scheduleRow || !scheduleRow.active) return json({ error: 'not_found' }, 404)
        const schedule: RecurringIncome = {
          id: scheduleRow.id,
          description: scheduleRow.description,
          expectedAmount: Number(scheduleRow.expectedAmount),
          intervalMonths: scheduleRow.intervalMonths as RecurringIncome['intervalMonths'],
          startDate: scheduleRow.startDate,
          active: scheduleRow.active,
        }
        if (!isRecurringIncomeDueDate(schedule, dueDate) || dueDate > today) return json({ error: 'invalid_due_date', message: 'Příjem lze potvrdit až v očekávaný den.' }, 400)
        const handled = await db.query.recurringIncomeOccurrences.findFirst({ where: and(eq(schema.recurringIncomeOccurrences.recurringIncomeId, scheduleId), eq(schema.recurringIncomeOccurrences.dueDate, dueDate)) })
        if (handled) return json({ error: 'already_handled', message: 'Tento termín příjmu už byl vyřízen.' }, 409)
        const amount = typeof body.amount === 'number' ? body.amount : Number(scheduleRow.expectedAmount)
        const receivedDate = typeof body.date === 'string' ? body.date : today
        const result = validateIncomeInput({ amount, description: scheduleRow.description, date: receivedDate, status: 'actual' }, today)
        if ('error' in result) return json({ error: 'invalid_income', message: result.error }, 400)
        const incomeId = randomUUID()
        try {
          await db.batch([
            db.insert(schema.incomes).values({ id: incomeId, householdId: member.householdId, amount: result.income.amount.toString(), description: result.income.description, date: result.income.date, status: 'actual' }),
            db.insert(schema.recurringIncomeOccurrences).values({ recurringIncomeId: scheduleId, dueDate, status: 'received', incomeId }),
          ])
        } catch (error) {
          if (String(error).includes('recurring_income_occurrences_recurring_income_id_due_date_pk')) return json({ error: 'already_handled', message: 'Tento příjem už mezitím potvrdil někdo jiný.' }, 409)
          throw error
        }
        await recordAudit({ householdId: member.householdId, memberId: member.id }, 'recurring_income.received', {
          expectedAmount: schedule.expectedAmount, actualAmount: result.income.amount, dueDate, receivedDate: result.income.date,
        }, incomeId)
        return json({ income: { id: incomeId, amount: result.income.amount, description: result.income.description, date: result.income.date, status: 'actual', recurringIncomeId: scheduleId, occurrenceDueDate: dueDate, editable: false } })
      }

      if (!UUID_PATTERN.test(entryId)) return json({ error: 'not_found' }, 404)
      const existing = await db.query.incomes.findFirst({ where: and(eq(schema.incomes.id, entryId), eq(schema.incomes.householdId, member.householdId)) })
      if (!existing) return json({ error: 'not_found' }, 404)
      if (body.action === 'receive') {
        const receivedDate = typeof body.date === 'string' ? body.date : today
        const dateError = validateReceivedDate(receivedDate, today)
        if (dateError) return json({ error: 'invalid_date', message: dateError }, 400)
        const [row] = await db.update(schema.incomes).set({ status: 'actual', date: receivedDate })
          .where(and(eq(schema.incomes.id, entryId), eq(schema.incomes.householdId, member.householdId), eq(schema.incomes.status, 'planned')))
          .returning()
        if (!row) return json({ error: 'already_received', message: 'Tento příjem už byl přijat.' }, 409)
        await recordAudit({ householdId: member.householdId, memberId: member.id }, 'income.received', { amount: Number(row.amount), date: receivedDate }, entryId)
        return json({ income: { id: row.id, amount: Number(row.amount), description: row.description, date: row.date, status: 'actual', editable: true } })
      }
      if (body.action !== 'update') return json({ error: 'invalid_action' }, 400)
      const allowed = ['kind', 'action', 'amount', 'description', 'date']
      if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.amount !== 'number' || typeof body.description !== 'string' || typeof body.date !== 'string') return json({ error: 'invalid_income' }, 400)
      const result = validateIncomeInput({ amount: body.amount, description: body.description, date: body.date, status: existing.status }, today)
      if ('error' in result) return json({ error: 'invalid_income', message: result.error }, 400)
      const [row] = await db.update(schema.incomes).set({ amount: result.income.amount.toString(), description: result.income.description, date: result.income.date })
        .where(and(eq(schema.incomes.id, entryId), eq(schema.incomes.householdId, member.householdId))).returning()
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'income.updated', { amount: result.income.amount, date: result.income.date }, entryId)
      return json({ income: { id: row.id, amount: Number(row.amount), description: row.description, date: row.date, status: row.status, editable: true } })
    }

    if (body.kind === 'plannedExpense') {
      if (!UUID_PATTERN.test(entryId)) return json({ error: 'not_found' }, 404)
      const existing = await db.query.plannedExpenses.findFirst({ where: and(eq(schema.plannedExpenses.id, entryId), eq(schema.plannedExpenses.householdId, member.householdId)) })
      if (!existing) return json({ error: 'not_found' }, 404)
      if (body.action === 'update') {
        if (existing.status !== 'planned') return json({ error: 'already_paid', message: 'Zaplacený výdaj se upravuje mezi výdaji.' }, 409)
        if (Object.keys(body).some((key) => !['kind', 'action', 'amount', 'note', 'category', 'date'].includes(key)) || typeof body.amount !== 'number' || typeof body.note !== 'string' || typeof body.category !== 'string' || typeof body.date !== 'string') return json({ error: 'invalid_planned_expense' }, 400)
        const result = validatePlannedExpenseInput({ amount: body.amount, note: body.note, category: body.category, date: body.date })
        if ('error' in result) return json({ error: 'invalid_planned_expense', message: result.error }, 400)
        const [row] = await db.update(schema.plannedExpenses).set({ amount: result.plannedExpense.amount.toString(), note: result.plannedExpense.note, category: result.plannedExpense.category, date: result.plannedExpense.date })
          .where(and(eq(schema.plannedExpenses.id, entryId), eq(schema.plannedExpenses.householdId, member.householdId), eq(schema.plannedExpenses.status, 'planned'))).returning()
        if (!row) return json({ error: 'already_paid', message: 'Tento výdaj už byl zaplacen.' }, 409)
        return json({ plannedExpense: { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, date: row.date, status: 'planned' } })
      }
      if (body.action !== 'pay') return json({ error: 'invalid_action' }, 400)
      if (Object.keys(body).some((key) => !['kind', 'action', 'amount', 'date'].includes(key)) || (body.amount !== undefined && typeof body.amount !== 'number') || (body.date !== undefined && typeof body.date !== 'string')) return json({ error: 'invalid_request' }, 400)
      const paidDate = typeof body.date === 'string' ? body.date : today
      const result = validateExpenseInput({
        amount: typeof body.amount === 'number' ? body.amount : Number(existing.amount),
        note: existing.note,
        category: existing.category,
        subcategory: null,
        date: paidDate,
      }, today)
      if ('error' in result) return json({ error: 'invalid_expense', message: result.error }, 400)
      const expense = result.expense
      const expenseId = randomUUID()
      const [claimed] = await db.update(schema.plannedExpenses).set({ status: 'paid', expenseId: null })
        .where(and(eq(schema.plannedExpenses.id, entryId), eq(schema.plannedExpenses.householdId, member.householdId), eq(schema.plannedExpenses.status, 'planned'))).returning()
      if (!claimed) return json({ error: 'already_paid', message: 'Tento výdaj už byl zaplacen.' }, 409)
      const before = await periodSpending(db, member.householdId, expense.date)
      try {
        await db.insert(schema.expenses).values({ id: expenseId, householdId: member.householdId, amount: expense.amount.toString(), note: expense.note, category: expense.category, subcategory: expense.subcategory, date: expense.date })
        await db.update(schema.plannedExpenses).set({ expenseId }).where(eq(schema.plannedExpenses.id, entryId))
      } catch (error) {
        await db.update(schema.plannedExpenses).set({ status: 'planned' }).where(eq(schema.plannedExpenses.id, entryId))
        throw error
      }
      const notifications = await notifyBudgetThresholds(db, member.householdId, before, [{ category: expense.category, amount: expense.amount }], user.id)
      return json({ plannedExpense: { id: claimed.id, amount: Number(claimed.amount), note: claimed.note, category: claimed.category, date: claimed.date, status: 'paid' }, notifications })
    }
    return json({ error: 'invalid_kind' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget planning update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const kind = new URL(request.url).searchParams.get('kind')
    const { entryId } = await context.params
    const db = getDb()
    if (kind === 'income') {
      if (!UUID_PATTERN.test(entryId)) return json({ error: 'not_found' }, 404)
      const existing = await db.query.incomes.findFirst({ where: and(eq(schema.incomes.id, entryId), eq(schema.incomes.householdId, member.householdId)) })
      if (!existing) return json({ error: 'not_found' }, 404)
      const linkedOccurrence = await db.query.recurringIncomeOccurrences.findFirst({ where: eq(schema.recurringIncomeOccurrences.incomeId, entryId) })
      if (linkedOccurrence) return json({ error: 'recurring_income', message: 'Příjem z pravidelného plánu nelze smazat samostatně.' }, 409)
      await db.delete(schema.incomes).where(and(eq(schema.incomes.id, entryId), eq(schema.incomes.householdId, member.householdId)))
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'income.deleted', { amount: Number(existing.amount), date: existing.date }, entryId)
      return json({ ok: true })
    }
    if (kind === 'plannedExpense') {
      if (!UUID_PATTERN.test(entryId)) return json({ error: 'not_found' }, 404)
      const existing = await db.query.plannedExpenses.findFirst({ where: and(eq(schema.plannedExpenses.id, entryId), eq(schema.plannedExpenses.householdId, member.householdId)) })
      if (!existing) return json({ error: 'not_found' }, 404)
      if (existing.status !== 'planned') return json({ error: 'already_paid', message: 'Zaplacený výdaj nelze odstranit z plánu.' }, 409)
      await db.delete(schema.plannedExpenses).where(and(eq(schema.plannedExpenses.id, entryId), eq(schema.plannedExpenses.householdId, member.householdId), eq(schema.plannedExpenses.status, 'planned')))
      return json({ ok: true })
    }
    return json({ error: 'invalid_kind' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget planning delete]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
