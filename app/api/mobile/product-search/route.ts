import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getMemberStoreSelection } from '@/lib/db/member-store-preferences'
import { searchProductHits } from '@/lib/db/product-search'
import { hasStoreSelection } from '@/lib/nearby-stores'
import { groupHitsByChain, searchTokens } from '@/lib/product-search'
import type { ItemCategory } from '@/lib/types'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let body: unknown
    try { body = await request.json() } catch { body = null }
    if (!isRecord(body) || Object.keys(body).some((key) => !['query', 'onlyNearby', 'category'].includes(key)) || typeof body.query !== 'string' || body.query.length > 80 || typeof body.onlyNearby !== 'boolean' || (body.category !== undefined && !CATEGORIES.includes(body.category as ItemCategory))) {
      return json({ error: 'invalid_search', message: 'Neplatné hledání.' }, 400)
    }

    const selection = await getMemberStoreSelection(member.id)
    const hasNearbySelection = hasStoreSelection(selection)
    const nearbyOnly = body.onlyNearby && hasNearbySelection
    const tokens = searchTokens(body.query.trim())
    const hits = tokens.length === 0 ? [] : await searchProductHits(tokens, {
      ...(nearbyOnly ? { storeIds: selection.chainIds } : {}),
      ...(body.category ? { category: body.category as ItemCategory } : {}),
    })
    return json({ groups: groupHitsByChain(hits, 8), nearbyOnly, hasNearbySelection })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile product search]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
