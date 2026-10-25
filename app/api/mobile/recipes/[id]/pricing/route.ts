import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { getProductCatalogCached } from '@/lib/db/cached-reads'
import { getProductPrices, getStandaloneOffers } from '@/lib/db/queries'
import { matchProductByName } from '@/lib/products'
import { estimateRecipePrice } from '@/lib/recipes/pricing'
import { scaleRecipeIngredients } from '@/lib/recipes/scaling'
import { getRecipeByUrl } from '@/lib/recipes/service'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await mobileUserFromRequest(request)
    const member = await mobileHouseholdForUser(user.id)
    if (!member) return json({ error: 'household_required' }, 409)
    const { id } = await params
    if (!UUID_PATTERN.test(id)) return json({ error: 'not_found' }, 404)
    const [reference] = await getDb().select({ sourceId: schema.recipeCatalog.sourceId, canonicalUrl: schema.recipeCatalog.canonicalUrl })
      .from(schema.recipeCatalog).where(eq(schema.recipeCatalog.id, id)).limit(1)
    if (!reference) return json({ error: 'not_found' }, 404)
    const rawServings = new URL(request.url).searchParams.get('servings')
    const servings = rawServings == null ? undefined : Number(rawServings)
    if (servings !== undefined && (!Number.isFinite(servings) || servings < 1 || servings > 1000)) return json({ error: 'invalid_request' }, 400)
    const recipe = await getRecipeByUrl(reference.sourceId, reference.canonicalUrl)
    const ingredients = scaleRecipeIngredients(recipe, servings ?? recipe.servings ?? 0)
    const names = [...new Set(ingredients.map((ingredient) => ingredient.name.trim()).filter(Boolean))]
    if (names.length === 0) return json(estimateRecipePrice(ingredients, []))
    const catalog = await getProductCatalogCached(names)
    const matchedNames = ingredients.map((ingredient) => matchProductByName(catalog, ingredient.name)?.name).filter((name): name is string => Boolean(name))
    const uniqueNames = [...new Set(matchedNames)]
    const [products, offers] = await Promise.all([getProductPrices({ names: uniqueNames, runningDeals: false }), getStandaloneOffers(undefined, uniqueNames)])
    return json(estimateRecipePrice(ingredients, products, offers))
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile recipe pricing]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
