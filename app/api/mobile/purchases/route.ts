import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getHouseholdPurchaseHistory } from '@/lib/db/queries'
import { createManualPurchaseForHousehold, ManualPurchaseInputError } from '@/lib/db/manual-purchase'
import type { ItemCategory, ItemUnit, ManualPurchaseInput } from '@/lib/types'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    return json({ purchases: await getHouseholdPurchaseHistory(member.householdId) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile purchases]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function manualPurchaseInput(value: unknown): ManualPurchaseInput | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !['date', 'storeChain', 'discount', 'items'].includes(key))) return null
  if (typeof value.date !== 'string' || !Array.isArray(value.items)) return null
  if (value.storeChain !== undefined && value.storeChain !== null && typeof value.storeChain !== 'string') return null
  if (value.discount !== undefined && value.discount !== null && typeof value.discount !== 'number') return null
  const items = value.items.map((item) => {
    if (!isRecord(item) || Object.keys(item).some((key) => !['name', 'quantity', 'unit', 'price', 'category', 'subcategory'].includes(key))) return null
    if (typeof item.name !== 'string' || typeof item.quantity !== 'number' || typeof item.unit !== 'string' || typeof item.price !== 'number' || typeof item.category !== 'string') return null
    if (item.subcategory !== undefined && item.subcategory !== null && typeof item.subcategory !== 'string') return null
    return {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit as ItemUnit,
      price: item.price,
      category: item.category as ItemCategory,
      ...(item.subcategory !== undefined ? { subcategory: item.subcategory as string | null } : {}),
    }
  })
  const validItems = items.filter((item): item is ManualPurchaseInput['items'][number] => item !== null)
  if (validItems.length !== items.length) return null
  return {
    date: value.date,
    ...(value.storeChain !== undefined ? { storeChain: value.storeChain as string | null } : {}),
    ...(value.discount !== undefined ? { discount: value.discount as number | null } : {}),
    items: validItems,
  }
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let body: unknown
    try { body = await request.json() } catch { return json({ error: 'invalid_request' }, 400) }
    const input = manualPurchaseInput(body)
    if (!input) return json({ error: 'invalid_manual_purchase', message: 'Zkontrolujte datum a položky nákupu.' }, 400)
    const result = await createManualPurchaseForHousehold(member.householdId, input)
    return json(result, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof ManualPurchaseInputError) return json({ error: 'invalid_manual_purchase', message: error.message }, 400)
    console.error('[mobile purchase create]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
