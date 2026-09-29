import { describe, expect, it } from 'vitest'
import {
  classifySubcategoryByKeyword,
  isChildOrientedByKeyword,
  isNonInventoryLine,
  isValidProductSubcategory,
  PRODUCT_SUBCATEGORIES,
  subcategoriesOfItem,
} from '@/lib/product-subcategories'
import { normalizeProductText } from '@/lib/product-normalize'
import { itemCategoryEnum } from '@/lib/db/schema'

// The taxonomy must agree with the database enum, the same guard pattern PANTRY_LOCATIONS already
// has against pantry_location (lib/pantry.test.ts) — a category here that the enum doesn't know
// would silently be unreachable, one the enum has but this file doesn't would be undocumented.
describe('PRODUCT_SUBCATEGORIES', () => {
  it('has exactly one entry per item_category enum value', () => {
    expect(Object.keys(PRODUCT_SUBCATEGORIES).sort()).toEqual([...itemCategoryEnum.enumValues].sort())
  })
})

describe('classifySubcategoryByKeyword — spec section 2/21 examples', () => {
  const cases: Array<[string, string]> = [
    ['Máslo', 'Mléčné výrobky'],
    ['Šunka', 'Maso a uzeniny'],
    ['Jupík', 'Nápoje'],
    ['Kubík', 'Nápoje'],
    ['Dobrá Voda', 'Nápoje'],
    ['Mattoni', 'Nápoje'],
  ]
  it.each(cases)('%s -> Potraviny ▸ %s', (name, expected) => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText(name))).toBe(expected)
  })

  it('returns null (never a guess) for a name matching no keyword', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('xyz neznámá položka'))).toBeNull()
  })

  it('classifies a flavored drink as Nápoje, not Ovoce a zelenina, when its name also names a fruit (regression: found via a production dry run)', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('KORUNNÍ ETERA JABLKO'))).toBe('Nápoje')
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('YESS POMERANČ 0,5L'))).toBe('Nápoje')
  })

  it('still classifies a bare fruit/vegetable name as produce when no beverage brand or volume marker is present', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Jablka'))).toBe('Ovoce a zelenina')
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Pomeranče'))).toBe('Ovoce a zelenina')
  })

  it('does not guess a subcategory for an unbranded liter-volume fruit name (falls back to null over a wrong guess)', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Jablečná limonáda bez brandu 1,5l'))).toBe('Nápoje')
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Neznámý pomerančový nápoj 0,5l'))).toBe('Nápoje')
  })
})

describe('isValidProductSubcategory', () => {
  it('accepts every name in the fixed list and null, rejects anything else', () => {
    for (const name of subcategoriesOfItem('Potraviny')) expect(isValidProductSubcategory('Potraviny', name)).toBe(true)
    expect(isValidProductSubcategory('Potraviny', null)).toBe(true)
    expect(isValidProductSubcategory('Potraviny', 'Neexistující kategorie')).toBe(false)
    // A real Drogerie subcategory must not validate under Potraviny — categories don't share lists.
    expect(isValidProductSubcategory('Potraviny', 'Praní')).toBe(false)
  })
})

describe('isNonInventoryLine — spec section 14', () => {
  it('recognizes common non-product receipt lines', () => {
    expect(isNonInventoryLine(normalizeProductText('Taška'))).toBe(true)
    expect(isNonInventoryLine(normalizeProductText('Igelitová taška'))).toBe(true)
    expect(isNonInventoryLine(normalizeProductText('Vratná záloha'))).toBe(true)
  })

  it('does not flag an ordinary product', () => {
    expect(isNonInventoryLine(normalizeProductText('Kuřecí prsa'))).toBe(false)
  })
})

describe('isChildOrientedByKeyword — spec section 10', () => {
  it('tags known children\'s brands without needing a category change', () => {
    expect(isChildOrientedByKeyword(normalizeProductText('Kubík 200ml'))).toBe(true)
    expect(isChildOrientedByKeyword(normalizeProductText('Jupík jahoda'))).toBe(true)
  })

  it('does not tag an unrelated product', () => {
    expect(isChildOrientedByKeyword(normalizeProductText('Mattoni 1.5l'))).toBe(false)
  })
})

describe('Ostatní item category', () => {
  it('offers its own subcategories', () => {
    expect(subcategoriesOfItem('Ostatní')).toContain('Oblečení a obuv')
    expect(isValidProductSubcategory('Ostatní', 'Tabák a e-cigarety')).toBe(true)
  })

  it.each([
    ['spodni pradlo', 'Oblečení a obuv'],
    ['X4 Bar Chladivé liči jednorázová e-cigareta', 'Tabák a e-cigarety'],
    ['Baterie AA', 'Elektronika'],
  ])('%s -> %s', (name, expected) => {
    expect(classifySubcategoryByKeyword('Ostatní', normalizeProductText(name))).toBe(expected)
  })
})
