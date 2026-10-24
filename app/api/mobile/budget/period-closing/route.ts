import { and, eq, gte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { canClosePeriod, carryIntoPeriod, periodResult, planClosing, type PocketAmount } from '@/lib/budget-closing'
import { nextPeriodStartFor, periodStartFor } from '@/lib/budget-period'
import { recordAudit } from '@/lib/db/audit'
import { loadClosedPeriods, loadPeriodMoney, loadPockets } from '@/lib/db/period-ledger'
import { getDb } from '@/lib/db/client'
import { loadPeriodConfig } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { isIsoDate } from '@/lib/income-input'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
function pocketAmounts(value: unknown): PocketAmount[] | null {
  if (!Array.isArray(value) || value.some((row) => !isObject(row) || typeof row.pocketId !== 'string' || typeof row.amount !== 'number')) return null
  return value as PocketAmount[]
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    if (member.role !== 'owner') return json({ error: 'forbidden', message: 'Období může uzavřít nebo otevřít jen správce domácnosti.' }, 403)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!isObject(body) || typeof body.action !== 'string') return json({ error: 'invalid_request' }, 400)
    const db = getDb()
    const config = await loadPeriodConfig(db, member.householdId)
    const today = todayInPrague()

    if (body.action === 'close') {
      const deposits = pocketAmounts(body.deposits), withdrawals = pocketAmounts(body.withdrawals)
      if (Object.keys(body).some((key) => !['action', 'periodStart', 'deposits', 'withdrawals', 'carryOn'].includes(key)) || typeof body.periodStart !== 'string' || !isIsoDate(body.periodStart) || !deposits || !withdrawals || typeof body.carryOn !== 'number') return json({ error: 'invalid_close', message: 'Rozdělení výsledku období není platné.' }, 400)
      const periodStart = periodStartFor(config, body.periodStart)
      const periodEnd = nextPeriodStartFor(config, periodStart)
      if (!canClosePeriod(periodEnd, today)) return json({ error: 'period_not_finished', message: 'Období ještě neskončilo.' }, 400)
      const closed = await loadClosedPeriods(db, member.householdId)
      if (closed.some((period) => period.periodStart === periodStart)) return json({ error: 'already_closed', message: 'Toto období už je uzavřené.' }, 409)
      const money = await loadPeriodMoney(db, member.householdId, periodStart, periodEnd)
      const carryIn = carryIntoPeriod(closed, periodStart)
      const result = periodResult(money, carryIn)
      const pockets = await loadPockets(db, member.householdId, config, today)
      const calculated = planClosing(result, { deposits, withdrawals, carryOn: body.carryOn }, new Map(pockets.map((pocket) => [pocket.id, pocket.balance])))
      if ('error' in calculated) return json({ error: 'invalid_split', message: calculated.error }, 400)
      const closingId = crypto.randomUUID()
      const writes = [
        db.insert(schema.periodClosings).values({ id: closingId, householdId: member.householdId, periodStart, periodEnd, keptAmount: calculated.plan.kept.toString() }),
        ...calculated.plan.moves.map((move) => db.insert(schema.pocketTransfers).values({ householdId: member.householdId, pocketId: move.pocketId, periodStart, closingId, amount: move.amount.toString(), date: today })),
        db.delete(schema.plannedCarries).where(and(eq(schema.plannedCarries.householdId, member.householdId), eq(schema.plannedCarries.periodStart, periodStart))),
      ]
      try { await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]) }
      catch (error) {
        const latest = await loadClosedPeriods(db, member.householdId)
        if (latest.some((period) => period.periodStart === periodStart)) return json({ error: 'already_closed', message: 'Toto období už mezitím uzavřel někdo jiný.' }, 409)
        throw error
      }
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'period.closed', { period: periodStart })
      return json({ ok: true })
    }

    if (body.action === 'reopen') {
      if (Object.keys(body).some((key) => !['action', 'periodStart'].includes(key)) || typeof body.periodStart !== 'string' || !isIsoDate(body.periodStart)) return json({ error: 'invalid_period', message: 'Neplatné období.' }, 400)
      const periodStart = periodStartFor(config, body.periodStart)
      const closing = await db.query.periodClosings.findFirst({ where: and(eq(schema.periodClosings.householdId, member.householdId), eq(schema.periodClosings.periodStart, periodStart)) })
      if (!closing) return json({ error: 'not_closed', message: 'Toto období není uzavřené.' }, 404)
      const later = await db.query.periodClosings.findFirst({ where: and(eq(schema.periodClosings.householdId, member.householdId), gte(schema.periodClosings.periodStart, closing.periodEnd)) })
      if (later) return json({ error: 'later_period_closed', message: 'Nejdřív znovu otevřete následující uzavřené období.' }, 409)
      const moves = await db.query.pocketTransfers.findMany({ where: and(eq(schema.pocketTransfers.householdId, member.householdId), eq(schema.pocketTransfers.closingId, closing.id)) })
      if (moves.length) {
        const balances = new Map((await loadPockets(db, member.householdId, config, today)).map((pocket) => [pocket.id, pocket.balance]))
        for (const move of moves) {
          const after = (balances.get(move.pocketId) ?? 0) - Number(move.amount)
          if (after < -0.005) return json({ error: 'pocket_spent', message: 'Peníze z uzavření už byly použity. Období nelze znovu otevřít.' }, 409)
          balances.set(move.pocketId, after)
        }
      }
      await db.delete(schema.periodClosings).where(and(eq(schema.periodClosings.id, closing.id), eq(schema.periodClosings.householdId, member.householdId)))
      await recordAudit({ householdId: member.householdId, memberId: member.id }, 'period.reopened', { period: periodStart })
      return json({ ok: true })
    }
    return json({ error: 'invalid_action' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile budget period closing]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
