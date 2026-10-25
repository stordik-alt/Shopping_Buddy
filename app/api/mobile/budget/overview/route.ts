import { and, asc, eq, gte, isNotNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import { getHouseholdExpenses, getHouseholdPurchaseSavingsByMonth } from '@/lib/db/queries'
import { loadPeriodConfig } from '@/lib/db/period-config'
import { periodOverPeriodChange, previousPeriodStart, projectedPeriodEnd } from '@/lib/budget'
import * as schema from '@/lib/db/schema'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const db = getDb()
    const today = todayInPrague()
    const period = await loadPeriodConfig(db, member.householdId)
    const currentStart = previousPeriodStart(today, period)
    const [currentExpenses, previousRows, savings, mainList, recurringRows] = await Promise.all([
      getHouseholdExpenses(member.householdId, undefined, period),
      db.query.expenses.findMany({ where: and(eq(schema.expenses.householdId, member.householdId), gte(schema.expenses.date, currentStart)), columns: { id: true, amount: true, note: true, category: true, subcategory: true, date: true, purchaseId: true, productId: true, productTypeId: true }, orderBy: asc(schema.expenses.date) }),
      getHouseholdPurchaseSavingsByMonth(member.householdId),
      db.query.shoppingLists.findFirst({ where: eq(schema.shoppingLists.householdId, member.householdId), orderBy: asc(schema.shoppingLists.createdAt), columns: { id: true } }),
      db.select({ expenseId: schema.recurringPaymentOccurrences.expenseId }).from(schema.recurringPaymentOccurrences).innerJoin(schema.recurringPayments, eq(schema.recurringPayments.id, schema.recurringPaymentOccurrences.recurringPaymentId)).where(and(eq(schema.recurringPayments.householdId, member.householdId), gte(schema.recurringPaymentOccurrences.dueDate, currentStart), isNotNull(schema.recurringPaymentOccurrences.expenseId))),
    ])
    const plannedRows = mainList ? await db.query.shoppingListItems.findMany({ where: and(eq(schema.shoppingListItems.listId, mainList.id), eq(schema.shoppingListItems.done, false)), columns: { price: true, quantity: true } }) : []
    const recurringIds = new Set(recurringRows.flatMap((row) => row.expenseId ? [row.expenseId] : []))
    const expenses = [
      ...previousRows.map((row) => ({ ...row, amount: Number(row.amount), isRecurringPayment: false })),
      ...currentExpenses,
    ]
    const paceExpenses = currentExpenses.map((expense) => ({ ...expense, isRecurringPayment: recurringIds.has(expense.id) }))
    const planned = plannedRows.reduce((sum, row) => sum + Number(row.price) * row.quantity, 0)
    return json({
      comparison: periodOverPeriodChange(expenses, today, period),
      projected: projectedPeriodEnd(paceExpenses, today, period),
      planned,
      savings,
    })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget overview]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
