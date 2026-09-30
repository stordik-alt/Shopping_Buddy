import type { Recipe, RecipeIngredient } from '@/lib/recipes/types'

export const RECIPE_PARSER_VERSION = 1
type JsonLdValue = Record<string, unknown>

function asObject(value: unknown): JsonLdValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonLdValue) : null
}

function collectRecipeNodes(value: unknown, output: JsonLdValue[] = []): JsonLdValue[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRecipeNodes(item, output)
    return output
  }
  const object = asObject(value)
  if (!object) return output
  const type = object['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.some((entry) => String(entry).toLowerCase() === 'recipe')) output.push(object)
  if (Array.isArray(object['@graph'])) collectRecipeNodes(object['@graph'], output)
  return output
}

function extractJsonLd(html: string): unknown[] {
  const values: unknown[] = []
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try { values.push(JSON.parse(raw)) } catch { /* ignore malformed blocks */ }
  }
  return values
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) return value.find((entry) => typeof entry === 'string' && entry.trim())?.trim()
  return undefined
}

function imageUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) return imageUrl(value[0])
  const object = asObject(value)
  return object ? firstString(object.url) : undefined
}

function parseDuration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i)
  if (!match) return undefined
  return Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().replace(',', '.')
  const fraction = normalized.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2])
  const match = normalized.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

export function parseServings(value: unknown): number | undefined {
  return parseNumber(value)
}

const KNOWN_UNITS = new Set([
  'g','kg','mg','ml','l','dl','cl','ks','kus','kusu','kusy',
  'stroužek','stroužky','stroužků','plátek','plátky','plátků',
  'lžíce','lžička','lžičky','lžic','lžiček','hrnek','hrnky','hrnků',
  'šálek','šálky','šálků','balení','bal',
])

function parseIngredient(text: string, index: number): RecipeIngredient {
  const originalText = text.trim()
  const leading = originalText.match(/^\s*((?:\d+(?:[,.]\d+)?|\d+\s*\/\s*\d+))\s*([a-zA-ZÀ-ž]+)?\s+(.+?)\s*$/)
  if (!leading) return { id: `ingredient-${index + 1}`, originalText, name: originalText, scalable: false }

  const quantity = parseNumber(leading[1])
  const rawUnit = leading[2]?.trim()
  const name = leading[3].trim()
  if (quantity === undefined || !name) return { id: `ingredient-${index + 1}`, originalText, name: originalText, scalable: false }

  if (!rawUnit || !KNOWN_UNITS.has(rawUnit.toLowerCase())) {
    return { id: `ingredient-${index + 1}`, originalText, quantity, name: rawUnit ? `${rawUnit} ${name}` : name, scalable: true }
  }
  return { id: `ingredient-${index + 1}`, originalText, quantity, unit: rawUnit, name, scalable: true }
}

function ratingData(value: unknown): { value?: number; scale?: number; count?: number } {
  const object = asObject(value)
  if (!object) return {}
  const ratingValue = parseNumber(object.ratingValue)
  const bestRating = parseNumber(object.bestRating)
  const count = parseNumber(object.ratingCount)
  if (ratingValue === undefined) return {}
  return {
    value: ratingValue,
    scale: bestRating && bestRating > 0 ? bestRating : 5,
    count: count !== undefined && count >= 0 ? Math.round(count) : undefined,
  }
}

function canonicalizeUrl(url: string): string {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.toString()
}

export function parseRecipeJsonLd(html: string, source: {
  sourceId: string
  sourceName: string
  sourceUrl: string
  canonicalUrl?: string
  fetchedAt?: string
}): Recipe {
  const recipes = extractJsonLd(html).flatMap((value) => collectRecipeNodes(value))
  const recipe = recipes[0]
  if (!recipe) throw new Error('No Schema.org Recipe JSON-LD found')

  const title = firstString(recipe.name)
  if (!title) throw new Error('Recipe JSON-LD is missing name')

  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.filter((item): item is string => typeof item === 'string').map(parseIngredient)
    : []

  const rating = ratingData(recipe.aggregateRating)
  const canonicalUrl = canonicalizeUrl(source.canonicalUrl ?? source.sourceUrl)

  return {
    id: canonicalUrl,
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    canonicalUrl,
    title,
    description: firstString(recipe.description),
    imageUrl: imageUrl(recipe.image),
    servings: parseServings(recipe.recipeYield),
    servingsText: firstString(recipe.recipeYield),
    prepTimeMinutes: parseDuration(recipe.prepTime),
    cookTimeMinutes: parseDuration(recipe.cookTime),
    totalTimeMinutes: parseDuration(recipe.totalTime),
    category: firstString(recipe.recipeCategory),
    cuisine: firstString(recipe.recipeCuisine),
    ratingValue: rating.value,
    ratingScale: rating.scale,
    ratingCount: rating.count,
    ratingSource: rating.value === undefined ? undefined : source.sourceName,
    ingredients,
    fetchedAt: source.fetchedAt ?? new Date().toISOString(),
    parserVersion: RECIPE_PARSER_VERSION,
  }
}

export function normalizeRatingToFive(value: number | undefined, scale = 5): number | undefined {
  if (value === undefined || !Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) return undefined
  return Math.max(0, Math.min(5, (value / scale) * 5))
}
