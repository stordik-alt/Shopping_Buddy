import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { listRecipeFavorites, listRecipeHistory } from '@/lib/db/recipes'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
function imageUrl(request: Request, recipe: { id: string; imageUrl?: string }) {
  return recipe.imageUrl ? new URL(`/api/recipes/images/${encodeURIComponent(recipe.id)}`, request.url).toString() : undefined
}

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const [favorites, history] = await Promise.all([listRecipeFavorites(member.householdId), listRecipeHistory(member.householdId)])
    return json({ favorites: favorites.map((recipe) => ({ ...recipe, imageUrl: imageUrl(request, recipe) })), history: history.map((recipe) => ({ ...recipe, imageUrl: imageUrl(request, recipe) })) })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recipe collections]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
