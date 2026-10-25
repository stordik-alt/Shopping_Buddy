import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getTickedListItems } from '@/lib/db/queries'
import { applyConfirmedReceiptListPairs, getReceiptListSuggestions } from '@/lib/db/receipt-list'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ purchaseId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)
    const { purchaseId } = await params
    if (!UUID_PATTERN.test(purchaseId)) return json({ error: 'not_found' }, 404)
    return json({ suggestions: await getReceiptListSuggestions(household.householdId, purchaseId) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile receipt list suggestions]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ purchaseId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)
    const { purchaseId } = await params
    if (!UUID_PATTERN.test(purchaseId)) return json({ error: 'not_found' }, 404)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400)
    const input = body as Record<string, unknown>
    if (Object.keys(input).length !== 1 || !Array.isArray(input.pairs) || input.pairs.length > 100 || input.pairs.some((pair) => {
      if (!pair || typeof pair !== 'object' || Array.isArray(pair)) return true
      const entry = pair as Record<string, unknown>
      return Object.keys(entry).length !== 2 || typeof entry.listItemId !== 'string' || !UUID_PATTERN.test(entry.listItemId) || typeof entry.purchaseItemId !== 'string' || !UUID_PATTERN.test(entry.purchaseItemId)
    })) return json({ error: 'invalid_request' }, 400)
    const pairs = input.pairs as { listItemId: string; purchaseItemId: string }[]
    const checked = await applyConfirmedReceiptListPairs(household.householdId, purchaseId, pairs)
    return json({ checked, tickedListItems: await getTickedListItems(household.householdId, purchaseId) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile receipt list confirmation]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
