import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { toggleRecipeFavorite } from '@/lib/db/recipes'
import { getRecipeByUrl } from '@/lib/recipes/service'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return json({ error: 'not_found' }, 404)
    const [row] = await getDb().select({ sourceId: schema.recipeCatalog.sourceId, canonicalUrl: schema.recipeCatalog.canonicalUrl })
      .from(schema.recipeCatalog).where(eq(schema.recipeCatalog.id, id)).limit(1)
    if (!row) return json({ error: 'not_found' }, 404)
    const recipe = await getRecipeByUrl(row.sourceId, row.canonicalUrl)
    return json({ favorite: await toggleRecipeFavorite(member.householdId, recipe) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recipe favorite]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
