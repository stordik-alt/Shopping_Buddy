import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import { getChainTiles, searchBranches } from '@/lib/db/store-branch-search'
import * as schema from '@/lib/db/schema'
import { BRANCH_PAGE_SIZE, MAX_LOCALITY_TEXT, type Locality } from '@/lib/stores/branch-search'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await getDb().query.householdMembers.findFirst({
      where: eq(schema.householdMembers.userId, user.id),
      columns: { id: true },
    })
    if (!member) return json({ error: 'household_required' }, 409)

    const params = new URL(request.url).searchParams
    const city = params.get('city')?.trim() ?? ''
    const chainId = params.get('chainId')
    const page = Number(params.get('page') ?? '1')
    if (city.length > MAX_LOCALITY_TEXT) return json({ error: 'invalid_locality' }, 400)
    if (!Number.isInteger(page) || page < 1) return json({ error: 'invalid_page' }, 400)
    if (chainId != null && !UUID.test(chainId)) return json({ error: 'invalid_chain' }, 400)

    const locality: Locality = city ? { kind: 'city', text: city } : { kind: 'all' }
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
