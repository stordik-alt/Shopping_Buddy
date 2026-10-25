import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { assertOwnsReceiptImport } from '@/lib/receipt-import'
import { getReceiptFile } from '@/lib/storage'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** Streams a private receipt source to the native review screen after bearer auth and household ownership checks. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return json({ error: 'receipt_not_found' }, 404)
    const row = await assertOwnsReceiptImport(household.householdId, id)
    if (!row.imageUrl) return json({ error: 'receipt_image_not_found' }, 404)
    const file = await getReceiptFile(row.imageUrl)
    if (!file) return json({ error: 'receipt_image_not_found' }, 404)
    return new Response(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof Error && error.message === 'Receipt import not found') return json({ error: 'receipt_not_found' }, 404)
    console.error('[mobile receipt image]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
