import { and, desc, eq, sql } from 'drizzle-orm'
import type { Recipe, RecipeSearchResult } from '@/lib/recipes/types'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

export type SavedRecipe = RecipeSearchResult & {
  savedAt: string
  viewedAt?: string
  viewCount?: number
}

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
  const rows = await db.query.recipeFavorites.findMany({
    where: eq(schema.recipeFavorites.householdId, householdId),
    orderBy: [desc(schema.recipeFavorites.createdAt)],
    limit: 30,
  })
  return rows.map(toSearchResult)
}

export async function listRecipeHistory(householdId: string): Promise<SavedRecipe[]> {
  const db = getDb()
  const rows = await db.query.recipeHistory.findMany({
    where: eq(schema.recipeHistory.householdId, householdId),
    orderBy: [desc(schema.recipeHistory.lastViewedAt)],
    limit: 30,
  })
  return rows.map(toHistoryResult)
}

export async function getRecipeFavoriteState(householdId: string, canonicalUrl: string): Promise<boolean> {
  const db = getDb()
  const row = await db.query.recipeFavorites.findFirst({
    where: and(eq(schema.recipeFavorites.householdId, householdId), eq(schema.recipeFavorites.canonicalUrl, canonicalUrl)),
    columns: { id: true },
  })
  return Boolean(row)
}

export async function toggleRecipeFavorite(householdId: string, recipe: Recipe): Promise<boolean> {
  const db = getDb()
  const existing = await db.query.recipeFavorites.findFirst({
    where: and(eq(schema.recipeFavorites.householdId, householdId), eq(schema.recipeFavorites.canonicalUrl, recipe.canonicalUrl)),
    columns: { id: true },
  })

  if (existing) {
    await db.delete(schema.recipeFavorites).where(eq(schema.recipeFavorites.id, existing.id))
    return false
  }

  await db.insert(schema.recipeFavorites).values(favoriteValues(householdId, recipe))
  return true
}

export async function recordRecipeView(householdId: string, recipe: Recipe): Promise<void> {
  const db = getDb()
  const now = new Date()
  const existing = await db.query.recipeHistory.findFirst({
    where: and(eq(schema.recipeHistory.householdId, householdId), eq(schema.recipeHistory.canonicalUrl, recipe.canonicalUrl)),
    columns: { id: true },
  })

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
