import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Integration tests against the test database: incomes of a budget period, the planned → received
// transition, household scoping, and the household's period config (docs/15_BUDGET_PERIODS.md).
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { getPeriodExpensesAction } from '@/app/actions/budget'
import { addIncomeAction, deleteIncomeAction, getPeriodIncomesAction, markIncomeReceivedAction, updateIncomeAction } from '@/app/actions/incomes'
import { todayInPrague } from '@/lib/today'

const db = getDb()
const createdHouseholdIds: string[] = []
let householdId: string

async function createHousehold(values: Partial<typeof schema.households.$inferInsert> = {}) {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_incomes__', monthlyBudget: '1000', ...values }).returning()
  createdHouseholdIds.push(household.id)
  return household.id
}

beforeEach(async () => {
  householdId = await createHousehold({ budgetPeriodStartDay: 15 })
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    await db.delete(schema.expenses).where(eq(schema.expenses.householdId, id))
    await db.delete(schema.incomes).where(eq(schema.incomes.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('incomes by budget period', () => {
  it('returns only the incomes of the period the date falls in (payday 15th)', async () => {
    await addIncomeAction({ amount: 38_000, description: 'Výplata', date: '2030-10-15', status: 'planned' })
    await addIncomeAction({ amount: 500, description: 'Bonus', date: '2030-11-14', status: 'planned' })
    await addIncomeAction({ amount: 700, description: 'Příští období', date: '2030-11-15', status: 'planned' })
    const incomes = await getPeriodIncomesAction('2030-11-01')
    expect(incomes.map((income) => income.description)).toEqual(['Výplata', 'Bonus'])
  })

  it('rejects a received income dated in the future', async () => {
    await expect(addIncomeAction({ amount: 100, description: '', date: '2999-01-01', status: 'actual' })).rejects.toThrow()
  })
})

describe('planned → received', () => {
  it('flips the same row once and refuses to receive it again', async () => {
    const planned = await addIncomeAction({ amount: 38_000, description: 'Výplata', date: '2030-10-15', status: 'planned' })
    const received = await markIncomeReceivedAction(planned.id)
    expect(received).toMatchObject({ id: planned.id, status: 'actual', date: todayInPrague() })
    await expect(markIncomeReceivedAction(planned.id)).rejects.toThrow('už byl přijat')
    const rows = await db.query.incomes.findMany({ where: eq(schema.incomes.householdId, householdId) })
    expect(rows).toHaveLength(1)
  })

  it('does not accept a received date in the future', async () => {
    const planned = await addIncomeAction({ amount: 100, description: '', date: '2030-10-15', status: 'planned' })
    await expect(markIncomeReceivedAction(planned.id, '2999-01-01')).rejects.toThrow()
    expect((await db.query.incomes.findFirst({ where: eq(schema.incomes.id, planned.id) }))?.status).toBe('planned')
  })

  it('keeps the status when an income is edited', async () => {
    const planned = await addIncomeAction({ amount: 100, description: 'a', date: '2030-10-15', status: 'planned' })
    const edited = await updateIncomeAction(planned.id, { amount: 250, description: 'b', date: '2030-10-16' })
    expect(edited).toMatchObject({ amount: 250, description: 'b', date: '2030-10-16', status: 'planned' })
  })
})

describe('household scoping', () => {
  it("never reaches another household's income", async () => {
    const income = await addIncomeAction({ amount: 100, description: 'moje', date: '2030-10-15', status: 'planned' })
    currentHouseholdId = await createHousehold()
    await expect(updateIncomeAction(income.id, { amount: 1, description: '', date: '2030-10-15' })).rejects.toThrow('nebyl nalezen')
    await expect(deleteIncomeAction(income.id)).rejects.toThrow('nebyl nalezen')
    await expect(markIncomeReceivedAction(income.id)).rejects.toThrow('nebyl nalezen')
    expect(await getPeriodIncomesAction('2030-10-15')).toEqual([])
    expect(await db.query.incomes.findFirst({ where: eq(schema.incomes.id, income.id) })).toBeDefined()
  })
})

describe('custom budget period', () => {
  it('slices incomes and expenses by the household anchor and length', async () => {
    // 14-day periods from 2030-01-05: 01-05…01-18, 01-19…02-01.
    const custom = await createHousehold({ budgetPeriodType: 'custom', budgetPeriodAnchor: '2030-01-05', budgetPeriodLengthDays: 14 })
    currentHouseholdId = custom
    await addIncomeAction({ amount: 1, description: 'první', date: '2030-01-18', status: 'planned' })
    await addIncomeAction({ amount: 2, description: 'druhé', date: '2030-01-19', status: 'planned' })
    await db.insert(schema.expenses).values([
      { householdId: custom, amount: '10', date: '2030-01-05' },
      { householdId: custom, amount: '20', date: '2030-01-19' },
    ])
    expect((await getPeriodIncomesAction('2030-01-10')).map((income) => income.description)).toEqual(['první'])
    expect((await getPeriodIncomesAction('2030-01-25')).map((income) => income.description)).toEqual(['druhé'])
    expect((await getPeriodExpensesAction('2030-01-10')).map((expense) => Number(expense.amount))).toEqual([10])
    expect((await getPeriodExpensesAction('2030-01-25')).map((expense) => Number(expense.amount))).toEqual([20])
  })
})

describe('database constraints', () => {
  it('rejects non-positive amounts and unknown statuses', async () => {
    await expect(db.insert(schema.incomes).values({ householdId, amount: '0', date: '2030-01-01' })).rejects.toThrow()
    await expect(db.insert(schema.incomes).values({ householdId, amount: '5', date: '2030-01-01', status: 'maybe' })).rejects.toThrow()
  })

  it('rejects an inconsistent period config', async () => {
    await expect(createHousehold({ budgetPeriodType: 'custom' })).rejects.toThrow()
    await expect(createHousehold({ budgetPeriodType: 'custom', budgetPeriodAnchor: '2030-01-05', budgetPeriodLengthDays: 3 })).rejects.toThrow()
    await expect(createHousehold({ budgetPeriodType: 'payday', budgetPeriodAnchor: '2030-01-05', budgetPeriodLengthDays: 14 })).rejects.toThrow()
    await expect(createHousehold({ budgetPeriodType: 'weekly' })).rejects.toThrow()
  })
})
