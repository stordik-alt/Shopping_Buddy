import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { isRecurringIncomeDueDate, validateRecurringIncomeInput, type RecurringIncome, type RecurringIncomeOccurrence } from '@/lib/recurring-incomes'
import { isIsoDate, validateIncomeInput, validateReceivedDate } from '@/lib/income-input'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const toIncome = (row: typeof schema.recurringIncomes.$inferSelect): RecurringIncome => ({
  id: row.id, description: row.description, expectedAmount: Number(row.expectedAmount),
  intervalMonths: row.intervalMonths as RecurringIncome['intervalMonths'], startDate: row.startDate, active: row.active,
})

export async function PATCH(request: Request, { params }: { params: Promise<{ incomeId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { incomeId } = await params
    const db = getDb()
    const existing = await db.query.recurringIncomes.findFirst({ where: and(eq(schema.recurringIncomes.id, incomeId), eq(schema.recurringIncomes.householdId, member.householdId)) })
    if (!existing) return json({ error: 'income_not_found' }, 404)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as Record<string, unknown>).action !== 'string') return json({ error: 'invalid_request' }, 400)
    const input = body as Record<string, unknown>

    if (input.action === 'save') {
      if (Object.keys(input).some((key) => !['action', 'description', 'expectedAmount', 'intervalMonths', 'startDate'].includes(key)) || typeof input.description !== 'string' || typeof input.expectedAmount !== 'number' || typeof input.intervalMonths !== 'number' || typeof input.startDate !== 'string') return json({ error: 'invalid_income' }, 400)
      const checked = validateRecurringIncomeInput({ description: input.description, expectedAmount: input.expectedAmount, intervalMonths: input.intervalMonths, startDate: input.startDate }, todayInPrague())
      if ('error' in checked) return json({ error: 'invalid_income', message: checked.error }, 400)
      const [row] = await db.update(schema.recurringIncomes).set({ ...checked.income, expectedAmount: checked.income.expectedAmount.toString() })
        .where(and(eq(schema.recurringIncomes.id, incomeId), eq(schema.recurringIncomes.householdId, member.householdId))).returning()
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'recurring_income.updated', { expectedAmount: checked.income.expectedAmount, intervalMonths: checked.income.intervalMonths, startDate: checked.income.startDate }, row.id)
      return json({ payment: toIncome(row) })
    }

    if (input.action === 'stop') {
      if (Object.keys(input).length !== 1) return json({ error: 'invalid_request' }, 400)
      await db.update(schema.recurringIncomes).set({ active: false }).where(and(eq(schema.recurringIncomes.id, incomeId), eq(schema.recurringIncomes.householdId, member.householdId)))
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'recurring_income.stopped', { description: existing.description }, incomeId)
      return json({ ok: true })
    }

    if ((input.action === 'confirm' || input.action === 'skip') && typeof input.dueDate === 'string') {
      const allowedKeys = input.action === 'confirm' ? ['action', 'dueDate', 'amount', 'date'] : ['action', 'dueDate']
      const income = toIncome(existing)
      const today = todayInPrague()
      if (Object.keys(input).some((key) => !allowedKeys.includes(key)) || !existing.active || !isIsoDate(input.dueDate) || !isRecurringIncomeDueDate(income, input.dueDate) || input.dueDate > today) return json({ error: 'invalid_occurrence', message: 'Tento příjem není splatný nebo už je vyřízený.' }, 400)
      const handled = await db.query.recurringIncomeOccurrences.findFirst({ where: and(eq(schema.recurringIncomeOccurrences.recurringIncomeId, incomeId), eq(schema.recurringIncomeOccurrences.dueDate, input.dueDate)) })
      if (handled) return json({ error: 'already_handled', message: handled.status === 'received' ? 'Tento příjem už byl potvrzen.' : 'Tento termín příjmu už byl přeskočen.' }, 409)
      if (input.action === 'skip') {
        const [occurrence] = await db.insert(schema.recurringIncomeOccurrences).values({ recurringIncomeId: incomeId, dueDate: input.dueDate, status: 'skipped', incomeId: null }).onConflictDoNothing().returning()
        if (!occurrence) return json({ error: 'already_handled', message: 'Tento termín už mezitím vyřídil někdo jiný.' }, 409)
        await recordAudit({ householdId: member.householdId, memberId: member.id }, 'recurring_income.skipped', { dueDate: input.dueDate }, incomeId)
        return json({ occurrence: { recurringIncomeId: incomeId, dueDate: input.dueDate, status: 'skipped' } satisfies RecurringIncomeOccurrence })
      }
      if (typeof input.amount !== 'number' || typeof input.date !== 'string') return json({ error: 'invalid_income', message: 'Vyplňte skutečně přijatou částku a datum.' }, 400)
      const dateError = validateReceivedDate(input.date, today)
      if (dateError) return json({ error: 'invalid_income', message: dateError }, 400)
      const checked = validateIncomeInput({ amount: input.amount, description: existing.description, date: input.date, status: 'actual' }, today)
      if ('error' in checked) return json({ error: 'invalid_income', message: checked.error }, 400)
      const actualIncomeId = crypto.randomUUID()
      try {
        await db.batch([
          db.insert(schema.incomes).values({ id: actualIncomeId, householdId: member.householdId, amount: checked.income.amount.toString(), description: checked.income.description, date: checked.income.date, status: 'actual' }),
          db.insert(schema.recurringIncomeOccurrences).values({ recurringIncomeId: incomeId, dueDate: input.dueDate, status: 'received', incomeId: actualIncomeId }),
        ])
      } catch (error) {
        if (String(error).includes('recurring_income_occurrences_recurring_income_id_due_date_pk')) return json({ error: 'already_handled', message: 'Tento příjem už mezitím potvrdil někdo jiný.' }, 409)
        throw error
      }
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'recurring_income.received', { expectedAmount: Number(existing.expectedAmount), actualAmount: checked.income.amount, dueDate: input.dueDate, receivedDate: checked.income.date }, actualIncomeId)
      return json({ income: { id: actualIncomeId, amount: checked.income.amount, description: checked.income.description, date: checked.income.date, status: 'actual' }, occurrence: { recurringIncomeId: incomeId, dueDate: input.dueDate, status: 'received' } satisfies RecurringIncomeOccurrence })
    }
    return json({ error: 'invalid_action' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recurring income update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
