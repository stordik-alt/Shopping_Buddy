import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { toReceiptImportState } from '@/lib/db/queries'
import { processReceiptImportForHousehold } from '@/lib/receipt-import'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!request.headers.has('authorization')) return json({ error: 'not_signed_in' }, 401)
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)

    const { id } = await params
    if (!UUID_PATTERN.test(id)) return json({ error: 'receipt_not_found' }, 404)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    const retry = body && typeof body === 'object' && 'retry' in body ? body.retry : null
    if (typeof retry !== 'boolean') return json({ error: 'invalid_request' }, 400)

    const attempt = await processReceiptImportForHousehold(household.householdId, id, retry)
    if (attempt.kind === 'rate_limited') return json({ error: 'ocr_rate_limited', message: attempt.error }, 429)
    if (attempt.kind === 'not_claimed') {
      return json({ error: retry ? 'receipt_retry_unavailable' : 'receipt_already_processing' }, 409)
    }
    return json({ receipt: toReceiptImportState(attempt.row) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof Error && error.message === 'Receipt import not found') return json({ error: 'receipt_not_found' }, 404)
    console.error('[mobile receipt processing]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
