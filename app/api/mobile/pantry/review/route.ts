import { NextResponse } from 'next/server'
import { MobileRequestAuthError, mobileHouseholdForUser, mobileUserFromRequest } from '@/lib/auth/mobile-request'
import { PantryReviewInputError, PantryReviewNotFoundError, reviewPantryForHousehold } from '@/lib/pantry-review'
import type { PantryQuantityChange } from '@/lib/pantry'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!isRecord(body) || Object.keys(body).some((key) => !['reviewedIds', 'goneIds', 'quantities'].includes(key))) {
      return json({ error: 'invalid_review' }, 400)
    }
    if (!Array.isArray(body.reviewedIds) || !Array.isArray(body.goneIds)) return json({ error: 'invalid_review' }, 400)

    const result = await reviewPantryForHousehold({
      householdId: member.householdId,
      reviewedIds: body.reviewedIds as string[],
      goneIds: body.goneIds as string[],
      quantities: body.quantities as PantryQuantityChange[] | undefined,
    })
    return json(result)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof PantryReviewInputError) return json({ error: 'invalid_review', message: error.message }, 400)
    if (error instanceof PantryReviewNotFoundError) return json({ error: 'not_found' }, 404)
    console.error('[mobile pantry review]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
