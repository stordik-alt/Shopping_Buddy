import { describe, expect, it } from 'vitest'
import {
  analyzeRecipeIngredient,
  mapRecipeUnit,
  pantryStockQuantity,
  toRecipeShoppingItem,
} from '@/lib/recipes/shopping'

describe('recipe shopping helpers', () => {
  it('maps supported recipe units', () => {
    expect(mapRecipeUnit('kg')).toEqual({ unit: 'kg', multiplier: 1 })
    expect(mapRecipeUnit('ks')).toEqual({ unit: 'ks', multiplier: 1 })
    expect(mapRecipeUnit('dkg')).toEqual({ unit: 'g', multiplier: 10 })
    expect(mapRecipeUnit('cl')).toEqual({ unit: 'l', multiplier: 0.01 })
    expect(mapRecipeUnit('lžíce')).toBeNull()
  })

  it('creates a shopping item with a normalized unit', () => {
    expect(
      toRecipeShoppingItem({
        id: 'i1',
        originalText: '2 dkg másla',
        quantity: 2,
        unit: 'dkg',
        name: 'Máslo',
        scalable: true,
      }),
    ).toEqual({ name: 'Máslo', quantity: 20, unit: 'g' })
  })

  it('flags unquantifiable or unsupported ingredients as problems', () => {
    expect(
      analyzeRecipeIngredient(
        { id: 'i1', originalText: 'špetka soli', name: 'sůl', scalable: false },
        [],
      ).problem,
    ).toBe('Množství nelze bezpečně určit.')

    expect(
      analyzeRecipeIngredient(
        { id: 'i2', originalText: '2 stroužky česneku', quantity: 2, unit: 'stroužek', name: 'česnek', scalable: true },
        [],
      ).problem,
    ).toContain('Jednotku')
  })

  it('subtracts all compatible pantry placements from the recipe quantity', () => {
    const pantry = [
      { id: 'p1', name: 'Mléko', category: 'Potraviny', location: 'Lednice', quantity: 0.5, unit: 'l', addedAt: '2026-09-30' },
      { id: 'p2', name: 'mléko', category: 'Potraviny', location: 'Spíž', quantity: 300, unit: 'ml', addedAt: '2026-09-30' },
    ] as const

    expect(
      pantryStockQuantity(pantry as never, { name: 'Mléko', quantity: 1, unit: 'l' }),
    ).toBeCloseTo(0.8)

    expect(
      analyzeRecipeIngredient(
        { id: 'i1', originalText: '1 l mléka', quantity: 1, unit: 'l', name: 'Mléko', scalable: true },
        pantry as never,
      ).missingQuantity,
    ).toBeCloseTo(0.2)
  })
})
