'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { maxDeposit } from '@/lib/budget-closing'
import { periodStartFor } from '@/lib/budget-period'
import { getDb } from '@/lib/db/client'
import { loadBudgetLedger, loadPeriodBalance, loadPockets } from '@/lib/db/period-ledger'
import { loadPeriodConfig } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { money } from '@/lib/format'
import { isIsoDate } from '@/lib/income-input'
import { validatePocketInput, validateTransferAmount, type PocketInput } from '@/lib/pocket-input'
import { todayInPrague } from '@/lib/today'
import type { BudgetLedger } from '@/lib/types'

// Kapsy and the real money moved into and out of them (docs/15_BUDGET_PERIODS.md §10–11, §14).
// ANITKA never moves money on its own: every transfer here is one the user asked for. Like
// app/actions/budget.ts, nothing here revalidates the page; the budget view reloads the ledger itself.
//
// A transfer is checked against the current balance and then written. Two members saving into the same
// Kapsa in the same instant could both pass the check; the household is a handful of people sharing
// one budget, so this is accepted rather than adding a lock.

/** Loads one active Kapsa of the caller's household; any other id is "not found" (CLAUDE.md section 9). */
async function ownPocket(householdId: string, pocketId: string) {
  const row = await getDb().query.pockets.findFirst({
    where: and(eq(schema.pockets.id, pocketId), eq(schema.pockets.householdId, householdId), isNull(schema.pockets.archivedAt)),
  })
  if (!row) throw new Error('Kapsa nebyla nalezena.')
  return row
}

function validPocketOrThrow(input: PocketInput) {
  const result = validatePocketInput(input)
  if ('error' in result) throw new Error(result.error)
  return result.pocket
}

/** Kapsy, carry and period-closing state for the period containing `period`. */
export async function getBudgetLedgerAction(period: string): Promise<BudgetLedger> {
  const householdId = await requireHouseholdId()
  if (!isIsoDate(period)) throw new Error('Neplatné období.')
  const db = getDb()
  const config = await loadPeriodConfig(db, householdId)
  return loadBudgetLedger(db, householdId, config, periodStartFor(config, period), todayInPrague())
}

export async function addPocketAction(input: PocketInput): Promise<void> {
  const householdId = await requireHouseholdId()
  const pocket = validPocketOrThrow(input)
  const db = getDb()
  const id = randomUUID()
  // The reserve is unique: marking this Kapsa takes the mark from the previous one, in one batch.
  const insert = db.insert(schema.pockets).values({
    id,
    householdId,
    name: pocket.name,
    icon: pocket.icon,
    targetAmount: pocket.targetAmount?.toString() ?? null,
    targetDate: pocket.targetDate,
    openingAmount: pocket.openingAmount.toString(),
    plannedContribution: pocket.plannedContribution?.toString() ?? null,
    isReserve: pocket.isReserve,
  })
  if (pocket.isReserve) await db.batch([releaseReserve(db, householdId), insert])
  else await insert
}

/** The statement that takes the reserve mark from the household's current reserve Kapsa. */
function releaseReserve(db: ReturnType<typeof getDb>, householdId: string) {
  return db
    .update(schema.pockets)
    .set({ isReserve: false })
    .where(and(eq(schema.pockets.householdId, householdId), eq(schema.pockets.isReserve, true), isNull(schema.pockets.archivedAt)))
}

/** Changes a Kapsa's settings. Its balance changes only through transfers — except the opening amount,
 *  which may be corrected as long as the balance stays at or above zero. */
export async function updatePocketAction(pocketId: string, input: PocketInput): Promise<void> {
  const householdId = await requireHouseholdId()
  const existing = await ownPocket(householdId, pocketId)
  const pocket = validPocketOrThrow(input)
  const db = getDb()
  const current = (await loadPockets(db, householdId, await loadPeriodConfig(db, householdId), todayInPrague())).find((item) => item.id === pocketId)
  if (!current) throw new Error('Kapsa nebyla nalezena.')
  if (current.balance - Number(existing.openingAmount) + pocket.openingAmount < 0) throw new Error('S touto počáteční částkou by zůstatek Kapsy byl záporný.')
  const update = db
    .update(schema.pockets)
    .set({
      name: pocket.name,
      icon: pocket.icon,
      targetAmount: pocket.targetAmount?.toString() ?? null,
      targetDate: pocket.targetDate,
      openingAmount: pocket.openingAmount.toString(),
      plannedContribution: pocket.plannedContribution?.toString() ?? null,
      isReserve: pocket.isReserve,
    })
    .where(and(eq(schema.pockets.id, pocketId), eq(schema.pockets.householdId, householdId)))
  if (pocket.isReserve) await db.batch([releaseReserve(db, householdId), update])
  else await update
}

/** Puts a Kapsa away. Only an empty one: archiving must not make money disappear. Its past transfers
 *  stay, because they are part of past periods' results. */
export async function archivePocketAction(pocketId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownPocket(householdId, pocketId)
  const db = getDb()
  const current = (await loadPockets(db, householdId, await loadPeriodConfig(db, householdId), todayInPrague())).find((item) => item.id === pocketId)
  if (!current) throw new Error('Kapsa nebyla nalezena.')
  if (Math.abs(current.balance) >= 0.005) throw new Error('Kapsa není prázdná. Nejdřív z ní peníze vraťte do rozpočtu.')
  await db
    .update(schema.pockets)
    .set({ archivedAt: new Date() })
    .where(and(eq(schema.pockets.id, pocketId), eq(schema.pockets.householdId, householdId)))
}

/** Rozpočet → Kapsa: money really moved out of the current period's budget into a Kapsa. It cannot
 *  exceed the money the period actually has (a transfer must not create money, §14), so a deficit is
 *  never "saved" (§13). */
export async function transferToPocketAction(pocketId: string, amount: number): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownPocket(householdId, pocketId)
  const valid = validateTransferAmount(amount)
  if ('error' in valid) throw new Error(valid.error)
  const db = getDb()
  const config = await loadPeriodConfig(db, householdId)
  const today = todayInPrague()
  const periodStart = periodStartFor(config, today)
  const available = maxDeposit(await loadPeriodBalance(db, householdId, config, periodStart))
  if (valid.amount > available) throw new Error(available > 0 ? `V rozpočtu není dost peněz. Můžete uložit nejvýše ${money(available)}.` : 'V rozpočtu teď nejsou žádné volné peníze.')
  await db.insert(schema.pocketTransfers).values({ householdId, pocketId, periodStart, amount: valid.amount.toString(), date: today })
}

/** Kapsa → Rozpočet: money taken out of a Kapsa back into the current period. Never below its balance. */
export async function withdrawFromPocketAction(pocketId: string, amount: number): Promise<void> {
  const householdId = await requireHouseholdId()
  await ownPocket(householdId, pocketId)
  const valid = validateTransferAmount(amount)
  if ('error' in valid) throw new Error(valid.error)
  const db = getDb()
  const config = await loadPeriodConfig(db, householdId)
  const today = todayInPrague()
  const current = (await loadPockets(db, householdId, config, today)).find((item) => item.id === pocketId)
  if (!current) throw new Error('Kapsa nebyla nalezena.')
  if (valid.amount > current.balance) throw new Error('V Kapse není dost peněz.')
  await db.insert(schema.pocketTransfers).values({ householdId, pocketId, periodStart: periodStartFor(config, today), amount: (-valid.amount).toString(), date: today })
}
