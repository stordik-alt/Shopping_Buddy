import { describe, expect, it } from 'vitest'
import {
  convertQuantity,
  currentWeekStart,
  generateWeeklyPlan,
  isMealCooked,
  markMealCooked,
  matchIngredientToStock,
  mealKey,
  parseSavedPlan,
  planIngredients,
  recipeFor,
  regenerateMeal,
  splitIngredientsByStock,
} from '@/lib/meal-plans'
import type { Ingredient, WeeklyMealPlan } from '@/lib/meal-plans'
import type { Household, PantryItem } from '@/lib/types'

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return { id: 'p1', name: 'Mléko polotučné', category: 'Potraviny', location: 'Lednice', quantity: 1, unit: 'ks', addedAt: '2026-09-20T00:00:00Z', ...overrides }
}

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

  it('sums quantities for an ingredient used by more than one meal in the week, rather than keeping only one occurrence\'s amount', () => {
    const plan = generateWeeklyPlan(3000, household())
    // Every meal-type pool has 3-4 recipes but the week has 7 days, so at least one recipe (and
    // therefore its ingredients) necessarily repeats — count real occurrences and compare.
    const allIngredients = plan.days.flatMap((day) => [day.breakfast, day.lunch, day.dinner, day.snack].flatMap((r) => r.ingredients))
    const [sampleName] = allIngredients.map((i) => i.name)
    const occurrences = allIngredients.filter((i) => i.name === sampleName)
    const expectedTotal = occurrences.reduce((sum, i) => sum + i.quantity, 0)
    const combined = planIngredients(plan).find((i) => i.name === sampleName)
    expect(combined?.quantity).toBeCloseTo(expectedTotal)
  })
})

describe('generateWeeklyPlan — stock-aware (pantryItems supplied)', () => {
  it('prefers a recipe that uses an ingredient the household already has in stock', () => {
    // b1 (Ovesná kaše s banánem) needs 0.25 l Mléko polotučné; the other breakfast recipes don't use it.
    const withMilk = generateWeeklyPlan(3000, household(), [pantryItem({ name: 'Mléko polotučné', unit: 'l', quantity: 1 })])
    expect(withMilk.days[0].breakfast.id).toBe('b1')
  })

  it('is unaffected by stock the household does not actually have (quantity 0)', () => {
    const emptyStock = generateWeeklyPlan(3000, household(), [pantryItem({ name: 'Mléko polotučné', quantity: 0 })])
    const noStock = generateWeeklyPlan(3000, household(), null)
    expect(emptyStock.days[0].breakfast.id).toBe(noStock.days[0].breakfast.id)
  })

  it('still fills every meal and respects allergens when stock-aware', () => {
    const plan = generateWeeklyPlan(3000, household({ members: [{ id: 'm1', name: 'A', role: 'Správce domácnosti', age: 30, preferences: '', favoriteFoods: [], dislikedFoods: [], allergies: ['lepek'] }] }), [pantryItem({ name: 'Těstoviny' })])
    for (const day of plan.days) {
      for (const recipe of [day.breakfast, day.lunch, day.dinner, day.snack]) {
        expect(recipe.allergens.map((a) => a.toLowerCase())).not.toContain('lepek')
      }
    }
  })
})

describe('matchIngredientToStock', () => {
  it('matches case/whitespace-insensitively', () => {
    const match = matchIngredientToStock({ name: 'MLÉKO POLOTUČNÉ', category: 'Potraviny', quantity: 1, unit: 'ks' }, [pantryItem({ name: ' mléko polotučné ' })])
    expect(match).toBeDefined()
  })

  it('does not match a pantry row with zero quantity', () => {
    const match = matchIngredientToStock({ name: 'Mléko polotučné', category: 'Potraviny', quantity: 1, unit: 'ks' }, [pantryItem({ quantity: 0 })])
    expect(match).toBeUndefined()
  })

  it('does not match a different product name', () => {
    const match = matchIngredientToStock({ name: 'Banány', category: 'Potraviny', quantity: 1, unit: 'ks' }, [pantryItem({ name: 'Mléko polotučné' })])
    expect(match).toBeUndefined()
  })

  it('does not match when the pantry has some stock but less than the recipe needs', () => {
    const match = matchIngredientToStock(
      { name: 'Mléko polotučné', category: 'Potraviny', quantity: 0.5, unit: 'l' },
      [pantryItem({ name: 'Mléko polotučné', unit: 'l', quantity: 0.2 })],
    )
    expect(match).toBeUndefined()
  })

  it('matches across compatible units via real conversion (kg pantry stock, g recipe need)', () => {
    const match = matchIngredientToStock(
      { name: 'Mouka', category: 'Potraviny', quantity: 200, unit: 'g' },
      [pantryItem({ name: 'Mouka', unit: 'kg', quantity: 1 })],
    )
    expect(match).toBeDefined()
  })

  it('does not match across incompatible unit groups (recipe needs weight, pantry counts pieces)', () => {
    const match = matchIngredientToStock(
      { name: 'Kuřecí prsa', category: 'Potraviny', quantity: 0.15, unit: 'kg' },
      [pantryItem({ name: 'Kuřecí prsa', unit: 'ks', quantity: 5 })],
    )
    expect(match).toBeUndefined()
  })
})

describe('convertQuantity', () => {
  it('converts between mass units', () => {
    expect(convertQuantity(1, 'kg', 'g')).toBe(1000)
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5)
  })

  it('converts between volume units', () => {
    expect(convertQuantity(0.25, 'l', 'ml')).toBe(250)
    expect(convertQuantity(250, 'ml', 'l')).toBe(0.25)
  })

  it('returns the same quantity unchanged when units already match', () => {
    expect(convertQuantity(3, 'ks', 'ks')).toBe(3)
  })

  it('returns null for units that cannot be meaningfully compared', () => {
    expect(convertQuantity(1, 'kg', 'ks')).toBeNull()
    expect(convertQuantity(1, 'l', 'g')).toBeNull()
  })
})

describe('splitIngredientsByStock', () => {
  it('separates ingredients already in stock from ones that still need buying', () => {
    const plan = generateWeeklyPlan(3000, household())
    const { fromStock, toBuy } = splitIngredientsByStock(plan, [pantryItem({ name: 'Toaletní papír', category: 'Drogerie' })])
    expect(fromStock.map((i) => i.name)).toEqual(['Toaletní papír'])
    expect(toBuy.map((i) => i.name)).not.toContain('Toaletní papír')
    expect(fromStock.length + toBuy.length).toBe(planIngredients(plan).length)
  })
})

/** A plan as it was saved before ingredients carried a quantity and unit (commit 45d3db7): every
 *  ingredient is just `{ name, category }`. Stored in `meal_plans.plan` as JSON, so households that
 *  generated a plan earlier in the week still have this shape in the database. */
function legacySavedPlanJson(): string {
  const plan = generateWeeklyPlan(3000, household())
  const stripped = JSON.parse(JSON.stringify(plan), (key, value) => (key === 'quantity' || key === 'unit' ? undefined : value))
  // JSON.parse's reviver drops undefined results, but it also matched Recipe-level keys named
  // `quantity`/`unit`: there are none, so only ingredients were affected. Re-serialize as stored.
  delete stripped.cookedMeals // the field older still-saved plans also lacked
  return JSON.stringify(stripped)
}

describe('saved plans from before ingredients had quantities (regression: dashboard crash)', () => {
  it('reproduces the original failure: comparing units with an ingredient that has none threw a TypeError', () => {
    const legacy = JSON.parse(legacySavedPlanJson()) as WeeklyMealPlan
    expect(legacy.days[0].breakfast.ingredients[0]).not.toHaveProperty('unit')
    // "Cannot read properties of undefined (reading 'group')" — what the browser showed.
    expect(() => splitIngredientsByStock(legacy, [pantryItem({ name: legacy.days[0].breakfast.ingredients[0].name })])).not.toThrow()
  })

  it('convertQuantity treats an unknown or missing unit as not comparable instead of throwing', () => {
    expect(convertQuantity(1, 'kg', undefined as unknown as 'g')).toBeNull()
    expect(convertQuantity(1, undefined as unknown as 'kg', 'g')).toBeNull()
    expect(convertQuantity(1, 'furlong' as unknown as 'kg', 'g')).toBeNull()
  })

  it('matchIngredientToStock does not throw for a malformed ingredient and simply does not match it', () => {
    const malformed = { name: 'Mléko polotučné', category: 'Potraviny' } as unknown as Ingredient
    expect(matchIngredientToStock(malformed, [pantryItem()])).toBeUndefined()
  })

  it('upgrades a legacy plan: every ingredient gets its real quantity and unit from the recipe catalog', () => {
    const upgraded = parseSavedPlan(legacySavedPlanJson())
    expect(upgraded).not.toBeNull()
    const current = generateWeeklyPlan(3000, household())
    expect(upgraded!.days).toEqual(current.days) // same recipes, now with current-shape ingredients
    expect(upgraded!.staples).toEqual(current.staples)
    for (const ingredient of planIngredients(upgraded!)) {
      expect(Number.isFinite(ingredient.quantity)).toBe(true)
      expect(ingredient.unit).toMatch(/^(ks|kg|g|l|ml)$/)
    }
  })

  it('the upgraded plan works with the stock logic that used to crash', () => {
    const upgraded = parseSavedPlan(legacySavedPlanJson())!
    const first = upgraded.days[0].breakfast.ingredients[0]
    const { fromStock, toBuy } = splitIngredientsByStock(upgraded, [pantryItem({ name: first.name, quantity: 100, unit: first.unit })])
    expect(fromStock.map((i) => i.name)).toContain(first.name)
    expect(fromStock.length + toBuy.length).toBe(planIngredients(upgraded).length)
  })

  it('backfills cookedMeals for a plan saved before that field existed', () => {
    expect(parseSavedPlan(legacySavedPlanJson())!.cookedMeals).toEqual([])
  })

  it('keeps the household\'s own data: cooked meals and each recipe\'s saved name and price', () => {
    const plan = markMealCooked(generateWeeklyPlan(3000, household()), 'Pondělí', 'Snídaně')
    const saved = JSON.stringify(plan)
    const parsed = parseSavedPlan(saved)!
    expect(parsed.cookedMeals).toEqual(plan.cookedMeals)
    expect(parsed.estimatedTotal).toBe(plan.estimatedTotal)
    expect(parsed.days[0].breakfast.price).toBe(plan.days[0].breakfast.price)
  })

  it('leaves a current-shape plan exactly as saved', () => {
    const plan = generateWeeklyPlan(3000, household())
    expect(parseSavedPlan(JSON.stringify(plan))).toEqual(plan)
  })

  it('returns null (so the household regenerates) when a legacy recipe no longer exists in the catalog', () => {
    const legacy = JSON.parse(legacySavedPlanJson()) as WeeklyMealPlan
    legacy.days[2].lunch = { ...legacy.days[2].lunch, id: 'removed-recipe' }
    expect(parseSavedPlan(JSON.stringify(legacy))).toBeNull()
  })

  it('returns null for a saved value that is not a plan at all', () => {
    expect(parseSavedPlan('{"days": "nope"}')).toBeNull()
    expect(parseSavedPlan('{}')).toBeNull()
  })

  it('still throws on invalid JSON — corrupt data is not silently ignored', () => {
    expect(() => parseSavedPlan('{not json')).toThrow()
  })
})

describe('regenerateMeal', () => {
  it('replaces only the requested day/meal slot, leaving the rest of the week untouched', () => {
    const plan = generateWeeklyPlan(3000, household())
    const updated = regenerateMeal(plan, 'Pondělí', 'Snídaně', household())
    expect(updated.days[0].lunch).toEqual(plan.days[0].lunch)
    expect(updated.days[0].dinner).toEqual(plan.days[0].dinner)
    expect(updated.days.slice(1)).toEqual(plan.days.slice(1))
  })

  it('always picks a different recipe than the one currently assigned, when an alternative exists', () => {
    const plan = generateWeeklyPlan(3000, household())
    const updated = regenerateMeal(plan, 'Pondělí', 'Snídaně', household())
    expect(updated.days[0].breakfast.id).not.toBe(plan.days[0].breakfast.id)
  })

  it('recomputes estimatedTotal to reflect the swapped recipe', () => {
    const plan = generateWeeklyPlan(3000, household())
    const updated = regenerateMeal(plan, 'Pondělí', 'Snídaně', household())
    const priceDiff = updated.days[0].breakfast.price - plan.days[0].breakfast.price
    expect(updated.estimatedTotal).toBe(plan.estimatedTotal + priceDiff)
  })

  it('leaves the plan unchanged for a day that does not exist', () => {
    const plan = generateWeeklyPlan(3000, household())
    expect(regenerateMeal(plan, 'Neexistuje', 'Snídaně', household())).toEqual(plan)
  })
})

describe('mealKey / isMealCooked / markMealCooked / recipeFor', () => {
  it('marking a meal cooked is idempotent and only affects that one meal', () => {
    const plan = generateWeeklyPlan(3000, household())
    const once = markMealCooked(plan, 'Pondělí', 'Snídaně')
    const twice = markMealCooked(once, 'Pondělí', 'Snídaně')
    expect(once.cookedMeals).toEqual([mealKey('Pondělí', 'Snídaně')])
    expect(twice.cookedMeals).toEqual(once.cookedMeals)
    expect(isMealCooked(once, 'Pondělí', 'Snídaně')).toBe(true)
    expect(isMealCooked(once, 'Pondělí', 'Oběd')).toBe(false)
  })

  it('recipeFor returns the recipe currently assigned to a day/meal slot', () => {
    const plan = generateWeeklyPlan(3000, household())
    expect(recipeFor(plan, 'Pondělí', 'Snídaně')).toEqual(plan.days[0].breakfast)
    expect(recipeFor(plan, 'Neexistuje', 'Snídaně')).toBeUndefined()
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
