import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { recordRecipeView } from '@/lib/db/recipes'
import { getRecipeByUrl } from '@/lib/recipes/service'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)

    const { id } = await params
    if (!UUID_PATTERN.test(id)) return json({ error: 'not_found' }, 404)
    const [reference] = await getDb()
      .select({ sourceId: schema.recipeCatalog.sourceId, canonicalUrl: schema.recipeCatalog.canonicalUrl })
      .from(schema.recipeCatalog)
      .where(eq(schema.recipeCatalog.id, id))
      .limit(1)
    if (!reference) return json({ error: 'not_found' }, 404)

    const recipe = await getRecipeByUrl(reference.sourceId, reference.canonicalUrl)
    await recordRecipeView(member.householdId, recipe)
    return json({
      ...recipe,
      imageUrl: recipe.imageUrl
        ? new URL(`/api/recipes/images/${encodeURIComponent(recipe.id)}`, request.url).toString()
        : undefined,
    })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recipe detail]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
