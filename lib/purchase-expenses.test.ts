import { describe, expect, it } from 'vitest'
import { sameExpenseTarget, splitPurchaseByCategory, targetsOf } from '@/lib/purchase-expenses'

const sum = (parts: { amount: number }[]) => Math.round(parts.reduce((total, part) => total + part.amount * 100, 0))

describe('splitPurchaseByCategory', () => {
  it('splits what was paid by the items’ categories, in proportion to the lines', () => {
    const parts = splitPurchaseByCategory(
      [
        { category: 'Potraviny', amount: 300 },
        { category: 'Potraviny', amount: 100 },
        { category: 'Drogerie', amount: 100 },
      ],
      500,
    )
    expect(parts).toEqual([
      { category: 'Drogerie', subcategory: null, amount: 100 },
      { category: 'Potraviny', subcategory: null, amount: 400 },
    ])
  })

  it('makes the parts add up to exactly the total, also after a receipt-wide discount', () => {
    // Lines 100 + 100 + 100, but a coupon made the total 289.99.
    const parts = splitPurchaseByCategory(
      [
        { category: 'Potraviny', amount: 100 },
        { category: 'Drogerie', amount: 100 },
        { category: 'Domácnost', amount: 100 },
      ],
      289.99,
    )
    expect(sum(parts)).toBe(28999)
    expect(parts.map((part) => part.amount).sort()).toEqual([96.66, 96.66, 96.67])
  })

  it('does not depend on the order of the items', () => {
    const lines = [
      { category: 'Potraviny' as const, amount: 33.33 },
      { category: 'Drogerie' as const, amount: 33.33 },
      { category: 'Ostatní' as const, amount: 33.34 },
    ]
    expect(splitPurchaseByCategory([...lines].reverse(), 100)).toEqual(splitPurchaseByCategory(lines, 100))
  })

  it('puts a purchase whose lines are worth nothing under the first item’s category', () => {
    expect(splitPurchaseByCategory([{ category: 'Děti', amount: 0 }], 49.9)).toEqual([{ category: 'Děti', subcategory: null, amount: 49.9 }])
  })

  it('makes nothing of an empty or free purchase', () => {
    expect(splitPurchaseByCategory([], 100)).toEqual([])
    expect(splitPurchaseByCategory([{ category: 'Potraviny', amount: 10 }], 0)).toEqual([])
  })

  describe('a household override (e.g. a gift bought during a grocery trip)', () => {
    it('counts a reassigned line under its own choice instead of the automatic mapping', () => {
      const parts = splitPurchaseByCategory(
        [
          { category: 'Potraviny', amount: 400 },
          { category: 'Potraviny', amount: 100, expenseOverride: [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }] },
        ],
        500,
      )
      expect(parts).toEqual([
        { category: 'Ostatní', subcategory: 'Dárky', amount: 100 },
        { category: 'Potraviny', subcategory: null, amount: 400 },
      ])
    })

    it('merges two overridden lines that land on the same category and subcategory', () => {
      const parts = splitPurchaseByCategory(
        [
          { category: 'Potraviny', amount: 60, expenseOverride: [{ category: 'Ostatní', subcategory: 'Dárky', amount: 60 }] },
          { category: 'Domácnost', amount: 40, expenseOverride: [{ category: 'Ostatní', subcategory: 'Dárky', amount: 40 }] },
        ],
        100,
      )
      expect(parts).toEqual([{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }])
    })

    it('keeps two different subcategories of the same category apart', () => {
      const parts = splitPurchaseByCategory(
        [
          { category: 'Potraviny', amount: 50, expenseOverride: [{ category: 'Ostatní', subcategory: 'Dárky', amount: 50 }] },
          { category: 'Potraviny', amount: 50, expenseOverride: [{ category: 'Ostatní', subcategory: 'Jiné', amount: 50 }] },
        ],
        100,
      )
      expect(parts).toEqual([
        { category: 'Ostatní', subcategory: 'Dárky', amount: 50 },
        { category: 'Ostatní', subcategory: 'Jiné', amount: 50 },
      ])
    })

    it('an empty override list is the same as no override', () => {
      expect(splitPurchaseByCategory([{ category: 'Potraviny', amount: 100, expenseOverride: [] }], 100)).toEqual(
        splitPurchaseByCategory([{ category: 'Potraviny', amount: 100 }], 100),
      )
    })

    it('splits one line across more than one target — e.g. clothing the receipt does not say is a child\'s', () => {
      const parts = splitPurchaseByCategory(
        [
          {
            category: 'Ostatní',
            amount: 1000,
            expenseOverride: [
              { category: 'Oblečení a obuv', subcategory: 'Oblečení', amount: 600 },
              { category: 'Děti', subcategory: 'Oblečení pro děti', amount: 400 },
            ],
          },
        ],
        1000,
      )
      expect(parts).toEqual([
        { category: 'Děti', subcategory: 'Oblečení pro děti', amount: 400 },
        { category: 'Oblečení a obuv', subcategory: 'Oblečení', amount: 600 },
      ])
    })
  })
})

describe('targetsOf', () => {
  it('is the automatic mapping, as the line\'s one target, without an override', () => {
    expect(targetsOf({ category: 'Potraviny', amount: 100 })).toEqual([{ target: { category: 'Potraviny', subcategory: null }, weight: 100 }])
  })

  it('is the household\'s own targets when it has one, ignoring the automatic mapping entirely', () => {
    expect(targetsOf({ category: 'Potraviny', amount: 100, expenseOverride: [{ category: 'Ostatní', subcategory: 'Dárky', amount: 100 }] })).toEqual([
      { target: { category: 'Ostatní', subcategory: 'Dárky' }, weight: 100 },
    ])
  })
})

describe('sameExpenseTarget', () => {
  it('treats matching category and subcategory (including both null) as the same target', () => {
    expect(sameExpenseTarget({ category: 'Potraviny', subcategory: null }, { category: 'Potraviny', subcategory: null })).toBe(true)
    expect(sameExpenseTarget({ category: 'Ostatní', subcategory: 'Dárky' }, { category: 'Ostatní', subcategory: 'Dárky' })).toBe(true)
  })

  it('is false for a different category or a different (or missing) subcategory', () => {
    expect(sameExpenseTarget({ category: 'Potraviny', subcategory: null }, { category: 'Drogerie', subcategory: null })).toBe(false)
    expect(sameExpenseTarget({ category: 'Ostatní', subcategory: 'Dárky' }, { category: 'Ostatní', subcategory: 'Jiné' })).toBe(false)
    expect(sameExpenseTarget({ category: 'Ostatní', subcategory: 'Dárky' }, { category: 'Ostatní', subcategory: null })).toBe(false)
  })
})
