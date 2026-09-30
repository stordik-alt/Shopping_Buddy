import { describe, expect, it } from 'vitest'
import { analyzeRecipeIngredients } from '@/lib/recipes/shopping'
import type { Recipe } from '@/lib/recipes/types'
import {
  filterRecipeForHousehold,
  rankByHouseholdPreference,
  rankPantryRecommendations,
  type RecipeHouseholdContext,
} from '@/lib/recipes/recommendations'

function recipe(
  id: string,
  ingredients: { id: string; name: string; quantity?: number; unit?: string; scalable?: boolean }[],
): Recipe {
  return {
    id,
    sourceId: 'test',
    sourceName: 'Test',
    sourceUrl: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: id,
    description: undefined,
    imageUrl: undefined,
    servings: 4,
    servingsText: '4 porce',
    totalTimeMinutes: 30,
    category: undefined,
    cuisine: undefined,
    ratingValue: undefined,
    ratingScale: undefined,
    ratingCount: undefined,
    ratingSource: undefined,
    ingredients: ingredients.map((ingredient) => ({
      originalText: ingredient.name,
      scalable: ingredient.scalable ?? true,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      ...ingredient,
    })),
    fetchedAt: '2026-09-30T00:00:00.000Z',
    parserVersion: 1,
  }
}

const household: RecipeHouseholdContext = {
  allergies: ['ořechy'],
  dislikedFoods: ['celer'],
  favoriteFoods: ['kuřecí prsa'],
}

describe('recipe household recommendations', () => {
  it('rejects an ingredient matching a household allergy', () => {
    expect(
      filterRecipeForHousehold(
        recipe('nuts', [{ id: 'i1', name: 'Vlašské ořechy', quantity: 50, unit: 'g' }]),
        household,
      ),
    ).toBe(false)
  })

  it('does not infer an allergy relationship that the ingredient names do not establish', () => {
    expect(
      filterRecipeForHousehold(
        recipe('milk', [{ id: 'i1', name: 'Mléko polotučné', quantity: 250, unit: 'ml' }]),
        { ...household, allergies: ['laktóza'] },
      ),
    ).toBe(true)
  })

  it('rejects a disliked ingredient using deterministic normalized name matching', () => {
    expect(
      filterRecipeForHousehold(
        recipe('celery', [{ id: 'i1', name: 'Celer řapíkatý', quantity: 1, unit: 'ks' }]),
        household,
      ),
    ).toBe(false)
  })

  it('uses favorite foods as a soft ordering signal', () => {
    const recipes = [
      recipe('none', [{ id: 'i1', name: 'Rýže', quantity: 1, unit: 'kg' }]),
      recipe('favorite', [{ id: 'i2', name: 'Kuřecí prsa', quantity: 1, unit: 'kg' }]),
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
        { id: 'i1', name: 'Kuřecí prsa', quantity: 1, unit: 'kg' },
        { id: 'i2', name: 'Rýže', quantity: 0.5, unit: 'kg' },
      ]),
      recipe('full', [
        { id: 'i1', name: 'Kuřecí prsa', quantity: 0.5, unit: 'kg' },
      ]),
    ]

    const ranked = rankPantryRecommendations(results, pantry as never, household, analyzeRecipeIngredients)
    expect(ranked.map((item) => item.id)).toEqual(['full', 'partial'])
    expect(ranked[0]?.coveredIngredientCount).toBe(1)
    expect(ranked[1]?.matchedIngredientCount).toBe(2)
  })

  it('excludes unsuitable recipes from pantry recommendations', () => {
    const pantry = [
      { id: 'p1', name: 'Vlašské ořechy', category: 'Potraviny', location: 'Spíž', quantity: 100, unit: 'g', addedAt: '2026-09-30' },
    ] as const

    const ranked = rankPantryRecommendations(
      [recipe('unsafe', [{ id: 'i1', name: 'Vlašské ořechy', quantity: 50, unit: 'g' }])],
      pantry as never,
      household,
      analyzeRecipeIngredients,
    )

    expect(ranked).toEqual([])
  })
})
