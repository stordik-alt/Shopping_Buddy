import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import {
  carryIntoPeriod,
  periodResult,
  periodToClose,
  pocketBalance,
  recommendedContribution,
  resolveClosedPeriods,
  type ClosedPeriodResult,
  type PeriodMoney,
} from '@/lib/budget-closing'
import { remainingPlannedTransfers } from '@/lib/budget-forecast'
import { buildPeriodHistory, MAX_HISTORY_PERIODS, type PeriodHistoryRow } from '@/lib/budget-history'
import { OUTLOOK_PERIODS } from '@/lib/budget-outlook'
import { budgetForPeriod } from '@/lib/budget'
import { nextPeriodStartFor, periodStartFor, previousPeriodStartFor, type PeriodConfig } from '@/lib/budget-period'
import type { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { BudgetLedger, BudgetOutlook, ClosingPreview, Pocket } from '@/lib/types'

// The data side of docs/15_BUDGET_PERIODS.md §11–15: reads the real money of periods and Kapsy and
// hands it to the pure rules in lib/budget-closing.ts. Everything is scoped to one household by the
// caller's id; nothing here trusts a client-supplied one.

type Db = ReturnType<typeof getDb>

const round2 = (value: number) => Math.round(value * 100) / 100
const asNumber = (value: string | null) => Number(value ?? 0)

/** Real income, paid expenses and ordinary Kapsa moves of one period `[start, end)`. */
export async function loadPeriodMoney(db: Db, householdId: string, start: string, end: string): Promise<PeriodMoney> {
  const [received, expenses, transfers] = await Promise.all([
    db
      .select({ total: sql<string | null>`sum(${schema.incomes.amount})` })
      .from(schema.incomes)
      .where(and(eq(schema.incomes.householdId, householdId), eq(schema.incomes.status, 'actual'), gte(schema.incomes.date, start), lt(schema.incomes.date, end))),
    db
      .select({ total: sql<string | null>`sum(${schema.expenses.amount})` })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.householdId, householdId), gte(schema.expenses.date, start), lt(schema.expenses.date, end))),
    db
      .select({ total: sql<string | null>`sum(${schema.pocketTransfers.amount})` })
      .from(schema.pocketTransfers)
      .where(and(eq(schema.pocketTransfers.householdId, householdId), eq(schema.pocketTransfers.periodStart, start), isNull(schema.pocketTransfers.closingId))),
  ])
  return { received: round2(asNumber(received[0]?.total)), expenses: round2(asNumber(expenses[0]?.total)), transfers: round2(asNumber(transfers[0]?.total)) }
}

/** Every closed period of the household with its result and carry, recomputed from the real data now
 *  (not read from a stored snapshot), so a change to a closed period is already reflected (§14). The
 *  common case — nothing closed yet — costs one query. */
export async function loadClosedPeriods(db: Db, householdId: string): Promise<ClosedPeriodResult[]> {
  const closings = await db.query.periodClosings.findMany({ where: eq(schema.periodClosings.householdId, householdId), orderBy: [asc(schema.periodClosings.periodStart)] })
  if (closings.length === 0) return []

  const from = closings[0].periodStart
  const to = closings.reduce((latest, closing) => (closing.periodEnd > latest ? closing.periodEnd : latest), closings[0].periodEnd)
  const [incomeRows, expenseRows, ordinaryRows, closingRows] = await Promise.all([
    db
      .select({ date: schema.incomes.date, total: sql<string>`sum(${schema.incomes.amount})` })
      .from(schema.incomes)
      .where(and(eq(schema.incomes.householdId, householdId), eq(schema.incomes.status, 'actual'), gte(schema.incomes.date, from), lt(schema.incomes.date, to)))
      .groupBy(schema.incomes.date),
    db
      .select({ date: schema.expenses.date, total: sql<string>`sum(${schema.expenses.amount})` })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.householdId, householdId), gte(schema.expenses.date, from), lt(schema.expenses.date, to)))
      .groupBy(schema.expenses.date),
    db
      .select({ periodStart: schema.pocketTransfers.periodStart, total: sql<string>`sum(${schema.pocketTransfers.amount})` })
      .from(schema.pocketTransfers)
      .where(and(eq(schema.pocketTransfers.householdId, householdId), isNull(schema.pocketTransfers.closingId)))
      .groupBy(schema.pocketTransfers.periodStart),
    db
      .select({ closingId: schema.pocketTransfers.closingId, total: sql<string>`sum(${schema.pocketTransfers.amount})` })
      .from(schema.pocketTransfers)
      .where(and(eq(schema.pocketTransfers.householdId, householdId), sql`${schema.pocketTransfers.closingId} IS NOT NULL`))
      .groupBy(schema.pocketTransfers.closingId),
  ])

  const sumRange = (rows: { date: string; total: string }[], start: string, end: string) =>
    round2(rows.reduce((sum, row) => (row.date >= start && row.date < end ? sum + Number(row.total) : sum), 0))
  const ordinary = new Map(ordinaryRows.map((row) => [row.periodStart, Number(row.total)]))
  const closingTransfers = new Map(closingRows.map((row) => [row.closingId, Number(row.total)]))

  return resolveClosedPeriods(
    closings.map((closing) => ({
      periodStart: closing.periodStart,
      periodEnd: closing.periodEnd,
      kept: Number(closing.keptAmount),
      closingTransfers: round2(closingTransfers.get(closing.id) ?? 0),
    })),
    (start, end) => ({ received: sumRange(incomeRows, start, end), expenses: sumRange(expenseRows, start, end), transfers: round2(ordinary.get(start) ?? 0) }),
  )
}

/** What the household plans to leave for the next period, by the start of the period it leaves (§14). */
export async function loadPlannedCarries(db: Db, householdId: string): Promise<Map<string, number>> {
  const rows = await db.select({ periodStart: schema.plannedCarries.periodStart, amount: schema.plannedCarries.amount }).from(schema.plannedCarries).where(eq(schema.plannedCarries.householdId, householdId))
  return new Map(rows.map((row) => [row.periodStart, Number(row.amount)]))
}

/** The household's active Kapsy with their real balances and recommended contributions. */
export async function loadPockets(db: Db, householdId: string, config: PeriodConfig, today: string): Promise<Pocket[]> {
  const [rows, sums] = await Promise.all([
    db.query.pockets.findMany({ where: and(eq(schema.pockets.householdId, householdId), isNull(schema.pockets.archivedAt)), orderBy: [asc(schema.pockets.createdAt)] }),
    db
      .select({ pocketId: schema.pocketTransfers.pocketId, total: sql<string>`sum(${schema.pocketTransfers.amount})` })
      .from(schema.pocketTransfers)
      .where(eq(schema.pocketTransfers.householdId, householdId))
      .groupBy(schema.pocketTransfers.pocketId),
  ])
  const transferred = new Map(sums.map((row) => [row.pocketId, Number(row.total)]))
  return rows.map((row) => {
    const balance = pocketBalance(Number(row.openingAmount), [transferred.get(row.id) ?? 0])
    const targetAmount = row.targetAmount === null ? null : Number(row.targetAmount)
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      targetAmount,
      targetDate: row.targetDate,
      openingAmount: Number(row.openingAmount),
      plannedContribution: row.plannedContribution === null ? null : Number(row.plannedContribution),
      isReserve: row.isReserve,
      balance,
      recommended: recommendedContribution(config, today, { balance, targetAmount, targetDate: row.targetDate }),
    }
  })
}

/** The actual balance of a period right now: received income + carry − paid expenses − Kapsa moves
 *  (docs/15 §9.1, §14). The most that may be saved into a Kapsa from it is that, never below 0. */
export async function loadPeriodBalance(db: Db, householdId: string, config: PeriodConfig, periodStart: string): Promise<number> {
  const [money, closed] = await Promise.all([loadPeriodMoney(db, householdId, periodStart, nextPeriodStartFor(config, periodStart)), loadClosedPeriods(db, householdId)])
  return periodResult(money, carryIntoPeriod(closed, periodStart))
}

/** What Plánování shows besides incomes for the period starting `periodStart`. */
export async function loadBudgetLedger(db: Db, householdId: string, config: PeriodConfig, periodStart: string, today: string): Promise<BudgetLedger> {
  const [closed, pockets, money, carries] = await Promise.all([
    loadClosedPeriods(db, householdId),
    loadPockets(db, householdId, config, today),
    loadPeriodMoney(db, householdId, periodStart, nextPeriodStartFor(config, periodStart)),
    loadPlannedCarries(db, householdId),
  ])
  const candidate = periodToClose(config, today, new Set(closed.map((period) => period.periodStart)))
  let toClose: ClosingPreview | null = null
  if (candidate) {
    const candidateMoney = await loadPeriodMoney(db, householdId, candidate.periodStart, candidate.periodEnd)
    const carryIn = carryIntoPeriod(closed, candidate.periodStart)
    // A period in which nothing happened has nothing to close (a household that has just started).
    const untouched = candidateMoney.received === 0 && candidateMoney.expenses === 0 && candidateMoney.transfers === 0 && carryIn === 0
    if (!untouched) toClose = { ...candidate, received: candidateMoney.received, carryIn, expenses: candidateMoney.expenses, transfers: candidateMoney.transfers, result: periodResult(candidateMoney, carryIn), plannedCarry: carries.get(candidate.periodStart) ?? null }
  }
  // Net ordinary moves per Kapsa in this period, so a contribution already made is not planned again.
  const deposits = await db
    .select({ pocketId: schema.pocketTransfers.pocketId, total: sql<string>`sum(${schema.pocketTransfers.amount})` })
    .from(schema.pocketTransfers)
    .where(and(eq(schema.pocketTransfers.householdId, householdId), eq(schema.pocketTransfers.periodStart, periodStart), isNull(schema.pocketTransfers.closingId)))
    .groupBy(schema.pocketTransfers.pocketId)
  const deposited = new Map(deposits.map((row) => [row.pocketId, Number(row.total)]))
  return {
    carryIn: carryIntoPeriod(closed, periodStart),
    transfers: money.transfers,
    pockets,
    plannedTransfersLeft: remainingPlannedTransfers(pockets.map((pocket) => ({ plannedContribution: pocket.plannedContribution, depositedThisPeriod: deposited.get(pocket.id) ?? 0 }))),
    toClose,
    closed: closed.some((period) => period.periodStart === periodStart),
    previousClosedStart: closed.find((period) => period.periodEnd === periodStart)?.periodStart ?? null,
  }
}

/** The household's past periods (docs/15 §18), newest first, cut by its own period setting. Reads only
 *  the sums per day for at most MAX_HISTORY_PERIODS periods back, never every row. */
export async function loadPeriodHistory(db: Db, householdId: string, config: PeriodConfig, today: string): Promise<PeriodHistoryRow[]> {
  const currentStart = periodStartFor(config, today)
  let from = currentStart
  for (let i = 0; i < MAX_HISTORY_PERIODS; i++) from = previousPeriodStartFor(config, from)

  const [incomeRows, expenseRows, transferRows, budgetRows, household, closed, firstIncome, firstExpense, firstTransfer] = await Promise.all([
    db
      .select({ date: schema.incomes.date, total: sql<string>`sum(${schema.incomes.amount})` })
      .from(schema.incomes)
      .where(and(eq(schema.incomes.householdId, householdId), eq(schema.incomes.status, 'actual'), gte(schema.incomes.date, from), lt(schema.incomes.date, currentStart)))
      .groupBy(schema.incomes.date),
    db
      .select({ date: schema.expenses.date, total: sql<string>`sum(${schema.expenses.amount})` })
      .from(schema.expenses)
      .where(and(eq(schema.expenses.householdId, householdId), gte(schema.expenses.date, from), lt(schema.expenses.date, currentStart)))
      .groupBy(schema.expenses.date),
    db
      .select({ periodStart: schema.pocketTransfers.periodStart, total: sql<string>`sum(${schema.pocketTransfers.amount})` })
      .from(schema.pocketTransfers)
      .where(and(eq(schema.pocketTransfers.householdId, householdId), isNull(schema.pocketTransfers.closingId), gte(schema.pocketTransfers.periodStart, from), lt(schema.pocketTransfers.periodStart, currentStart)))
      .groupBy(schema.pocketTransfers.periodStart),
    db.select({ month: schema.budgets.month, amount: schema.budgets.amount }).from(schema.budgets).where(eq(schema.budgets.householdId, householdId)),
    db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { monthlyBudget: true } }),
    loadClosedPeriods(db, householdId),
    db.select({ date: sql<string | null>`min(${schema.incomes.date})` }).from(schema.incomes).where(and(eq(schema.incomes.householdId, householdId), eq(schema.incomes.status, 'actual'))),
    db.select({ date: sql<string | null>`min(${schema.expenses.date})` }).from(schema.expenses).where(eq(schema.expenses.householdId, householdId)),
    db.select({ date: sql<string | null>`min(${schema.pocketTransfers.periodStart})` }).from(schema.pocketTransfers).where(eq(schema.pocketTransfers.householdId, householdId)),
  ])
  const dates = [firstIncome[0]?.date, firstExpense[0]?.date, firstTransfer[0]?.date, ...closed.map((period) => period.periodStart)].filter((date): date is string => typeof date === 'string')
  const earliest = dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b))

  const sumRange = (rows: { date: string; total: string }[], start: string, end: string) =>
    round2(rows.reduce((sum, row) => (row.date >= start && row.date < end ? sum + Number(row.total) : sum), 0))
  const ordinary = new Map(transferRows.map((row) => [row.periodStart, Number(row.total)]))
  const periodBudgets = Object.fromEntries(budgetRows.map((row) => [row.month, Number(row.amount)]))
  const defaultBudget = Number(household?.monthlyBudget ?? 0)

  return buildPeriodHistory({
    config,
    currentStart,
    earliest,
    closed,
    moneyOf: (start, end) => ({ received: sumRange(incomeRows, start, end), expenses: sumRange(expenseRows, start, end), transfers: round2(ordinary.get(start) ?? 0) }),
    budgetOf: (start) => budgetForPeriod(start, periodBudgets, defaultBudget),
  })
}

/** What the outlook (lib/budget-outlook.ts) needs from the database for the running period and the
 *  ones ahead (docs/15 §14, §16): sums per period read in a handful of range queries. The planned
 *  contributions of the running period are what is left of them; later periods have none made yet. */
export async function loadBudgetOutlook(db: Db, householdId: string, config: PeriodConfig, today: string): Promise<BudgetOutlook> {
  const currentStart = periodStartFor(config, today)
  const starts = [currentStart]
  for (let i = 1; i < OUTLOOK_PERIODS; i++) starts.push(nextPeriodStartFor(config, starts[i - 1]))
  const end = nextPeriodStartFor(config, starts[starts.length - 1])
  const currentEnd = starts[1]

  const [incomeRows, plannedRows, budgetRows, household, carries, pockets, closed, money, deposits] = await Promise.all([
    db
      .select({ date: schema.incomes.date, status: schema.incomes.status, total: sql<string>`sum(${schema.incomes.amount})` })
      .from(schema.incomes)
      .where(and(eq(schema.incomes.householdId, householdId), gte(schema.incomes.date, currentStart), lt(schema.incomes.date, end)))
      .groupBy(schema.incomes.date, schema.incomes.status),
    db
      .select({ date: schema.plannedExpenses.date, total: sql<string>`sum(${schema.plannedExpenses.amount})` })
      .from(schema.plannedExpenses)
      .where(and(eq(schema.plannedExpenses.householdId, householdId), eq(schema.plannedExpenses.status, 'planned'), gte(schema.plannedExpenses.date, currentStart), lt(schema.plannedExpenses.date, end)))
      .groupBy(schema.plannedExpenses.date),
    db.select({ month: schema.budgets.month, amount: schema.budgets.amount }).from(schema.budgets).where(eq(schema.budgets.householdId, householdId)),
    db.query.households.findFirst({ where: eq(schema.households.id, householdId), columns: { monthlyBudget: true } }),
    loadPlannedCarries(db, householdId),
    loadPockets(db, householdId, config, today),
    loadClosedPeriods(db, householdId),
    loadPeriodMoney(db, householdId, currentStart, currentEnd),
    db
      .select({ pocketId: schema.pocketTransfers.pocketId, total: sql<string>`sum(${schema.pocketTransfers.amount})` })
      .from(schema.pocketTransfers)
      .where(and(eq(schema.pocketTransfers.householdId, householdId), eq(schema.pocketTransfers.periodStart, currentStart), isNull(schema.pocketTransfers.closingId)))
      .groupBy(schema.pocketTransfers.pocketId),
  ])

  const sumRange = (rows: { date: string; total: string }[], start: string, until: string) =>
    round2(rows.reduce((sum, row) => (row.date >= start && row.date < until ? sum + Number(row.total) : sum), 0))
  const periodBudgets = Object.fromEntries(budgetRows.map((row) => [row.month, Number(row.amount)]))
  const defaultBudget = Number(household?.monthlyBudget ?? 0)
  const deposited = new Map(deposits.map((row) => [row.pocketId, Number(row.total)]))
  const plannedContributions = round2(pockets.reduce((sum, pocket) => sum + (pocket.plannedContribution ?? 0), 0))

  const periods = starts.map((start, index) => {
    const until = index + 1 < starts.length ? starts[index + 1] : end
    const running = index === 0
    return {
      periodStart: start,
      plannedIncome: sumRange(incomeRows.filter((row) => row.status === 'planned'), start, until),
      // The running period's received income is already in the actual balance.
      receivedIncome: running ? 0 : sumRange(incomeRows.filter((row) => row.status === 'actual'), start, until),
      plannedExpenses: sumRange(plannedRows, start, until),
      plannedTransfers: running
        ? remainingPlannedTransfers(pockets.map((pocket) => ({ plannedContribution: pocket.plannedContribution, depositedThisPeriod: deposited.get(pocket.id) ?? 0 })))
        : plannedContributions,
      plannedCarry: carries.get(start) ?? null,
      budget: budgetForPeriod(start, periodBudgets, defaultBudget),
    }
  })
  return { actualNow: periodResult(money, carryIntoPeriod(closed, currentStart)), spentNow: money.expenses, periods }
}
