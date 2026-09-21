import { describe, expect, it } from 'vitest'
import { currentWeekStart, generateWeeklyPlan, planIngredients } from '@/lib/meal-plans'
import type { Household } from '@/lib/types'

function household(overrides: Partial<Household> = {}): Household {
  return {
    id: 'h1',
    name: 'Test Household',
    monthlyBudget: 10000,
    members: [],
    children: [],
    preferences: {
      preferredBrands: [],
      preferredStores: [],
      preferredProducts: [],
      excludedProducts: [],
      priceSensitivity: 'Vyvážené',
      qualityPreference: 'Standardní',
      preferCzechProducts: false,
    },
    restrictions: [],
    ...overrides,
  }
}

describe('generateWeeklyPlan', () => {
  it('produces exactly 7 days with all 4 meals filled', () => {
    const plan = generateWeeklyPlan(3000, household())
    expect(plan.days).toHaveLength(7)
    for (const day of plan.days) {
      expect(day.breakfast).toBeDefined()
      expect(day.lunch).toBeDefined()
      expect(day.dinner).toBeDefined()
      expect(day.snack).toBeDefined()
    }
  })

  it('never recommends a recipe containing a member\'s allergen when a safe alternative exists', () => {
    // The recipe catalog has both nut-containing and nut-free breakfast/snack options,
    // so a household with a nut allergy must never see 'ořechy' in any selected recipe.
    const plan = generateWeeklyPlan(3000, household({ members: [{ id: 'm1', name: 'A', role: 'Správce domácnosti', age: 30, preferences: '', favoriteFoods: [], dislikedFoods: [], allergies: ['Ořechy'] }] }))
    for (const day of plan.days) {
      for (const recipe of [day.breakfast, day.lunch, day.dinner, day.snack]) {
        expect(recipe.allergens.map((a) => a.toLowerCase())).not.toContain('ořechy')
      }
    }
  })

  it('matches allergies case-insensitively', () => {
    const plan = generateWeeklyPlan(3000, household({ members: [{ id: 'm1', name: 'A', role: 'Správce domácnosti', age: 30, preferences: '', favoriteFoods: [], dislikedFoods: [], allergies: ['LEPEK'] }] }))
    for (const day of plan.days) {
      for (const recipe of [day.breakfast, day.lunch, day.dinner, day.snack]) {
        expect(recipe.allergens.map((a) => a.toLowerCase())).not.toContain('lepek')
      }
    }
  })

  it('still assigns every meal, avoiding all allergens, for a household with multiple allergies', () => {
    const allergies = ['Ořechy', 'Lepek', 'Laktóza']
    const plan = generateWeeklyPlan(3000, household({ members: [{ id: 'm1', name: 'A', role: 'Správce domácnosti', age: 30, preferences: '', favoriteFoods: [], dislikedFoods: [], allergies }] }))
    const excluded = new Set(allergies.map((a) => a.toLowerCase()))
    for (const day of plan.days) {
      for (const recipe of [day.breakfast, day.lunch, day.dinner, day.snack]) {
        expect(recipe).toBeDefined()
        for (const allergen of recipe.allergens) expect(excluded.has(allergen.toLowerCase())).toBe(false)
      }
    }
  })

  it('flags over-budget plans instead of silently understating the total', () => {
    const cheapPlan = generateWeeklyPlan(100000, household())
    expect(cheapPlan.estimatedTotal).toBeLessThanOrEqual(100000)

    const tightPlan = generateWeeklyPlan(1, household())
    expect(tightPlan.estimatedTotal).toBeGreaterThan(1)
  })

  it('recommends the household\'s preferred stores when set', () => {
    const plan = generateWeeklyPlan(100000, household({ preferences: { preferredBrands: [], preferredStores: ['Billa'], preferredProducts: [], excludedProducts: [], priceSensitivity: 'Vyvážené', qualityPreference: 'Standardní', preferCzechProducts: false } }))
    expect(plan.recommendedStores).toEqual(['Billa'])
  })
})

describe('planIngredients', () => {
  it('deduplicates ingredients that repeat across meals and includes staples', () => {
    const plan = generateWeeklyPlan(3000, household())
    const ingredients = planIngredients(plan)
    const names = ingredients.map((i) => i.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(expect.arrayContaining(['Toaletní papír', 'Prací prostředek', 'Houbičky na nádobí']))
  })
})

describe('currentWeekStart', () => {
  it('returns the Monday on-or-before the given date', () => {
    // 2026-09-19 is a Saturday; regression test for a timezone bug where mixing local-time
    // Date methods with UTC-based toISOString() shifted this a day off on UTC+2 machines.
    expect(currentWeekStart('2026-09-19')).toBe('2026-09-14')
  })

  it('is idempotent for a date that is already a Monday', () => {
    expect(currentWeekStart('2026-09-14')).toBe('2026-09-14')
  })

  it('handles Sunday correctly (the ISO week-start edge case)', () => {
    expect(currentWeekStart('2026-09-20')).toBe('2026-09-14')
  })

  it('is stable across a year boundary', () => {
    expect(currentWeekStart('2027-01-01')).toBe('2026-12-28')
  })
})
