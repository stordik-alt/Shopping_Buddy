import { describe, expect, it } from 'vitest'
import type { PricePoint, ProductPrice } from '@/lib/prices'
import type { StandaloneOffer } from '@/lib/offers'
import type { RecipeIngredient } from '@/lib/recipes/types'
import { estimateRecipePrice } from '@/lib/recipes/pricing'

function ingredient(id: string, name: string, quantity: number, unit: RecipeIngredient['unit'] = 'kg'): RecipeIngredient {
  return { id, originalText: name, quantity, unit, name, scalable: true }
}

function price(store: string, regularPrice: number, unitPrice: number, unit: PricePoint['unit'] = 'kg', dealPrice?: number, dealValidUntil?: string): PricePoint {
  return { store, regularPrice, unitPrice, unit, dealPrice, dealValidUntil, recordedAt: '2026-09-30' }
}

function product(productName: string, prices: PricePoint[]): ProductPrice {
  return { productName, category: 'Potraviny', prices }
}

describe('recipe pricing', () => {
  it('estimates scaled ingredient cost from the current unit price', () => {
    const result = estimateRecipePrice([ingredient('i1', 'Rýže', 0.5)], [product('Rýže', [price('Lidl', 60, 60)])])
    expect(result.ingredientCount).toBe(1)
    expect(result.pricedIngredientCount).toBe(1)
    expect(result.estimatedTotal).toBe(30)
    expect(result.complete).toBe(true)
  })

  it('uses an active deal price before the regular price', () => {
    const result = estimateRecipePrice(
      [ingredient('i1', 'Kuřecí prsa', 0.5)],
      [product('Kuřecí prsa', [price('Albert', 180, 180, 'kg', 120, '2026-10-05')])],
    )
    expect(result.estimatedTotal).toBe(60)
    expect(result.ingredientPrices[0]?.isDeal).toBe(true)
    expect(result.activeDeals).toEqual([{ ingredientName: 'Kuřecí prsa', store: 'Albert', price: 120, estimatedCost: 60, validUntil: '2026-10-05' }])
  })

  it('converts grams against a price recorded per kilogram', () => {
    const result = estimateRecipePrice([ingredient('i1', 'Mouka', 250, 'g')], [product('Mouka', [price('Lidl', 40, 40, 'kg')])])
    expect(result.estimatedTotal).toBe(10)
  })

  it('does not price an ingredient when its unit cannot be compared', () => {
    const result = estimateRecipePrice([ingredient('i1', 'Jablka', 1, 'ks')], [product('Jablka', [price('Lidl', 35, 35, 'kg')])])
    expect(result.pricedIngredientCount).toBe(0)
    expect(result.estimatedTotal).toBeNull()
    expect(result.unpricedIngredients).toEqual(['Jablka'])
    expect(result.complete).toBe(false)
  })

  it('reports a complete-store total separately from the cheapest mix of stores', () => {
    const ingredients = [ingredient('i1', 'Rýže', 0.5), ingredient('i2', 'Kuřecí prsa', 0.5)]
    const products = [
      product('Rýže', [price('Lidl', 60, 60), price('Albert', 70, 70)]),
      product('Kuřecí prsa', [price('Lidl', 150, 150), price('Albert', 120, 120)]),
    ]
    const result = estimateRecipePrice(ingredients, products)
    expect(result.estimatedTotal).toBe(90)
    expect(result.cheapestCompleteStore).toEqual({ store: 'Albert', total: 95, pricedIngredients: 2, dealIngredients: 0 })
    expect(result.completeStoreEstimates.map((item) => item.store)).toEqual(['Albert', 'Lidl'])
  })

  it('accepts an offer-only product when a unit price is available', () => {
    const offers: StandaloneOffer[] = [{
      productName: 'Vejce',
      category: 'Potraviny',
      store: 'Penny',
      storeId: 'penny',
      dealPrice: 45,
      unit: 'ks',
      unitPrice: 4.5,
      validUntil: '2026-10-03',
    }]
    const result = estimateRecipePrice([ingredient('i1', 'Vejce', 6, 'ks')], [], offers)
    expect(result.estimatedTotal).toBe(27)
    expect(result.complete).toBe(true)
  })
})
