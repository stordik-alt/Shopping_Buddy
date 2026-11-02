import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getChainTiles, searchBranches } from '@/lib/db/store-branch-search'
import { getStoreProductNames } from '@/lib/db/queries'
import { BRANCH_PAGE_SIZE, MAX_LOCALITY_TEXT, NEARBY_RADIUS_KM, type Locality } from '@/lib/stores/branch-search'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function coordinate(value: string | null, limit: number): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const params = new URL(request.url).searchParams
    const city = params.get('city')?.trim() ?? ''
    const latValue = params.get('lat')
    const lngValue = params.get('lng')
    const chainId = params.get('chainId')
    const storeLocationId = params.get('storeLocationId')
    const page = Number(params.get('page') ?? '1')
    if (city.length > MAX_LOCALITY_TEXT) return json({ error: 'invalid_locality' }, 400)
    if (!Number.isInteger(page) || page < 1) return json({ error: 'invalid_page' }, 400)
    if (chainId != null && !UUID.test(chainId)) return json({ error: 'invalid_chain' }, 400)
    if (storeLocationId != null) {
      if (!UUID.test(storeLocationId)) return json({ error: 'invalid_store_location' }, 400)
      return json({ products: await getStoreProductNames(storeLocationId) })
    }

    let locality: Locality
    if (latValue != null || lngValue != null) {
      const lat = coordinate(latValue, 90)
      const lng = coordinate(lngValue, 180)
      if (lat == null || lng == null) return json({ error: 'invalid_location' }, 400)
      locality = { kind: 'gps', center: { lat, lng }, radiusKm: NEARBY_RADIUS_KM }
    } else {
      locality = city ? { kind: 'city', text: city } : { kind: 'all' }
    }
    if (chainId) {
      return json(await searchBranches({ chainIds: [chainId], locality, memberId: member.id, page, pageSize: BRANCH_PAGE_SIZE }))
    }
    return json({ chains: await getChainTiles(locality, member.id) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile stores]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
