import { and, eq, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getRestockDismissals } from '@/lib/db/restock'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { productTypeByKey } from '@/lib/product-types'
import { todayInPrague } from '@/lib/today'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const isIsoDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!isRecord(body) || Object.keys(body).some((key) => !['productTypeKey', 'productId', 'validUntil'].includes(key))) return json({ error: 'invalid_request' }, 400)
    const { productTypeKey, productId, validUntil } = body
    if (typeof productTypeKey !== 'string' || !productTypeByKey(productTypeKey)) return json({ error: 'invalid_product_type' }, 400)
    if (typeof productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return json({ error: 'invalid_product' }, 400)
    if (!isIsoDay(validUntil)) return json({ error: 'invalid_date' }, 400)

    const db = getDb()
    const [type, product] = await Promise.all([
      db.query.productTypes.findFirst({ where: eq(schema.productTypes.key, productTypeKey), columns: { id: true } }),
      db.query.products.findFirst({ where: eq(schema.products.id, productId), columns: { id: true } }),
    ])
    if (!type || !product) return json({ error: 'invalid_suggestion' }, 400)
    const today = todayInPrague()
    await db.insert(schema.restockDismissals).values({ householdId: member.householdId, productTypeId: type.id, productId, validUntil }).onConflictDoNothing()
    await db.delete(schema.restockDismissals).where(and(eq(schema.restockDismissals.householdId, member.householdId), lt(schema.restockDismissals.validUntil, today)))
    return json({ dismissed: await getRestockDismissals(member.householdId, today) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile restock dismissal]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
