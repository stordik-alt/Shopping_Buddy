import { ITEM_UNITS } from '@anitka/shared/units'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { importManualReceiptForHousehold } from '@/lib/receipt-import'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { ItemCategory } from '@/lib/types'

const NO_STORE = { 'Cache-Control': 'no-store' }
const ITEM_CATEGORIES: readonly ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function manualReceiptInput(value: unknown): { items: ReceiptLineItem[]; options: { date: string; storeName?: string; receiptDiscountTotal?: number | null } } | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !['date', 'storeName', 'discount', 'items'].includes(key))) return null
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Array.isArray(value.items) || value.items.length === 0 || value.items.length > 100) return null
  if (value.storeName !== undefined && value.storeName !== null && (typeof value.storeName !== 'string' || value.storeName.length > 120)) return null
  if (value.discount !== undefined && value.discount !== null && (typeof value.discount !== 'number' || !Number.isFinite(value.discount) || value.discount < 0)) return null

  const items: ReceiptLineItem[] = []
  for (const entry of value.items) {
    if (!isRecord(entry) || Object.keys(entry).some((key) => !['name', 'quantity', 'unit', 'price', 'category', 'subcategory'].includes(key))) return null
    if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 300) return null
    if (typeof entry.quantity !== 'number' || !Number.isFinite(entry.quantity) || entry.quantity <= 0) return null
    if (typeof entry.price !== 'number' || !Number.isFinite(entry.price) || entry.price < 0) return null
    if (typeof entry.unit !== 'string' || !(ITEM_UNITS as readonly string[]).includes(entry.unit)) return null
    if (typeof entry.category !== 'string' || !ITEM_CATEGORIES.includes(entry.category as ItemCategory)) return null
    if (entry.subcategory !== undefined && entry.subcategory !== null && typeof entry.subcategory !== 'string') return null
    items.push({
      name: entry.name.trim(),
      quantity: entry.quantity,
      unit: entry.unit as ReceiptLineItem['unit'],
      price: entry.price,
      category: entry.category as ItemCategory,
      ...(typeof entry.subcategory === 'string' && entry.subcategory ? { subcategory: entry.subcategory } : {}),
      // Manual controls are an explicit household choice. Receipt import still validates the
      // category/subcategory and gives known catalog products the same established precedence.
      classificationSource: 'manual',
    })
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  if (typeof value.discount === 'number' && value.discount > subtotal + 0.005) return null

  return {
    items,
    options: {
      date: value.date,
      ...(typeof value.storeName === 'string' && value.storeName.trim() ? { storeName: value.storeName.trim() } : {}),
      ...(typeof value.discount === 'number' ? { receiptDiscountTotal: value.discount } : {}),
    },
  }
}

export async function POST(request: Request) {
  try {
    if (!request.headers.has('authorization')) return json({ error: 'not_signed_in' }, 401)
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)

    let body: unknown
    try { body = await request.json() } catch { return json({ error: 'invalid_request' }, 400) }
    const input = manualReceiptInput(body)
    if (!input) return json({ error: 'invalid_manual_receipt', message: 'Zkontrolujte datum, slevu a položky účtenky.' }, 400)

    const result = await importManualReceiptForHousehold(household.householdId, input.items, input.options)
    return json({ receipt: result.receipt, purchase: result.purchase }, 201)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof Error && /Datum nákupu|Neplatná kategorie|Neplatná podkategorie|sleva u položky/i.test(error.message)) {
      return json({ error: 'invalid_manual_receipt', message: error.message }, 400)
    }
    console.error('[mobile manual receipt import]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
