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

  it('keeps culinary measures addable instead of blocking them', () => {
    expect(
      analyzeRecipeIngredient(
        { id: 'i1', originalText: 'špetka soli', quantity: 1, unit: 'špetka', name: 'sůl', scalable: true },
        [],
      ),
    ).toMatchObject({ quantity: 1, unit: 'ks', problem: null, missingQuantity: 1 })

    expect(
      analyzeRecipeIngredient(
        { id: 'i2', originalText: '1 lžička grilovacího koření', quantity: 1, unit: 'lžička', name: 'grilovacího koření', scalable: true },
        [],
      ),
    ).toMatchObject({ quantity: 1, unit: 'ks', problem: null, missingQuantity: 1 })

    expect(
      toRecipeShoppingItem(
        { id: 'i3', originalText: '2 stroužky česneku', quantity: 2, unit: 'stroužek', name: 'česnek', scalable: true },
      ),
    ).toMatchObject({ quantity: 1, unit: 'ks', sourceMeasure: '2 stroužek' })
  })

  it('allows ingredients without a quantity to be added as a shopping placeholder', () => {
    expect(
      analyzeRecipeIngredient(
        { id: 'i1', originalText: 'sůl podle chuti', name: 'sůl', scalable: false },
        [],
      ),
    ).toMatchObject({
      quantity: 1,
      unit: 'ks',
      problem: null,
      missingQuantity: 1,
      sourceMeasure: 'množství neuvedeno',
    })

    expect(
      toRecipeShoppingItem(
        { id: 'i2', originalText: 'pepř dle potřeby', name: 'pepř', scalable: false },
      ),
    ).toEqual({
      name: 'pepř',
      quantity: 1,
      unit: 'ks',
      sourceMeasure: 'množství neuvedeno',
    })
  })

  it('allows positive quantities with unknown units as shopping placeholders', () => {
    expect(
      analyzeRecipeIngredient(
        { id: 'i2', originalText: '2 balení česneku', quantity: 2, unit: 'balení', name: 'česnek', scalable: true },
        [],
      ),
    ).toMatchObject({
      quantity: 1,
      unit: 'ks',
      problem: null,
      missingQuantity: 1,
      sourceMeasure: '2 balení',
    })

    expect(
      toRecipeShoppingItem(
        { id: 'i3', originalText: '2 česneky', quantity: 2, name: 'česnek', scalable: true },
      ),
    ).toEqual({
      name: 'česnek',
      quantity: 1,
      unit: 'ks',
      sourceMeasure: '2',
    })
  })

  it('still flags an invalid quantity', () => {
    expect(
      analyzeRecipeIngredient(
        { id: 'i2', originalText: '0 balení česneku', quantity: 0, unit: 'balení', name: 'česnek', scalable: true },
        [],
      ).problem,
    ).toBe('Množství není platné.')
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
