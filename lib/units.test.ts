import { describe, expect, it } from 'vitest'
import { ITEM_UNITS, unitLabel } from '@/lib/units'
import { convertQuantity } from '@/lib/meal-plans'
import { PANTRY_QUANTITY_STEP } from '@/lib/pantry'
import { stockOfType, type StockLevel } from '@/lib/pantry-restock'
import type { PantryItem } from '@/lib/types'

describe('dávka', () => {
  it('is a unit, with the Czech plural next to a number', () => {
    expect(ITEM_UNITS).toContain('dávka')
    expect([1, 3, 5, 45, 0.5].map((n) => unitLabel(n, 'dávka'))).toEqual(['dávka', 'dávky', 'dávek', 'dávek', 'dávek'])
    expect(unitLabel(3, 'ks')).toBe('ks')
    expect(PANTRY_QUANTITY_STEP['dávka']).toBe(1)
  })

  it('converts to nothing but doses', () => {
    expect(convertQuantity(45, 'dávka', 'dávka')).toBe(45)
    expect(convertQuantity(45, 'dávka', 'ks')).toBeNull()
    expect(convertQuantity(1, 'kg', 'dávka')).toBeNull()
  })

  it('counts the stock of a type in doses: 45 doses bought, 12 left', () => {
    const level: StockLevel = { id: 'l', productTypeKey: 'praci-gel', typeName: 'Prací gel', minQuantity: 20, maxQuantity: 90, unit: 'dávka' }
    const row = (over: Partial<PantryItem>): PantryItem => ({ id: 'a', name: 'Gel', category: 'Drogerie', location: 'Spíž', quantity: 45, unit: 'dávka', addedAt: '2026-10-01T00:00:00.000Z', productTypeKey: 'praci-gel', ...over })
    expect(stockOfType(level, [row({}), row({ id: 'b', quantity: 12 }), row({ id: 'c', unit: 'kg', quantity: 2 })])).toBe(57)
  })
})
