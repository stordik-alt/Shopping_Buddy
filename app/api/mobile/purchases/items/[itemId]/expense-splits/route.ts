import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getHouseholdExpenses } from '@/lib/db/queries'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { InvalidExpenseCategoryError, InvalidExpenseSplitError, PurchaseNotFoundError, setPurchaseItemExpenseSplits } from '@/lib/db/purchase-items'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

function splitsInput(value: unknown): ExpenseSplitPart[] | null {
  if (!Array.isArray(value) || value.length > 20) return null
  const splits: ExpenseSplitPart[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null
    const row = entry as Record<string, unknown>
    if (Object.keys(row).some((key) => !['category', 'subcategory', 'amount'].includes(key))) return null
    if (typeof row.category !== 'string' || typeof row.amount !== 'number') return null
    if (row.subcategory !== null && typeof row.subcategory !== 'string') return null
    splits.push({ category: row.category as ExpenseSplitPart['category'], subcategory: row.subcategory, amount: row.amount })
  }
  return splits
}

export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { itemId } = await params
    let body: unknown
    try { body = await request.json() } catch { return json({ error: 'invalid_request' }, 400) }
    if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'splits')) {
      return json({ error: 'invalid_expense_splits', message: 'Rozdělení výdaje nemá platný formát.' }, 400)
    }
    const splits = splitsInput((body as Record<string, unknown>).splits)
    if (!splits) return json({ error: 'invalid_expense_splits', message: 'Rozdělení výdaje nemá platný formát.' }, 400)

    await setPurchaseItemExpenseSplits(member.householdId, itemId, splits)
    const item = await getDb().query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.id, itemId), columns: { purchaseId: true } })
    const expenses = await getHouseholdExpenses(member.householdId, item?.purchaseId)
    return json({ expenses })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof PurchaseNotFoundError) return json({ error: 'purchase_item_not_found' }, 404)
    if (error instanceof InvalidExpenseCategoryError || error instanceof InvalidExpenseSplitError) {
      return json({ error: 'invalid_expense_splits', message: error.message }, 400)
    }
    console.error('[mobile purchase item expense splits]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
