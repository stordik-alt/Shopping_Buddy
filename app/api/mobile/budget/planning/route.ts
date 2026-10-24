import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { nextPeriodStartFor, periodEndFor, periodStartFor } from '@/lib/budget-period'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { periodConfigOfHousehold } from '@/lib/db/period-config'
import { isIsoDate, validateIncomeInput } from '@/lib/income-input'
import { recurringIncomeDueDatesBetween, type RecurringIncome } from '@/lib/recurring-incomes'
import { validatePlannedExpenseInput } from '@/lib/planned-expense-input'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const db = getDb()
    const household = await db.query.households.findFirst({ where: eq(schema.households.id, member.householdId) })
    if (!household) return json({ error: 'household_not_found' }, 404)
    const config = periodConfigOfHousehold(household)
    const requested = new URL(request.url).searchParams.get('period') ?? todayInPrague()
    if (!isIsoDate(requested)) return json({ error: 'invalid_period' }, 400)
    const start = periodStartFor(config, requested)
    const until = nextPeriodStartFor(config, start)
    const [budgetRow, incomeRows, plannedRows, schedules] = await Promise.all([
      db.query.budgets.findFirst({ where: and(eq(schema.budgets.householdId, member.householdId), eq(schema.budgets.month, start)), columns: { amount: true } }),
      db.query.incomes.findMany({
        where: and(eq(schema.incomes.householdId, member.householdId), gte(schema.incomes.date, start), lt(schema.incomes.date, until)),
        orderBy: [asc(schema.incomes.date), asc(schema.incomes.createdAt)],
      }),
      db.query.plannedExpenses.findMany({
        where: and(eq(schema.plannedExpenses.householdId, member.householdId), gte(schema.plannedExpenses.date, start), lt(schema.plannedExpenses.date, until)),
        orderBy: [asc(schema.plannedExpenses.date), asc(schema.plannedExpenses.createdAt)],
      }),
      db.query.recurringIncomes.findMany({ where: and(eq(schema.recurringIncomes.householdId, member.householdId), eq(schema.recurringIncomes.active, true)) }),
    ])
    const scheduleIds = schedules.map((row) => row.id)
    const occurrences = scheduleIds.length ? await db.query.recurringIncomeOccurrences.findMany({
      where: and(inArray(schema.recurringIncomeOccurrences.recurringIncomeId, scheduleIds), gte(schema.recurringIncomeOccurrences.dueDate, start), lt(schema.recurringIncomeOccurrences.dueDate, until)),
    }) : []
    const handled = new Set(occurrences.map((row) => `${row.recurringIncomeId}|${row.dueDate}`))
    const linkedIncomeIds = incomeRows.map((row) => row.id)
    const linkedOccurrences = linkedIncomeIds.length ? await db.query.recurringIncomeOccurrences.findMany({ where: inArray(schema.recurringIncomeOccurrences.incomeId, linkedIncomeIds) }) : []
    const occurrenceByIncome = new Map(linkedOccurrences.filter((row) => row.incomeId).map((row) => [row.incomeId!, row]))
    const incomes = incomeRows.map((row) => {
      const occurrence = occurrenceByIncome.get(row.id)
      return {
        id: row.id,
        amount: Number(row.amount),
        description: row.description,
        date: row.date,
        status: row.status === 'actual' ? 'actual' : 'planned',
        recurringIncomeId: occurrence?.recurringIncomeId ?? null,
        occurrenceDueDate: occurrence?.dueDate ?? null,
        editable: !occurrence,
      }
    })
    const recurringPlans = schedules.flatMap((row) => {
      const schedule: RecurringIncome = {
        id: row.id,
        description: row.description,
        expectedAmount: Number(row.expectedAmount),
        intervalMonths: row.intervalMonths as RecurringIncome['intervalMonths'],
        startDate: row.startDate,
        active: row.active,
      }
      return recurringIncomeDueDatesBetween(schedule, start, until)
        .filter((date) => date < until && !handled.has(`${schedule.id}|${date}`))
        .map((date) => ({
          id: `recurring-income:${schedule.id}:${date}`,
          amount: schedule.expectedAmount,
          description: schedule.description,
          date,
          status: 'planned' as const,
          recurringIncomeId: schedule.id,
          occurrenceDueDate: date,
          editable: false,
        }))
    })
    const budget = Number(budgetRow?.amount ?? household.monthlyBudget)
    return json({
      period: { start, end: periodEndFor(config, start), next: until },
      currency: household.currency,
      budget,
      incomes: [...incomes, ...recurringPlans].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      plannedExpenses: plannedRows.map((row) => ({ id: row.id, amount: Number(row.amount), note: row.note, category: row.category, date: row.date, status: row.status === 'paid' ? 'paid' : 'planned' })),
    })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget planning]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    if (!body || typeof body.kind !== 'string') return json({ error: 'invalid_request' }, 400)
    const db = getDb()
    if (body.kind === 'income') {
      if (Object.keys(body).some((key) => !['kind', 'amount', 'description', 'date', 'status'].includes(key)) || typeof body.amount !== 'number' || typeof body.description !== 'string' || typeof body.date !== 'string' || typeof body.status !== 'string') {
        return json({ error: 'invalid_income', message: 'Vyplňte částku, popis, datum a stav příjmu.' }, 400)
      }
      const result = validateIncomeInput({ amount: body.amount, description: body.description, date: body.date, status: body.status }, todayInPrague())
      if ('error' in result) return json({ error: 'invalid_income', message: result.error }, 400)
      const [row] = await db.insert(schema.incomes).values({
        householdId: member.householdId,
        amount: result.income.amount.toString(),
        description: result.income.description,
        date: result.income.date,
        status: result.income.status,
      }).returning()
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'income.added', { amount: result.income.amount, date: result.income.date, status: result.income.status }, row.id)
      return json({ income: { id: row.id, amount: Number(row.amount), description: row.description, date: row.date, status: row.status } }, 201)
    }
    if (body.kind === 'plannedExpense') {
      if (Object.keys(body).some((key) => !['kind', 'amount', 'note', 'category', 'date'].includes(key)) || typeof body.amount !== 'number' || typeof body.note !== 'string' || typeof body.category !== 'string' || typeof body.date !== 'string') {
        return json({ error: 'invalid_planned_expense', message: 'Vyplňte částku, popis, kategorii a datum.' }, 400)
      }
      const result = validatePlannedExpenseInput({ amount: body.amount, note: body.note, category: body.category, date: body.date })
      if ('error' in result) return json({ error: 'invalid_planned_expense', message: result.error }, 400)
      const [row] = await db.insert(schema.plannedExpenses).values({
        householdId: member.householdId,
        amount: result.plannedExpense.amount.toString(),
        note: result.plannedExpense.note,
        category: result.plannedExpense.category,
        date: result.plannedExpense.date,
      }).returning()
      return json({ plannedExpense: { id: row.id, amount: Number(row.amount), note: row.note, category: row.category, date: row.date, status: 'planned' } }, 201)
    }
    return json({ error: 'invalid_kind' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget planning add]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
