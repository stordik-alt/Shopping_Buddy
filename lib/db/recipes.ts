import { cleanMemberDiet, householdDietStems } from '@/lib/diet'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Recipe, RecipeSearchResult, SavedRecipe } from '@/lib/recipes/types'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { PantryItem } from '@/lib/types'

function optionalNumber(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toSearchResult(row: typeof schema.recipeFavorites.$inferSelect): RecipeSearchResult {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    description: row.description ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    servings: optionalNumber(row.servings),
    totalTimeMinutes: row.totalTimeMinutes ?? undefined,
    ratingValue: optionalNumber(row.ratingValue),
    ratingScale: optionalNumber(row.ratingScale),
    ratingCount: row.ratingCount ?? undefined,
  }
}

function toHistoryResult(row: typeof schema.recipeHistory.$inferSelect): SavedRecipe {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    description: row.description ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    servings: optionalNumber(row.servings),
    totalTimeMinutes: row.totalTimeMinutes ?? undefined,
    ratingValue: optionalNumber(row.ratingValue),
    ratingScale: optionalNumber(row.ratingScale),
    ratingCount: row.ratingCount ?? undefined,
    savedAt: row.firstViewedAt.toISOString(),
    viewedAt: row.lastViewedAt.toISOString(),
    viewCount: row.viewCount,
  }
}

function favoriteValues(householdId: string, recipe: Recipe) {
  return {
    householdId,
    sourceId: recipe.sourceId,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    canonicalUrl: recipe.canonicalUrl,
    title: recipe.title,
    description: recipe.description ?? null,
    imageUrl: recipe.imageUrl ?? null,
    servings: recipe.servings?.toString() ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    ratingValue: recipe.ratingValue?.toString() ?? null,
    ratingScale: recipe.ratingScale?.toString() ?? null,
    ratingCount: recipe.ratingCount ?? null,
  }
}

function historyValues(householdId: string, recipe: Recipe) {
  return {
    householdId,
    sourceId: recipe.sourceId,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    canonicalUrl: recipe.canonicalUrl,
    title: recipe.title,
    description: recipe.description ?? null,
    imageUrl: recipe.imageUrl ?? null,
    servings: recipe.servings?.toString() ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    ratingValue: recipe.ratingValue?.toString() ?? null,
    ratingScale: recipe.ratingScale?.toString() ?? null,
    ratingCount: recipe.ratingCount ?? null,
  }
}

export async function listRecipeFavorites(householdId: string): Promise<RecipeSearchResult[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.recipeFavorites)
    .where(eq(schema.recipeFavorites.householdId, householdId))
    .orderBy(desc(schema.recipeFavorites.createdAt))
    .limit(30)
  return rows.map(toSearchResult)
}

export async function listRecipeHistory(householdId: string): Promise<SavedRecipe[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.recipeHistory)
    .where(eq(schema.recipeHistory.householdId, householdId))
    .orderBy(desc(schema.recipeHistory.lastViewedAt))
    .limit(30)
  return rows.map(toHistoryResult)
}

export async function getRecipeFavoriteState(householdId: string, canonicalUrl: string): Promise<boolean> {
  const db = getDb()
  const [row] = await db
    .select({ id: schema.recipeFavorites.id })
    .from(schema.recipeFavorites)
    .where(and(eq(schema.recipeFavorites.householdId, householdId), eq(schema.recipeFavorites.canonicalUrl, canonicalUrl)))
    .limit(1)
  return Boolean(row)
}

export async function toggleRecipeFavorite(householdId: string, recipe: Recipe): Promise<boolean> {
  const db = getDb()
  const [existing] = await db
    .select({ id: schema.recipeFavorites.id })
    .from(schema.recipeFavorites)
    .where(and(eq(schema.recipeFavorites.householdId, householdId), eq(schema.recipeFavorites.canonicalUrl, recipe.canonicalUrl)))
    .limit(1)

  if (existing) {
    await db.delete(schema.recipeFavorites).where(eq(schema.recipeFavorites.id, existing.id))
    return false
  }

  await db.insert(schema.recipeFavorites).values(favoriteValues(householdId, recipe))
  return true
}



export type RecipeHouseholdData = {
  /** The members' eating questionnaire rules together (lib/diet.ts). */
  dietStems: string[]
  allergies: string[]
  dislikedFoods: string[]
  favoriteFoods: string[]
}

/** Household profile data used by recipe filters/recommendations. Only structured member profile
 * fields are returned; free-text child needs/preferences are intentionally excluded. */
export async function getRecipeHouseholdData(householdId: string): Promise<RecipeHouseholdData> {
  const db = getDb()
  const rows = await db
    .select({
      allergies: schema.profiles.allergies,
      dislikedFoods: schema.profiles.dislikedFoods,
      favoriteFoods: schema.profiles.favoriteFoods,
    })
    .from(schema.profiles)
    .innerJoin(schema.householdMembers, eq(schema.householdMembers.id, schema.profiles.memberId))
    .where(eq(schema.householdMembers.householdId, householdId))

  // Every member's questionnaire answers together: the household cooks one plan (docs/17_DIET_PREFERENCES.md).
  const dietRows = await db
    .select({ diet: schema.memberDiets.diet, avoids: schema.memberDiets.avoids })
    .from(schema.memberDiets)
    .innerJoin(schema.householdMembers, eq(schema.householdMembers.id, schema.memberDiets.memberId))
    .where(eq(schema.householdMembers.householdId, householdId))

  return {
    dietStems: householdDietStems(dietRows.flatMap((row) => cleanMemberDiet(row) ?? [])),
    allergies: [...new Set(rows.flatMap((row) => row.allergies))],
    dislikedFoods: [...new Set(rows.flatMap((row) => row.dislikedFoods))],
    favoriteFoods: [...new Set(rows.flatMap((row) => row.favoriteFoods))],
  }
}

/** Current household pantry rows used by the server-side "Co uvařit z toho, co mám doma" flow. */
export async function listRecipePantryItems(householdId: string): Promise<PantryItem[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.pantryItems.id,
      name: schema.pantryItems.name,
      category: schema.pantryItems.category,
      location: schema.pantryItems.location,
      customPlaceId: schema.pantryItems.customPlaceId,
      quantity: schema.pantryItems.quantity,
      unit: schema.pantryItems.unit,
      addedAt: schema.pantryItems.addedAt,
      askedAt: schema.pantryItems.askedAt,
      tracking: schema.pantryItems.tracking,
    })
    .from(schema.pantryItems)
    .where(eq(schema.pantryItems.householdId, householdId))
    .orderBy(asc(schema.pantryItems.addedAt))

  return rows.map((row) => ({
    ...row,
    addedAt: row.addedAt.toISOString(),
    askedAt: row.askedAt?.toISOString(),
  }))
}

export async function recordRecipeView(householdId: string, recipe: Recipe): Promise<void> {
  const db = getDb()
  const now = new Date()
  const [existing] = await db
    .select({ id: schema.recipeHistory.id })
    .from(schema.recipeHistory)
    .where(and(eq(schema.recipeHistory.householdId, householdId), eq(schema.recipeHistory.canonicalUrl, recipe.canonicalUrl)))
    .limit(1)

  if (existing) {
    await db
      .update(schema.recipeHistory)
      .set({
        ...historyValues(householdId, recipe),
        lastViewedAt: now,
        viewCount: sql`${schema.recipeHistory.viewCount} + 1`,
      })
      .where(eq(schema.recipeHistory.id, existing.id))
    return
  }

  await db.insert(schema.recipeHistory).values({
    ...historyValues(householdId, recipe),
    firstViewedAt: now,
    lastViewedAt: now,
    viewCount: 1,
  })
}
