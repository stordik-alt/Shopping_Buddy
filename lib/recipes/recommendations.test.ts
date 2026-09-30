import { describe, expect, it } from 'vitest'
import { analyzeRecipeIngredients } from '@/lib/recipes/shopping'
import type { RecipeSearchResult } from '@/lib/recipes/types'
import {
  addHouseholdPreferenceToPantryRecommendations,
  filterRecipeForHousehold,
  rankByHouseholdPreference,
  rankPantryRecommendations,
  type RecipeHouseholdContext,
} from '@/lib/recipes/recommendations'

function recipe(
  id: string,
  ingredients: { id: string; name: string; quantity?: number; unit?: string; scalable?: boolean }[],
  allergens: string[] = [],
): RecipeSearchResult {
  return {
    id,
    sourceId: 'test',
    sourceName: 'Test',
    sourceUrl: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: id,
    ingredients,
    allergens,
  } as RecipeSearchResult & { ingredients: typeof ingredients; allergens: string[] }
}

const household: RecipeHouseholdContext = {
  allergies: ['Laktóza'],
  dislikedFoods: ['celer'],
  favoriteFoods: ['kuřecí maso'],
}

describe('recipe household recommendations', () => {
  it('rejects an explicit household allergen', () => {
    expect(filterRecipeForHousehold(recipe('milk', [], ['laktóza']), household)).toBe(false)
  })

  it('rejects a disliked ingredient using deterministic normalized name matching', () => {
    expect(
      filterRecipeForHousehold(
        recipe('celery', [{ id: 'i1', name: 'Celer řapíkatý', quantity: 1, unit: 'ks', scalable: true }]),
        household,
      ),
    ).toBe(false)
  })

  it('keeps missing or unknown allergy values from becoming guessed exclusions', () => {
    expect(filterRecipeForHousehold(recipe('other', [], ['ořechy']), household)).toBe(true)
  })

  it('uses favorite foods as a soft ordering signal', () => {
    const recipes = [
      recipe('none', [{ id: 'i1', name: 'Rýže', quantity: 1, unit: 'kg', scalable: true }]),
      recipe('favorite', [{ id: 'i2', name: 'Kuřecí prsa', quantity: 1, unit: 'kg', scalable: true }]),
    ]
    expect(rankByHouseholdPreference(recipes, household).map((item) => item.id)).toEqual(['favorite', 'none'])
  })

  it('ranks pantry recipes by full stock coverage before partial coverage', () => {
    const pantry = [
      { id: 'p1', name: 'Kuřecí prsa', category: 'Potraviny', location: 'Lednice', quantity: 1, unit: 'kg', addedAt: '2026-09-30' },
      { id: 'p2', name: 'Rýže', category: 'Potraviny', location: 'Spíž', quantity: 0.2, unit: 'kg', addedAt: '2026-09-30' },
    ] as const

    const results = [
      recipe('partial', [
        { id: 'i1', name: 'Kuřecí prsa', quantity: 1, unit: 'kg', scalable: true },
        { id: 'i2', name: 'Rýže', quantity: 0.5, unit: 'kg', scalable: true },
      ]),
      recipe('full', [
        { id: 'i1', name: 'Kuřecí prsa', quantity: 0.5, unit: 'kg', scalable: true },
      ]),
    ]

    const ranked = rankPantryRecommendations(results, pantry as never, analyzeRecipeIngredients)
    expect(ranked.map((item) => item.id)).toEqual(['full', 'partial'])
    expect(ranked[0]?.coveredIngredientCount).toBe(1)
    expect(ranked[1]?.matchedIngredientCount).toBe(2)
  })

  it('adds household preference after pantry coverage', () => {
    const pantry = [
      { id: 'p1', name: 'Kuřecí prsa', category: 'Potraviny', location: 'Lednice', quantity: 1, unit: 'kg', addedAt: '2026-09-30' },
    ] as const
    const results = [
      recipe('favorite', [{ id: 'i1', name: 'Kuřecí prsa', quantity: 0.5, unit: 'kg', scalable: true }]),
      recipe('plain', [{ id: 'i2', name: 'Rýže', quantity: 0.5, unit: 'kg', scalable: true }]),
    ]
    const ranked = addHouseholdPreferenceToPantryRecommendations(
      rankPantryRecommendations(results, pantry as never, analyzeRecipeIngredients),
      household,
    )
    expect(ranked.map((item) => item.id)).toEqual(['favorite', 'plain'])
    expect(ranked[0]?.householdPreferenceScore).toBe(1)
  })
})
