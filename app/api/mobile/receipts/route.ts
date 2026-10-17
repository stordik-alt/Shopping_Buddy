import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getPendingReceiptImports } from '@/lib/db/queries'
import { MAX_IMAGE_BYTES, uploadReceiptForHousehold } from '@/lib/receipt-upload-server'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request: Request) {
  try {
    if (!request.headers.has('authorization')) return json({ error: 'not_signed_in' }, 401)
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)
    return json({ receipts: await getPendingReceiptImports(household.householdId) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile receipts list]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.has('authorization')) return json({ error: 'not_signed_in' }, 401)
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)

    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES + 64 * 1024) {
      return json({ error: 'image_too_large', message: 'Fotografie je příliš velká (max. 10 MB).' }, 413)
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return json({ error: 'invalid_file' }, 400)
    }

    const result = await uploadReceiptForHousehold(household.householdId, formData.get('file'))
    if (!result.ok) {
      const status = result.code === 'image_too_large' ? 413
        : result.code === 'unsupported_format' ? 415
          : result.code === 'upload_limit' ? 429
            : result.code === 'upload_failed' ? 503
              : 400
      return json({ error: result.code, message: result.error }, status)
    }
    return json({ receipt: result.receipt }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile receipt upload]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
