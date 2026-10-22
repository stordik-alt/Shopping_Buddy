import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPES } from '@/lib/product-types'
import { PRODUCT_SUBCATEGORIES } from '@/lib/product-subcategories'
import {
  CATEGORY_VISUALS,
  NEUTRAL_PRODUCT_VISUAL,
  PRODUCT_TYPE_VISUALS,
  PRODUCT_VISUAL_TINTS,
  SUBCATEGORY_VISUALS,
  productVisualFor,
} from '@/lib/product-visuals'

describe('Product visuals', () => {
  it('gives every product type in the taxonomy a visual of its own', () => {
    const missing = PRODUCT_TYPES.filter((type) => !PRODUCT_TYPE_VISUALS[type.key]).map((type) => type.key)
    expect(missing).toEqual([])
  })

  it('knows no visual for a product type that does not exist', () => {
    const known = new Set(PRODUCT_TYPES.map((type) => type.key))
    const unknown = Object.keys(PRODUCT_TYPE_VISUALS).filter((key) => !known.has(key))
    expect(unknown).toEqual([])
  })

  it('gives every subcategory and every category a fallback', () => {
    const subcategories = Object.values(PRODUCT_SUBCATEGORIES).flat()
    expect(subcategories.filter((name) => !SUBCATEGORY_VISUALS[name])).toEqual([])
    expect(Object.keys(PRODUCT_SUBCATEGORIES).filter((category) => !CATEGORY_VISUALS[category as keyof typeof CATEGORY_VISUALS])).toEqual([])
  })

  it('draws every visual in a colour that exists', () => {
    const tints = new Set(Object.keys(PRODUCT_VISUAL_TINTS))
    const all = [...Object.values(PRODUCT_TYPE_VISUALS), ...Object.values(SUBCATEGORY_VISUALS), ...Object.values(CATEGORY_VISUALS)]
    expect(all.filter((visual) => !tints.has(visual.tint))).toEqual([])
  })

  it('does not give every product the same picture', () => {
    // The brief's rule: one generic icon for everything is not a product picture. A taxonomy of
    // this size has to spread over many drawings and colours.
    const distinct = new Set(Object.values(PRODUCT_TYPE_VISUALS).map((visual) => `${visual.shape}/${visual.tint}`))
    expect(distinct.size).toBeGreaterThan(40)
  })

  it('prefers the product type, then the subcategory, then the category', () => {
    const byType = productVisualFor({ productTypeKey: 'rajcata', subcategory: 'Ovoce a zelenina', category: 'Potraviny' })
    expect(byType).toEqual(PRODUCT_TYPE_VISUALS.rajcata)

    const bySubcategory = productVisualFor({ productTypeKey: null, subcategory: 'Mléčné výrobky', category: 'Potraviny' })
    expect(bySubcategory).toEqual(SUBCATEGORY_VISUALS['Mléčné výrobky'])

    const byCategory = productVisualFor({ productTypeKey: null, subcategory: null, category: 'Drogerie' })
    expect(byCategory).toEqual(CATEGORY_VISUALS.Drogerie)
  })

  it('falls back to a neutral picture instead of crashing on an unknown product', () => {
    expect(productVisualFor({ productTypeKey: 'neexistujici-typ', subcategory: 'Neexistujici podkategorie', category: null })).toEqual(NEUTRAL_PRODUCT_VISUAL)
    expect(productVisualFor({})).toEqual(NEUTRAL_PRODUCT_VISUAL)
  })
})
