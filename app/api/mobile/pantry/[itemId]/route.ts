import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { PantryInputError, PantryResourceNotFoundError, updatePantryItemForHousehold } from '@/lib/pantry-mobile-mutations'
import { ITEM_UNITS } from '@anitka/shared/units'
import { PANTRY_TRACKING } from '@/lib/pantry'
import type { ItemCategory, ItemUnit } from '@/lib/types'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const body = await bodyObject(request)
    if (!body || Object.keys(body).length !== 1) return json({ error: 'invalid_request' }, 400)
    const { itemId } = await context.params
    if ('quantity' in body && typeof body.quantity === 'number') {
      await updatePantryItemForHousehold(member.householdId, itemId, { quantity: body.quantity })
    } else if ('placeKey' in body && typeof body.placeKey === 'string') {
      await updatePantryItemForHousehold(member.householdId, itemId, { placeKey: body.placeKey })
    } else if ('category' in body && typeof body.category === 'string') {
      const result = await updatePantryItemForHousehold(member.householdId, itemId, { category: body.category as ItemCategory })
      if (result && 'categoryOutcome' in result && result.categoryOutcome === 'locked') return json({ error: 'Tento produkt už má uzamčenou kategorii.' }, 409)
    } else if ('subcategory' in body && (body.subcategory === null || typeof body.subcategory === 'string')) {
      await updatePantryItemForHousehold(member.householdId, itemId, { subcategory: body.subcategory as string | null })
    } else if ('productTypeKey' in body && (body.productTypeKey === null || typeof body.productTypeKey === 'string')) {
      await updatePantryItemForHousehold(member.householdId, itemId, { productTypeKey: body.productTypeKey as string | null })
    } else if ('tracking' in body && typeof body.tracking === 'string' && PANTRY_TRACKING.some((entry) => entry.value === body.tracking)) {
      await updatePantryItemForHousehold(member.householdId, itemId, { tracking: body.tracking as 'normal' | 'rare' | 'off' })
    } else if ('contentQuantity' in body && body.contentQuantity && typeof body.contentQuantity === 'object' && !Array.isArray(body.contentQuantity)) {
      const content = body.contentQuantity as Record<string, unknown>
      if (Object.keys(content).length !== 2 || typeof content.id !== 'string' || typeof content.quantity !== 'number' || !UUID_PATTERN.test(content.id)) return json({ error: 'invalid_request' }, 400)
      await updatePantryItemForHousehold(member.householdId, itemId, { contentQuantity: { id: content.id, quantity: content.quantity } })
    } else if ('contentPackage' in body && body.contentPackage && typeof body.contentPackage === 'object' && !Array.isArray(body.contentPackage)) {
      const pack = body.contentPackage as Record<string, unknown>
      if (Object.keys(pack).length !== 3 || typeof pack.id !== 'string' || !UUID_PATTERN.test(pack.id) || (pack.quantity !== null && typeof pack.quantity !== 'number') || (pack.unit !== null && (typeof pack.unit !== 'string' || !(ITEM_UNITS as readonly string[]).includes(pack.unit)))) return json({ error: 'invalid_request' }, 400)
      await updatePantryItemForHousehold(member.householdId, itemId, { contentPackage: { id: pack.id, quantity: pack.quantity as number | null, unit: pack.unit as ItemUnit | null } })
    } else if ('packageSize' in body && body.packageSize && typeof body.packageSize === 'object' && !Array.isArray(body.packageSize)) {
      const pack = body.packageSize as Record<string, unknown>
      if (Object.keys(pack).length !== 2 || (pack.quantity !== null && typeof pack.quantity !== 'number') || (pack.unit !== null && (typeof pack.unit !== 'string' || !(ITEM_UNITS as readonly string[]).includes(pack.unit)))) return json({ error: 'invalid_request' }, 400)
      await updatePantryItemForHousehold(member.householdId, itemId, { packageSize: { quantity: pack.quantity as number | null, unit: pack.unit as ItemUnit | null } })
    } else {
      return json({ error: 'invalid_request' }, 400)
    }
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof PantryInputError) return json({ error: error.message }, 400)
    if (error instanceof PantryResourceNotFoundError) return json({ error: 'not_found' }, 404)
    console.error('[mobile pantry item]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { itemId } = await context.params
    if (!UUID_PATTERN.test(itemId)) return json({ error: 'not_found' }, 404)
    const rows = await getDb().delete(schema.pantryItems)
      .where(and(eq(schema.pantryItems.id, itemId), eq(schema.pantryItems.householdId, member.householdId)))
      .returning({ id: schema.pantryItems.id })
    if (rows.length === 0) return json({ error: 'not_found' }, 404)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile pantry item remove]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
