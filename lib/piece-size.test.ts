import { describe, expect, it } from 'vitest'
import { pieceSizeFromName, pieceSizeOf, samePieceSize } from '@/lib/piece-size'
import { matchIngredientToStock } from '@/lib/meal-plans'
import type { PantryItem } from '@/lib/types'

describe('piece size', () => {
  it('reads one pack size from a receipt line name', () => {
    expect(pieceSizeFromName('MASLO PRAG. 250G')).toEqual({ quantity: 0.25, unit: 'kg' })
    expect(pieceSizeFromName('MLEKO POLOTUC. 1L')).toEqual({ quantity: 1, unit: 'l' })
  })

  it('reads nothing when the name has no size or two different ones', () => {
    expect(pieceSizeFromName('ROHLIK')).toBeNull()
    expect(pieceSizeFromName('SYR 100G / 200G')).toBeNull()
  })

  it('prefers the multipack a product states, and ignores weighed goods', () => {
    expect(pieceSizeOf({ unit: 'ks', unitQuantity: 1.5, unitUnit: 'l' }, 'VODA 6x1,5L')).toEqual({ quantity: 1.5, unit: 'l' })
    expect(pieceSizeOf({ unit: 'kg', unitQuantity: null, unitUnit: null }, 'KUR.PRSA 500G')).toBeNull()
  })

  it('compares sizes, unknown equal to unknown only', () => {
    expect(samePieceSize(null, null)).toBe(true)
    expect(samePieceSize({ quantity: 0.25, unit: 'kg' }, null)).toBe(false)
    expect(samePieceSize({ quantity: 0.25, unit: 'kg' }, { quantity: 0.25, unit: 'kg' })).toBe(true)
    expect(samePieceSize({ quantity: 0.25, unit: 'kg' }, { quantity: 1, unit: 'kg' })).toBe(false)
  })
})

describe('recipes use stock counted in pieces', () => {
  const butter = (over: Partial<PantryItem>): PantryItem => ({
    id: 'p1', productId: null, productTypeKey: 'maslo', name: 'Máslo', category: 'Potraviny', location: 'Lednice',
    quantity: 2, unit: 'ks', addedAt: '2026-10-10', ...over,
  })
  const need = (quantity: number) => ({ name: 'Máslo', category: 'Potraviny' as const, quantity, unit: 'g' as const })

  it('covers a recipe in grams from 2 × 250 g packs', () => {
    const stock = [butter({ unitQuantity: 0.25, unitUnit: 'kg' })]
    expect(matchIngredientToStock(need(100), stock)).toBeDefined()
    expect(matchIngredientToStock(need(500), stock)).toBeDefined()
    expect(matchIngredientToStock(need(600), stock)).toBeUndefined()
  })

  it('still cannot compare pieces of unknown size with grams', () => {
    expect(matchIngredientToStock(need(100), [butter({})])).toBeUndefined()
  })
})
