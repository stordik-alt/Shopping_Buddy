import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { recordAudit } from '@/lib/db/audit'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const PREF_KEYS = ['preferredBrands', 'preferredStores', 'preferredProducts', 'excludedProducts', 'priceSensitivity', 'qualityPreference', 'preferCzechProducts'] as const

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch { return null }
}

function safeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || item.trim().length > 1000)) return null
  return value.map((item) => item.trim()).filter(Boolean)
}

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const body = await bodyObject(request)
    if (!body || Object.keys(body).length === 0 || Object.keys(body).some((key) => !PREF_KEYS.includes(key as typeof PREF_KEYS[number]))) return json({ error: 'invalid_request' }, 400)

    const changes: Record<string, unknown> = {}
    for (const key of ['preferredBrands', 'preferredStores', 'preferredProducts', 'excludedProducts'] as const) {
      if (body[key] !== undefined) {
        const values = safeStringArray(body[key])
        if (!values) return json({ error: 'invalid_preferences', message: 'Seznam může obsahovat nejvýše 100 textových hodnot.' }, 400)
        changes[key] = values
      }
    }
    if (body.priceSensitivity !== undefined) {
      if (!['cheapest', 'balanced', 'quality_first'].includes(String(body.priceSensitivity))) return json({ error: 'invalid_preferences' }, 400)
      changes.priceSensitivity = body.priceSensitivity
    }
    if (body.qualityPreference !== undefined) {
      if (body.qualityPreference !== 'standard' && body.qualityPreference !== 'premium') return json({ error: 'invalid_preferences' }, 400)
      changes.qualityPreference = body.qualityPreference
    }
    if (body.preferCzechProducts !== undefined) {
      if (typeof body.preferCzechProducts !== 'boolean') return json({ error: 'invalid_preferences' }, 400)
      changes.preferCzechProducts = body.preferCzechProducts
    }

    const db = getDb()
    const existing = await db.query.preferences.findFirst({ where: eq(schema.preferences.householdId, member.householdId), columns: { id: true } })
    if (existing) await db.update(schema.preferences).set(changes).where(eq(schema.preferences.householdId, member.householdId))
    else await db.insert(schema.preferences).values({ householdId: member.householdId, ...changes })
    await recordAudit({ householdId: member.householdId, memberId: member.id }, 'household.updated', { fields: `preferences:${Object.keys(changes).join(',')}` })
    const row = await db.query.preferences.findFirst({ where: eq(schema.preferences.householdId, member.householdId) })
    return json({ preferences: row ? {
      preferredBrands: row.preferredBrands,
      preferredStores: row.preferredStores,
      preferredProducts: row.preferredProducts,
      excludedProducts: row.excludedProducts,
      priceSensitivity: row.priceSensitivity,
      qualityPreference: row.qualityPreference,
      preferCzechProducts: row.preferCzechProducts,
    } : null })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile household preferences]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
