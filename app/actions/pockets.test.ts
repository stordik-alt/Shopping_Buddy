import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Integration tests against the test database: Kapsy, real transfers, closing a period and the carry
// into the next one (docs/15_BUDGET_PERIODS.md §10–15). Every household uses calendar months, so the
// previous period is simply last month.
let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({
  requireHouseholdId: () => Promise.resolve(currentHouseholdId),
  requireHousehold: () => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', userEmail: 'test@example.com', householdId: currentHouseholdId, role: 'owner' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { addPocketAction, archivePocketAction, getBudgetLedgerAction, transferToPocketAction, updatePocketAction, withdrawFromPocketAction } from '@/app/actions/pockets'
import { getBudgetOutlookAction, setPlannedCarryAction } from '@/app/actions/budget-outlook'
import { closePeriodAction, reopenPeriodAction } from '@/app/actions/period-closing'
import { nextPeriodStartFor, periodStartFor, type PeriodConfig } from '@/lib/budget-period'
import { todayInPrague } from '@/lib/today'

const db = getDb()
const calendar: PeriodConfig = { type: 'calendar' }
const createdHouseholdIds: string[] = []
let householdId: string

const today = todayInPrague()
const currentStart = periodStartFor(calendar, today)
const previousStart = (() => {
  const day = new Date(`${currentStart}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return periodStartFor(calendar, day.toISOString().slice(0, 10))
})()

async function createHousehold() {
  const [household] = await db
    .insert(schema.households)
    .values({ name: '__test_household_pockets__', monthlyBudget: '1000', budgetPeriodType: 'calendar', budgetPeriodStartDay: 1 })
    .returning()
  createdHouseholdIds.push(household.id)
  return household.id
}

const pocketInput = (name: string, over: Partial<Parameters<typeof addPocketAction>[0]> = {}) => ({
  name,
  icon: 'piggy-bank',
  targetAmount: null,
  targetDate: null,
  openingAmount: 0,
  plannedContribution: null,
  ...over,
})

async function addPocket(name: string, over: Partial<Parameters<typeof addPocketAction>[0]> = {}) {
  await addPocketAction(pocketInput(name, over))
  const ledger = await getBudgetLedgerAction(currentStart)
  return ledger.pockets.find((pocket) => pocket.name === name)!
}

const income = (amount: number, date: string) => db.insert(schema.incomes).values({ householdId, amount: amount.toString(), date, status: 'actual' })
const expense = (amount: number, date: string) => db.insert(schema.expenses).values({ householdId, amount: amount.toString(), date, category: 'Ostatní' })

beforeEach(async () => {
  householdId = await createHousehold()
  currentHouseholdId = householdId
})

afterAll(async () => {
  for (const id of createdHouseholdIds) {
    // Closings go first: they cascade to their Kapsa moves.
    await db.delete(schema.periodClosings).where(eq(schema.periodClosings.householdId, id))
    await db.delete(schema.pockets).where(eq(schema.pockets.householdId, id))
    await db.delete(schema.expenses).where(eq(schema.expenses.householdId, id))
    await db.delete(schema.incomes).where(eq(schema.incomes.householdId, id))
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
})

describe('Kapsy', () => {
  it('starts with the opening amount and recommends a contribution towards the goal', async () => {
    const pocket = await addPocket('Auto', { openingAmount: 20_000, targetAmount: 150_000, targetDate: '2999-12-31' })
    expect(pocket.balance).toBe(20_000)
    expect(pocket.recommended).toBeGreaterThan(0)
  })

  it('rejects an invalid Kapsa', async () => {
    await expect(addPocketAction(pocketInput('   '))).rejects.toThrow('název')
  })

  it('a planned contribution does not change the balance (§11.1)', async () => {
    const pocket = await addPocket('Dovolená', { plannedContribution: 2_000 })
    expect(pocket.balance).toBe(0)
  })

  it('lets a Kapsa be named freely and renamed later without touching its money', async () => {
    await income(1_000, today)
    const pocket = await addPocket('Auto')
    await transferToPocketAction(pocket.id, 400)
    await updatePocketAction(pocket.id, pocketInput('  Nová střecha 🏠  ', { icon: 'home' }))
    const [renamed] = (await getBudgetLedgerAction(currentStart)).pockets
    expect(renamed).toMatchObject({ id: pocket.id, name: 'Nová střecha 🏠', icon: 'home', balance: 400 })
    // Two Kapsy may share a name (the household tells them apart by what is in them); an overlong one is refused.
    await addPocket('Nová střecha 🏠')
    await expect(addPocketAction(pocketInput('x'.repeat(61)))).rejects.toThrow('nejvýše')
  })

  it('moves money only when asked: planning, outlook and viewing never create a transfer', async () => {
    await income(1_000, today)
    await addPocket('Dovolená', { plannedContribution: 2_000, targetAmount: 10_000, targetDate: '2999-12-31' })
    await getBudgetLedgerAction(currentStart)
    await getBudgetOutlookAction()
    await setPlannedCarryAction(nextPeriodStartFor(calendar, currentStart), 500)
    expect(await db.query.pocketTransfers.findMany({ where: eq(schema.pocketTransfers.householdId, householdId) })).toHaveLength(0)
    expect((await getBudgetLedgerAction(currentStart)).pockets[0].balance).toBe(0)
  })

  it('refuses to archive a Kapsa that still holds money, and archives an empty one', async () => {
    const pocket = await addPocket('Rezerva', { openingAmount: 500 })
    await expect(archivePocketAction(pocket.id)).rejects.toThrow('není prázdná')
    await updatePocketAction(pocket.id, pocketInput('Rezerva', { openingAmount: 0 }))
    await archivePocketAction(pocket.id)
    expect((await getBudgetLedgerAction(currentStart)).pockets).toHaveLength(0)
  })

  it('does not let the opening amount be lowered below what was already taken out', async () => {
    await income(1_000, today)
    const pocket = await addPocket('Auto', { openingAmount: 500 })
    await withdrawFromPocketAction(pocket.id, 400)
    await expect(updatePocketAction(pocket.id, pocketInput('Auto', { openingAmount: 100 }))).rejects.toThrow('záporný')
  })
})

describe('transfers between the budget and a Kapsa (§14)', () => {
  it('moves real money out of the budget into the Kapsa and back', async () => {
    await income(1_000, today)
    await expense(300, today)
    const pocket = await addPocket('Auto')
    await transferToPocketAction(pocket.id, 500)
    let ledger = await getBudgetLedgerAction(currentStart)
    expect(ledger.transfers).toBe(500)
    expect(ledger.pockets[0].balance).toBe(500)
    await withdrawFromPocketAction(pocket.id, 200)
    ledger = await getBudgetLedgerAction(currentStart)
    expect(ledger.transfers).toBe(300)
    expect(ledger.pockets[0].balance).toBe(300)
  })

  it('plans only what is left of a planned contribution, so a deposit already made is not counted twice (§16)', async () => {
    await income(5_000, today)
    const pocket = await addPocket('Dovolená', { plannedContribution: 2_000 })
    expect((await getBudgetLedgerAction(currentStart)).plannedTransfersLeft).toBe(2_000)
    await transferToPocketAction(pocket.id, 500)
    expect((await getBudgetLedgerAction(currentStart)).plannedTransfersLeft).toBe(1_500)
    await transferToPocketAction(pocket.id, 2_500)
    expect((await getBudgetLedgerAction(currentStart)).plannedTransfersLeft).toBe(0)
  })

  it('cannot save more than the budget really holds (a transfer creates no money)', async () => {
    await income(1_000, today)
    await expense(300, today)
    const pocket = await addPocket('Auto')
    await expect(transferToPocketAction(pocket.id, 701)).rejects.toThrow('V rozpočtu není dost peněz')
    await transferToPocketAction(pocket.id, 700)
  })

  it('cannot save while planned income is the only money (planned money is not real, §8)', async () => {
    await db.insert(schema.incomes).values({ householdId, amount: '5000', date: today, status: 'planned' })
    const pocket = await addPocket('Auto')
    await expect(transferToPocketAction(pocket.id, 100)).rejects.toThrow('žádné volné peníze')
  })

  it('cannot take more out than the Kapsa holds', async () => {
    const pocket = await addPocket('Auto', { openingAmount: 100 })
    await expect(withdrawFromPocketAction(pocket.id, 101)).rejects.toThrow('není dost peněz')
  })

  it("never reaches another household's Kapsa", async () => {
    const pocket = await addPocket('Moje')
    currentHouseholdId = await createHousehold()
    await expect(transferToPocketAction(pocket.id, 10)).rejects.toThrow('nebyla nalezena')
    await expect(archivePocketAction(pocket.id)).rejects.toThrow('nebyla nalezena')
    expect((await getBudgetLedgerAction(currentStart)).pockets).toHaveLength(0)
  })
})

describe('closing a period (§12–15)', () => {
  it('offers the period just ended, with its real result', async () => {
    await income(38_000, previousStart)
    await expense(33_200, previousStart)
    const ledger = await getBudgetLedgerAction(currentStart)
    expect(ledger.toClose).toMatchObject({ periodStart: previousStart, periodEnd: currentStart, received: 38_000, expenses: 33_200, result: 4_800 })
  })

  it('offers nothing for a period in which nothing happened', async () => {
    expect((await getBudgetLedgerAction(currentStart)).toClose).toBeNull()
  })

  it('splits a surplus between a Kapsa and the next period, which then starts with the carry', async () => {
    await income(38_000, previousStart)
    await expense(33_200, previousStart)
    const pocket = await addPocket('Auto')
    await closePeriodAction({ periodStart: previousStart, deposits: [{ pocketId: pocket.id, amount: 2_000 }], withdrawals: [], carryOn: 1_300 })
    const ledger = await getBudgetLedgerAction(currentStart)
    expect(ledger.carryIn).toBe(1_300)
    expect(ledger.toClose).toBeNull()
    expect(ledger.pockets[0].balance).toBe(2_000)
    // The closing's moves belong to the closed period, not to the current one.
    expect(ledger.transfers).toBe(0)
    expect((await getBudgetLedgerAction(previousStart)).closed).toBe(true)
  })

  it('moves the carry when a closed period changes afterwards (§14: +1 800 and a 500 expense → +1 300)', async () => {
    await income(38_000, previousStart)
    await expense(35_000, previousStart)
    await closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [], carryOn: 1_800 })
    expect((await getBudgetLedgerAction(currentStart)).carryIn).toBe(1_800)
    // The unassigned 1 200 absorbs nothing: the carry follows the result, so the extra expense lowers it.
    await expense(500, previousStart)
    expect((await getBudgetLedgerAction(currentStart)).carryIn).toBe(1_800 - 500)
  })

  it('covers a deficit from a Kapsa and carries the rest as a negative transfer', async () => {
    await income(38_000, previousStart)
    await expense(40_300, previousStart)
    const pocket = await addPocket('Rezerva', { openingAmount: 1_000 })
    await closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [{ pocketId: pocket.id, amount: 1_000 }], carryOn: 0 })
    const ledger = await getBudgetLedgerAction(currentStart)
    expect(ledger.carryIn).toBe(-1_300)
    expect(ledger.pockets[0].balance).toBe(0)
  })

  it('refuses to save a deficit, to distribute more than remains, and to take more than a Kapsa holds', async () => {
    await income(1_000, previousStart)
    await expense(1_500, previousStart)
    const pocket = await addPocket('Rezerva', { openingAmount: 100 })
    await expect(closePeriodAction({ periodStart: previousStart, deposits: [{ pocketId: pocket.id, amount: 10 }], withdrawals: [], carryOn: 0 })).rejects.toThrow('schodku')
    await expect(closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [{ pocketId: pocket.id, amount: 600 }], carryOn: 0 })).rejects.toThrow()
    expect((await getBudgetLedgerAction(currentStart)).toClose).not.toBeNull()
  })

  it('refuses a period that has not ended and a period closed twice', async () => {
    await expect(closePeriodAction({ periodStart: currentStart, deposits: [], withdrawals: [], carryOn: 0 })).rejects.toThrow('ještě neskončilo')
    await income(100, previousStart)
    await closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [], carryOn: 0 })
    await expect(closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [], carryOn: 0 })).rejects.toThrow('už je uzavřené')
  })

  it('reopens a period, undoing its Kapsa moves, unless that money has been used', async () => {
    await income(1_000, previousStart)
    const pocket = await addPocket('Auto')
    await closePeriodAction({ periodStart: previousStart, deposits: [{ pocketId: pocket.id, amount: 400 }], withdrawals: [], carryOn: 0 })
    // The 400 put away at closing is taken back out, so reopening would leave the Kapsa at -400.
    await withdrawFromPocketAction(pocket.id, 400)
    await expect(reopenPeriodAction(previousStart)).rejects.toThrow('už byly použity')
    // Put back, the period can be reopened and the Kapsa returns to what it held before closing.
    await income(500, today)
    await transferToPocketAction(pocket.id, 400)
    await reopenPeriodAction(previousStart)
    const ledger = await getBudgetLedgerAction(currentStart)
    expect(ledger.toClose).not.toBeNull()
    expect(ledger.pockets[0].balance).toBe(0)
  })

  it('refuses to reopen a period while the next one is closed', async () => {
    await income(100, previousStart)
    await closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [], carryOn: 0 })
    const earlier = periodStartFor(calendar, (() => {
      const day = new Date(`${previousStart}T00:00:00Z`)
      day.setUTCDate(day.getUTCDate() - 1)
      return day.toISOString().slice(0, 10)
    })())
    await db.insert(schema.incomes).values({ householdId, amount: '50', date: earlier, status: 'actual' })
    await closePeriodAction({ periodStart: earlier, deposits: [], withdrawals: [], carryOn: 0 })
    await expect(reopenPeriodAction(earlier)).rejects.toThrow('následující')
    expect(nextPeriodStartFor(calendar, earlier)).toBe(previousStart)
  })

  it("never closes or reopens another household's period", async () => {
    await income(100, previousStart)
    await closePeriodAction({ periodStart: previousStart, deposits: [], withdrawals: [], carryOn: 0 })
    currentHouseholdId = await createHousehold()
    await expect(reopenPeriodAction(previousStart)).rejects.toThrow('není uzavřené')
    expect((await getBudgetLedgerAction(currentStart)).carryIn).toBe(0)
  })
})
