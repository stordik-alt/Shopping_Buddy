import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getHouseholdExpenses, getHouseholdNotifications } from '@/lib/db/queries'
import { deletePurchase, PurchaseToDeleteNotFoundError } from '@/lib/db/purchase-deletion'
import { AlreadyRecordedError, NothingToRecordError, NotFromReceiptError, PurchaseNotFoundError, recordPurchaseAsExpense } from '@/lib/db/purchase-items'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function authorizedPurchase(request: Request) {
  const user = await mobileUserFromRequest(request)
  const member = await mobileHouseholdForUser(user.id)
  return member ? { user, member } : null
}

export async function POST(request: Request, { params }: { params: Promise<{ purchaseId: string }> }) {
  try {
    const auth = await authorizedPurchase(request)
    if (!auth) return json({ error: 'household_required' }, 409)
    const { purchaseId } = await params
    if (!UUID_PATTERN.test(purchaseId)) return json({ error: 'purchase_not_found' }, 404)

    await recordPurchaseAsExpense(auth.member.householdId, purchaseId)
    const [expenses, notifications] = await Promise.all([
      getHouseholdExpenses(auth.member.householdId, purchaseId),
      getHouseholdNotifications(auth.member.householdId),
    ])
    return json({ expenses, notifications })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof PurchaseNotFoundError) return json({ error: 'purchase_not_found' }, 404)
    if (error instanceof AlreadyRecordedError || error instanceof NotFromReceiptError || error instanceof NothingToRecordError) {
      return json({ error: 'purchase_cannot_be_recorded', message: error.message }, 400)
    }
    console.error('[mobile purchase record expenses]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ purchaseId: string }> }) {
  try {
    const auth = await authorizedPurchase(request)
    if (!auth) return json({ error: 'household_required' }, 409)
    const { purchaseId } = await params
    if (!UUID_PATTERN.test(purchaseId)) return json({ error: 'purchase_not_found' }, 404)

    const deleted = await deletePurchase(auth.member.householdId, purchaseId)
    await recordAudit({ householdId: auth.member.householdId, memberId: auth.member.id }, 'purchase.deleted', { date: deleted.date }, purchaseId)
    return json({ date: deleted.date })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof PurchaseToDeleteNotFoundError) return json({ error: 'purchase_not_found' }, 404)
    console.error('[mobile purchase delete]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
