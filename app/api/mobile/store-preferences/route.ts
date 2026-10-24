import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getMemberStoreSelection, getStoreChains, InvalidStoreSelectionError, saveMemberStoreSelection } from '@/lib/db/member-store-preferences'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 500 && value.every((id) => typeof id === 'string' && id.length <= 64)

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const [selection, chains] = await Promise.all([getMemberStoreSelection(member.id), getStoreChains()])
    return json({ selection, chains })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile store preferences read]', error)
    return json({ error: 'request_failed' }, 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    let raw: unknown
    try { raw = await request.json() } catch { raw = null }
    const allowed = ['chainIds', 'locationIds', 'priorityChainIds', 'maxDistanceKm', 'maxShopStores']
    if (!isRecord(raw) || Object.keys(raw).some((key) => !allowed.includes(key)) || !validIds(raw.chainIds) || !validIds(raw.locationIds) || !validIds(raw.priorityChainIds)) {
      return json({ error: 'invalid_request' }, 400)
    }
    if ((raw.maxDistanceKm !== null && (typeof raw.maxDistanceKm !== 'number' || !Number.isFinite(raw.maxDistanceKm))) || (raw.maxShopStores !== null && typeof raw.maxShopStores !== 'number')) {
      return json({ error: 'invalid_request' }, 400)
    }
    const selection = await saveMemberStoreSelection(member.id, {
      chainIds: raw.chainIds,
      locationIds: raw.locationIds,
      priorityChainIds: raw.priorityChainIds,
      maxDistanceKm: raw.maxDistanceKm as number | null,
      maxShopStores: raw.maxShopStores as number | null,
    })
    return json({ selection })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    if (error instanceof InvalidStoreSelectionError) return json({ error: 'invalid_selection', message: error.message }, 400)
    console.error('[mobile store preferences update]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
