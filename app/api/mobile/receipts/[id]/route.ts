import { NextResponse } from 'next/server'
import { ITEM_UNITS } from '@anitka/shared/units'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { toReceiptImportState } from '@/lib/db/queries'
import { cancelReceiptImportForHousehold, confirmReceiptReviewForHousehold, processReceiptImportForHousehold, resolveDuplicateReceiptForHousehold } from '@/lib/receipt-import'
import { PANTRY_LOCATIONS } from '@/lib/pantry'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { ItemCategory } from '@/lib/types'
import { getReceiptListSuggestions } from '@/lib/db/receipt-list'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ITEM_CATEGORIES: readonly ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function reviewItems(value: unknown): ReceiptLineItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null
  const allowed = new Set(['name', 'category', 'quantity', 'unit', 'price', 'discount', 'unitPriceUnknown', 'location', 'customPlaceId', 'confidence', 'subcategory', 'classificationSource', 'recognitionMethod', 'nonInventory', 'removed', 'rawName', 'productId', 'productSuggestions', 'productTypeKey', 'productTypeSelectionChanged', 'typeSuggestions'])
  const result: ReceiptLineItem[] = []
  for (const valueItem of value) {
    if (!isRecord(valueItem) || Object.keys(valueItem).some((key) => !allowed.has(key))) return null
    const item = valueItem
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 300) return null
    if (typeof item.category !== 'string' || !ITEM_CATEGORIES.includes(item.category as ItemCategory)) return null
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) return null
    if (typeof item.unit !== 'string' || !(ITEM_UNITS as readonly string[]).includes(item.unit)) return null
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) return null
    if (item.discount !== undefined && (typeof item.discount !== 'number' || !Number.isFinite(item.discount) || item.discount < 0)) return null
    if (item.location !== undefined && (typeof item.location !== 'string' || !(PANTRY_LOCATIONS as readonly string[]).includes(item.location))) return null
    if (item.customPlaceId !== undefined && (typeof item.customPlaceId !== 'string' || !UUID_PATTERN.test(item.customPlaceId))) return null
    if (item.subcategory !== undefined && item.subcategory !== null && typeof item.subcategory !== 'string') return null
    if (item.classificationSource !== undefined && item.classificationSource !== 'manual') return null
    if (item.productId !== undefined && item.productId !== null && typeof item.productId !== 'string') return null
    if (item.productTypeKey !== undefined && item.productTypeKey !== null && typeof item.productTypeKey !== 'string') return null
    for (const key of ['unitPriceUnknown', 'nonInventory', 'removed', 'productTypeSelectionChanged'] as const) {
      if (item[key] !== undefined && typeof item[key] !== 'boolean') return null
    }
    if (item.confidence !== undefined && (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence))) return null
    if (item.rawName !== undefined && typeof item.rawName !== 'string') return null
    if (item.recognitionMethod !== undefined && typeof item.recognitionMethod !== 'string') return null
    if (item.productSuggestions !== undefined && (!Array.isArray(item.productSuggestions) || item.productSuggestions.some((entry) => !isRecord(entry) || typeof entry.productId !== 'string' || typeof entry.name !== 'string' || (entry.productTypeKey != null && typeof entry.productTypeKey !== 'string')))) return null
    if (item.typeSuggestions !== undefined && (!Array.isArray(item.typeSuggestions) || item.typeSuggestions.some((entry) => !isRecord(entry) || typeof entry.key !== 'string' || typeof entry.name !== 'string'))) return null
    result.push(item as unknown as ReceiptLineItem)
  }
  return result
}

function reviewError(error: unknown) {
  if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
  if (error instanceof Error && error.message === 'Receipt import not found') return json({ error: 'receipt_not_found' }, 404)
  if (error instanceof Error && /nečeká na kontrolu|nečeká na vyřešení duplicity|už vytvořil nákup|nelze zrušit|už není dostupný|znovu otevřen/i.test(error.message)) return json({ error: 'receipt_state_conflict', message: error.message }, 409)
  if (error instanceof Error && /Datum nákupu|Neplatná kategorie|Neplatná podkategorie|sleva u položky|Vlastní místo|Vybraný produkt|Neplatný druh zboží|Receipt has no items/i.test(error.message)) return json({ error: 'invalid_receipt_review', message: error.message }, 400)
  console.error('[mobile receipt review]', error)
  return json({ error: 'request_failed' }, 500)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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

/** Confirm the OCR line review or resolve a suspected duplicate using the authenticated household. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return json({ error: 'receipt_not_found' }, 404)

    let body: unknown
    try { body = await request.json() } catch { return json({ error: 'invalid_request' }, 400) }
    if (!isRecord(body) || typeof body.action !== 'string') return json({ error: 'invalid_request' }, 400)
    const date = body.date
    if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) return json({ error: 'invalid_request' }, 400)

    if (body.action === 'confirm') {
      if (Object.keys(body).some((key) => !['action', 'items', 'date'].includes(key))) return json({ error: 'invalid_request' }, 400)
      const items = reviewItems(body.items)
      if (!items) return json({ error: 'invalid_receipt_review' }, 400)
      const result = await confirmReceiptReviewForHousehold(household.householdId, id, items, { date })
      return json({ purchase: result.purchase, aftermath: result.aftermath, suggestions: await getReceiptListSuggestions(household.householdId, result.purchase.id), receipt: { id, status: 'completed' } })
    }

    if (body.action === 'resolve_duplicate') {
      if (Object.keys(body).some((key) => !['action', 'resolution', 'items', 'date'].includes(key))) return json({ error: 'invalid_request' }, 400)
      if (body.resolution !== 'save_new' && body.resolution !== 'use_existing' && body.resolution !== 'cancel') return json({ error: 'invalid_request' }, 400)
      const parsedItems = body.items === undefined ? undefined : reviewItems(body.items)
      if (body.items !== undefined && !parsedItems) return json({ error: 'invalid_receipt_review' }, 400)
      const items = parsedItems ?? undefined
      const result = await resolveDuplicateReceiptForHousehold(household.householdId, id, body.resolution, items, { date })
      return json({ purchase: result.purchase, aftermath: result.aftermath, suggestions: result.purchase ? await getReceiptListSuggestions(household.householdId, result.purchase.id) : [], receipt: { id, status: result.purchase ? 'completed' : 'cancelled' } })
    }

    return json({ error: 'invalid_request' }, 400)
  } catch (error) {
    return reviewError(error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return json({ error: 'receipt_not_found' }, 404)
    await cancelReceiptImportForHousehold(household.householdId, id)
    return json({ ok: true })
  } catch (error) {
    return reviewError(error)
  }
}
