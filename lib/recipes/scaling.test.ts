import { describe, expect, it } from 'vitest'
import { scaleRecipeIngredients, formatIngredientQuantity } from '@/lib/recipes/scaling'
import type { Recipe } from '@/lib/recipes/types'

const recipe: Recipe = {
  id: '1',
  sourceId: 'test',
  sourceName: 'Test',
  sourceUrl: 'https://example.com/recept',
  canonicalUrl: 'https://example.com/recept',
  title: 'Test',
  servings: 4,
  ingredients: [
    { id: 'a', originalText: '750 g maso', quantity: 750, unit: 'g', name: 'maso', scalable: true },
    { id: 'b', originalText: 'špetka soli', name: 'špetka soli', scalable: false },
  ],
  fetchedAt: new Date().toISOString(),
  parserVersion: 1,
}

describe('scaleRecipeIngredients', () => {
  it('scales quantities proportionally', () => {
    expect(scaleRecipeIngredients(recipe, 6)[0].quantity).toBe(1125)
    expect(scaleRecipeIngredients(recipe, 2)[0].quantity).toBe(375)
  })

  it('keeps non-scalable ingredients unchanged', () => {
    expect(scaleRecipeIngredients(recipe, 8)[1]).toEqual(recipe.ingredients[1])
  })

  it('keeps original quantities when serving count is unavailable', () => {
    expect(scaleRecipeIngredients({ ...recipe, servings: undefined }, 8)).toEqual(recipe.ingredients)
  })
})

describe('formatIngredientQuantity', () => {
  it('uses Czech decimal formatting without unnecessary zeroes', () => {
    expect(formatIngredientQuantity(1.5)).toBe('1,5')
    expect(formatIngredientQuantity(2)).toBe('2')
    expect(formatIngredientQuantity(0.125)).toBe('0,125')
  })
})
