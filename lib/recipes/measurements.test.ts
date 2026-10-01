import { describe, expect, it } from 'vitest'
import { estimateRecipeMeasure } from '@/lib/recipes/measurements'
import type { RecipeIngredient } from '@/lib/recipes/types'

const ingredient = (name: string, quantity: number, unit: string): RecipeIngredient => ({
  id: 'test',
  originalText: `${quantity} ${unit} ${name}`,
  quantity,
  unit,
  name,
  scalable: true,
})

describe('recipe culinary measure estimates', () => {
  it('uses ingredient-specific mass for a teaspoon of sugar', () => {
    expect(estimateRecipeMeasure(ingredient('cukr krupice', 1, 'lžička'))).toMatchObject({
      quantity: 4,
      unit: 'g',
      estimated: true,
      basis: 'ingredient-mass',
    })
  })

  it('uses volume for a teaspoon of oil', () => {
    expect(estimateRecipeMeasure(ingredient('olivový olej', 1, 'lžička'))).toMatchObject({
      quantity: 5,
      unit: 'ml',
      estimated: true,
      basis: 'standard-volume',
    })
  })

  it('uses ingredient-specific mass for a pinch of ground pepper', () => {
    expect(estimateRecipeMeasure(ingredient('pepř mletý', 1, 'špetka'))).toMatchObject({
      quantity: 0.2,
      unit: 'g',
      estimated: true,
      basis: 'ingredient-specific',
    })
  })

  it('falls back to a small generic mass estimate for an unknown pinch', () => {
    expect(estimateRecipeMeasure(ingredient('neznámé koření', 1, 'špetka'))).toMatchObject({
      quantity: 0.3,
      unit: 'g',
      estimated: true,
      basis: 'generic-estimate',
    })
  })
})
