import { and, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { maxDeposit } from '@/lib/budget-closing'
import { periodStartFor } from '@/lib/budget-period'
import { getDb } from '@/lib/db/client'
import { loadPeriodBalance, loadPockets } from '@/lib/db/period-ledger'
import { loadPeriodConfig } from '@/lib/db/period-config'
import * as schema from '@/lib/db/schema'
import { validatePocketInput, validateTransferAmount, type PocketInput } from '@/lib/pocket-input'
import { todayInPrague } from '@/lib/today'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const fields = ['name', 'icon', 'targetAmount', 'targetDate', 'openingAmount', 'plannedContribution', 'isReserve']
function pocketInput(body: Record<string, unknown>): PocketInput | null {
  if (Object.keys(body).some((key) => !fields.includes(key)) || typeof body.name !== 'string' || typeof body.icon !== 'string' || typeof body.openingAmount !== 'number' || (body.targetAmount !== null && typeof body.targetAmount !== 'number') || (body.targetDate !== null && typeof body.targetDate !== 'string') || (body.plannedContribution !== null && typeof body.plannedContribution !== 'number') || (body.isReserve !== undefined && typeof body.isReserve !== 'boolean')) return null
  return { name: body.name, icon: body.icon, targetAmount: body.targetAmount as number | null, targetDate: body.targetDate as string | null, openingAmount: body.openingAmount, plannedContribution: body.plannedContribution as number | null, isReserve: body.isReserve === true }
}
function releaseReserve(db: ReturnType<typeof getDb>, householdId: string) {
  return db.update(schema.pockets).set({ isReserve: false }).where(and(eq(schema.pockets.householdId, householdId), eq(schema.pockets.isReserve, true), isNull(schema.pockets.archivedAt)))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ pocketId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { pocketId } = await params
    const db = getDb()
    const existing = await db.query.pockets.findFirst({ where: and(eq(schema.pockets.id, pocketId), eq(schema.pockets.householdId, member.householdId), isNull(schema.pockets.archivedAt)) })
    if (!existing) return json({ error: 'pocket_not_found' }, 404)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!isObject(body) || typeof body.action !== 'string') return json({ error: 'invalid_request' }, 400)
    const today = todayInPrague()
    const config = await loadPeriodConfig(db, member.householdId)
    const currentStart = periodStartFor(config, today)
    const pockets = () => loadPockets(db, member.householdId, config, today)

    if (body.action === 'save') {
      const input = pocketInput(Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'action')))
      if (!input) return json({ error: 'invalid_pocket', message: 'Vyplňte název, ikonu a částky Kapsy.' }, 400)
      const checked = validatePocketInput(input)
      if ('error' in checked) return json({ error: 'invalid_pocket', message: checked.error }, 400)
      const pocket = checked.pocket
      const current = (await pockets()).find((row) => row.id === pocketId)
      if (!current) return json({ error: 'pocket_not_found' }, 404)
      if (current.balance - Number(existing.openingAmount) + pocket.openingAmount < 0) return json({ error: 'invalid_pocket', message: 'S touto počáteční částkou by zůstatek Kapsy byl záporný.' }, 400)
      const update = db.update(schema.pockets).set({ name: pocket.name, icon: pocket.icon, targetAmount: pocket.targetAmount?.toString() ?? null, targetDate: pocket.targetDate, openingAmount: pocket.openingAmount.toString(), plannedContribution: pocket.plannedContribution?.toString() ?? null, isReserve: pocket.isReserve }).where(and(eq(schema.pockets.id, pocketId), eq(schema.pockets.householdId, member.householdId)))
      if (pocket.isReserve) await db.batch([releaseReserve(db, member.householdId), update])
      else await update
      return json({ ok: true })
    }

    if (body.action === 'archive') {
      if (Object.keys(body).length !== 1) return json({ error: 'invalid_request' }, 400)
      const current = (await pockets()).find((row) => row.id === pocketId)
      if (!current) return json({ error: 'pocket_not_found' }, 404)
      if (Math.abs(current.balance) >= 0.005) return json({ error: 'pocket_not_empty', message: 'Kapsa není prázdná. Nejdřív z ní peníze vraťte do rozpočtu.' }, 409)
      await db.update(schema.pockets).set({ archivedAt: new Date() }).where(and(eq(schema.pockets.id, pocketId), eq(schema.pockets.householdId, member.householdId)))
      return json({ ok: true })
    }

    if ((body.action === 'deposit' || body.action === 'withdraw') && typeof body.amount === 'number' && Object.keys(body).length === 2) {
      const checked = validateTransferAmount(body.amount)
      if ('error' in checked) return json({ error: 'invalid_amount', message: checked.error }, 400)
      const current = (await pockets()).find((row) => row.id === pocketId)
      if (!current) return json({ error: 'pocket_not_found' }, 404)
      let signedAmount: number
      if (body.action === 'deposit') {
        const available = maxDeposit(await loadPeriodBalance(db, member.householdId, config, currentStart))
        if (checked.amount > available) return json({ error: 'insufficient_budget', message: available > 0 ? `V rozpočtu není dost peněz. Můžete uložit nejvýše ${available.toLocaleString('cs-CZ')} Kč.` : 'V rozpočtu teď nejsou žádné volné peníze.' }, 409)
        signedAmount = checked.amount
      } else {
        if (checked.amount > current.balance) return json({ error: 'insufficient_pocket', message: 'V Kapse není dost peněz.' }, 409)
        signedAmount = -checked.amount
      }
      await db.insert(schema.pocketTransfers).values({ householdId: member.householdId, pocketId, periodStart: currentStart, amount: signedAmount.toString(), date: today })
      return json({ ok: true })
    }
    return json({ error: 'invalid_action' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile pocket update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
