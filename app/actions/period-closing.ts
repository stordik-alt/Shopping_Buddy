'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, gte } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { canClosePeriod, carryIntoPeriod, periodResult, planClosing, type PocketAmount } from '@/lib/budget-closing'
import { nextPeriodStartFor, periodStartFor } from '@/lib/budget-period'
import { getDb } from '@/lib/db/client'
import { loadClosedPeriods, loadPeriodMoney, loadPockets } from '@/lib/db/period-ledger'
import { loadPeriodConfig } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { isIsoDate } from '@/lib/income-input'
import { todayInPrague } from '@/lib/today'

// Closing a budget period (docs/15_BUDGET_PERIODS.md §12–15). The server works out the result itself
// from the real data and checks the user's split against it (lib/budget-closing.ts); nothing the client
// says about amounts is trusted beyond "this is how I want to split what really remains". ANITKA only
// records what the user confirmed.

export type CloseInput = {
  /** Start of the period being closed (any date inside it is accepted). */
  periodStart: string
  /** Surplus only: money into Kapsy. */
  deposits: PocketAmount[]
  /** Deficit only: money out of Kapsy to cover it. */
  withdrawals: PocketAmount[]
  /** Surplus only: the part left for the next period. */
  carryOn: number
}

/** Closes a period that has ended: records the user's split of its result as Kapsa moves plus the
 *  amount kept unassigned, after which the carry to the next period follows from the real data. */
export async function closePeriodAction(input: CloseInput): Promise<void> {
  const householdId = await requireHouseholdId()
  if (!isIsoDate(input.periodStart)) throw new Error('Neplatné období.')
  const db = getDb()
  const config = await loadPeriodConfig(db, householdId)
  const periodStart = periodStartFor(config, input.periodStart)
  const periodEnd = nextPeriodStartFor(config, periodStart)
  if (!canClosePeriod(periodEnd, todayInPrague())) throw new Error('Období ještě neskončilo.')

  const closed = await loadClosedPeriods(db, householdId)
  if (closed.some((period) => period.periodStart === periodStart)) throw new Error('Toto období už je uzavřené.')

  const result = periodResult(await loadPeriodMoney(db, householdId, periodStart, periodEnd), carryIntoPeriod(closed, periodStart))
  const pockets = await loadPockets(db, householdId, config, todayInPrague())
  const planned = planClosing(
    result,
    { deposits: input.deposits, withdrawals: input.withdrawals, carryOn: input.carryOn },
    new Map(pockets.map((pocket) => [pocket.id, pocket.balance])),
  )
  if ('error' in planned) throw new Error(planned.error)
  const { plan } = planned

  // The closing and its Kapsa moves are one atomic batch: a half-closed period would carry the wrong
  // amount. The id is chosen here so the moves can point at the closing in the same batch.
  const closingId = randomUUID()
  const today = todayInPrague()
  const writes = [
    db.insert(schema.periodClosings).values({ id: closingId, householdId, periodStart, periodEnd, keptAmount: plan.kept.toString() }),
    ...plan.moves.map((move) =>
      db.insert(schema.pocketTransfers).values({ householdId, pocketId: move.pocketId, periodStart, closingId, amount: move.amount.toString(), date: today }),
    ),
    // The planned transfer (§14) is replaced by the real one just recorded, so the plan goes with it.
    db.delete(schema.plannedCarries).where(and(eq(schema.plannedCarries.householdId, householdId), eq(schema.plannedCarries.periodStart, periodStart))),
  ]
  try {
    await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]])
  } catch (error) {
    // Two members closing at once: the unique (household, period) index lets only one through.
    const nowClosed = await loadClosedPeriods(db, householdId)
    if (nowClosed.some((period) => period.periodStart === periodStart)) throw new Error('Toto období už je uzavřené.')
    throw error
  }
}

/** Opens a closed period again, undoing the Kapsa moves made when it was closed. Refused when a later
 *  period is closed (its carry depends on this one) or when taking the moves back would leave a Kapsa
 *  below zero because the money has been used since. */
export async function reopenPeriodAction(periodStart: string): Promise<void> {
  const householdId = await requireHouseholdId()
  if (!isIsoDate(periodStart)) throw new Error('Neplatné období.')
  const db = getDb()
  const closing = await db.query.periodClosings.findFirst({
    where: and(eq(schema.periodClosings.householdId, householdId), eq(schema.periodClosings.periodStart, periodStart)),
  })
  if (!closing) throw new Error('Toto období není uzavřené.')

  const later = await db.query.periodClosings.findFirst({
    where: and(eq(schema.periodClosings.householdId, householdId), gte(schema.periodClosings.periodStart, closing.periodEnd)),
  })
  if (later) throw new Error('Nejdřív znovu otevřete následující uzavřené období.')

  const moves = await db.query.pocketTransfers.findMany({
    where: and(eq(schema.pocketTransfers.householdId, householdId), eq(schema.pocketTransfers.closingId, closing.id)),
  })
  if (moves.length > 0) {
    const config = await loadPeriodConfig(db, householdId)
    const balances = new Map((await loadPockets(db, householdId, config, todayInPrague())).map((pocket) => [pocket.id, pocket.balance]))
    for (const move of moves) {
      const after = (balances.get(move.pocketId) ?? 0) - Number(move.amount)
      if (after < -0.005) throw new Error('Peníze, které jste při uzavření uložili do Kapsy, už byly použity. Období nelze znovu otevřít.')
      balances.set(move.pocketId, after)
    }
  }

  // The Kapsa moves of this closing go with it (ON DELETE CASCADE).
  await db.delete(schema.periodClosings).where(and(eq(schema.periodClosings.id, closing.id), eq(schema.periodClosings.householdId, householdId)))
}
