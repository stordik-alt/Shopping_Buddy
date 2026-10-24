import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { buildShoppingPlan, listPinsForHousehold, pinProduct, PlanInputError, unpinProduct } from '@/lib/db/shopping-plan'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100

async function context(request: Request) {
  const user = await mobileUserFromRequest(request)
  const member = await mobileHouseholdForUser(user.id)
  return member ? { member } : null
}

export async function GET(request: Request) {
  try {
    const authenticated = await context(request)
    if (!authenticated) return json({ error: 'household_required' }, 409)
    return json({ pins: await listPinsForHousehold(authenticated.member.householdId) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile shopping plan pins]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request) {
  try {
    const authenticated = await context(request)
    if (!authenticated) return json({ error: 'household_required' }, 409)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!isRecord(body) || typeof body.action !== 'string') return json({ error: 'invalid_request' }, 400)

    if (body.action === 'build') {
      if (Object.keys(body).some((key) => !['action', 'maxStores', 'priorityChainIds'].includes(key)) || typeof body.maxStores !== 'number' || !Array.isArray(body.priorityChainIds) || body.priorityChainIds.length > 50 || !body.priorityChainIds.every(isId)) {
        return json({ error: 'invalid_request', message: 'Neplatný požadavek na plán.' }, 400)
      }
      const result = await buildShoppingPlan(authenticated.member.householdId, authenticated.member.id, { maxStores: body.maxStores, priorityChainIds: body.priorityChainIds })
      return json(result)
    }

    if (body.action === 'pin') {
      if (Object.keys(body).some((key) => !['action', 'itemId', 'storeId', 'productId'].includes(key)) || !isId(body.itemId) || !isId(body.storeId) || !isId(body.productId)) return json({ error: 'invalid_request' }, 400)
      await pinProduct(authenticated.member.householdId, body.itemId, body.storeId, body.productId)
      return json({ ok: true })
    }

    if (body.action === 'unpin') {
      if (Object.keys(body).some((key) => !['action', 'itemId', 'storeId'].includes(key)) || !isId(body.itemId) || !isId(body.storeId)) return json({ error: 'invalid_request' }, 400)
      await unpinProduct(authenticated.member.householdId, body.itemId, body.storeId)
      return json({ ok: true })
    }

    return json({ error: 'invalid_request' }, 400)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof PlanInputError) return json({ error: 'invalid_plan', message: error.message }, 400)
    console.error('[mobile shopping plan]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
