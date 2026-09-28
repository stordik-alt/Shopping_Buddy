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
