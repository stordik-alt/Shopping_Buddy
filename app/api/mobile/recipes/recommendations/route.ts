import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getRecipeHouseholdData, listRecipePantryItems } from '@/lib/db/recipes'
import { rankPantryRecommendations } from '@/lib/recipes/recommendations'
import { searchRecipesDetailed } from '@/lib/recipes/service'
import type { Recipe } from '@/lib/recipes/types'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const [context, pantryItems] = await Promise.all([getRecipeHouseholdData(member.householdId), listRecipePantryItems(member.householdId)])
    const terms: string[] = []
    const seen = new Set<string>()
    for (const item of pantryItems) {
      if (item.category !== 'Potraviny' || item.tracking === 'off' || item.quantity <= 0) continue
      const key = item.name.trim().toLocaleLowerCase('cs-CZ')
      if (!key || seen.has(key)) continue
      seen.add(key)
      terms.push(item.name.trim())
      if (terms.length >= 5) break
    }
    const found = await Promise.all(terms.map((term) => searchRecipesDetailed(term)))
    const unique = new Map<string, Recipe>()
    for (const recipes of found) for (const recipe of recipes) if (!unique.has(recipe.canonicalUrl)) unique.set(recipe.canonicalUrl, recipe)
    const recipes = rankPantryRecommendations([...unique.values()], pantryItems, context).slice(0, 12).map((recipe) => ({
      ...recipe,
      imageUrl: recipe.imageUrl ? new URL(`/api/recipes/images/${encodeURIComponent(recipe.id)}`, request.url).toString() : undefined,
    }))
    return json({ recipes, pantryItemCount: pantryItems.length })
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recipe recommendations]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
