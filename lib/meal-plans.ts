import type { Household, ItemCategory, PantryItem } from '@/lib/types'

export type MealType = 'Snídaně' | 'Oběd' | 'Večeře' | 'Svačina'

export type Ingredient = { name: string; category: ItemCategory }

export type Recipe = {
  id: string
  name: string
  mealType: MealType
  price: number
  allergens: string[]
  ingredients: Ingredient[]
}

export type DayPlan = {
  day: string
  breakfast: Recipe
  lunch: Recipe
  dinner: Recipe
  snack: Recipe
}

export type WeeklyMealPlan = {
  days: DayPlan[]
  staples: Ingredient[]
  estimatedTotal: number
  recommendedStores: string[]
  // Keys of meals the household has confirmed they actually cooked this week (see mealKey()),
  // each one deducting its recipe's ingredients from the pantry exactly once (markMealCookedAction
  // in app/actions/meal-plan.ts). Marking is one-directional — there is no "unmark" that restores
  // the deducted stock, since we don't track what exactly was deducted per meal to reverse it.
  cookedMeals: string[]
}

export const DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle']

const STAPLES: Ingredient[] = [
  { name: 'Toaletní papír', category: 'Drogerie' },
  { name: 'Prací prostředek', category: 'Drogerie' },
  { name: 'Houbičky na nádobí', category: 'Domácnost' },
]

const RECIPES: Recipe[] = [
  {
    id: 'b1',
    name: 'Ovesná kaše s banánem',
    mealType: 'Snídaně',
    price: 28,
    allergens: [],
    ingredients: [
      { name: 'Ovesné vločky', category: 'Potraviny' },
      { name: 'Mléko polotučné', category: 'Potraviny' },
      { name: 'Banány', category: 'Potraviny' },
    ],
  },
  {
    id: 'b2',
    name: 'Vejce na měkko s pečivem',
    mealType: 'Snídaně',
    price: 32,
    allergens: ['lepek'],
    ingredients: [
      { name: 'Vejce', category: 'Potraviny' },
      { name: 'Pečivo', category: 'Potraviny' },
      { name: 'Máslo', category: 'Potraviny' },
    ],
  },
  {
    id: 'b3',
    name: 'Řecký jogurt s ovocem',
    mealType: 'Snídaně',
    price: 35,
    allergens: ['laktóza'],
    ingredients: [
      { name: 'Řecký jogurt', category: 'Potraviny' },
      { name: 'Jablka', category: 'Potraviny' },
      { name: 'Med', category: 'Potraviny' },
    ],
  },
  {
    id: 'b4',
    name: 'Bezlepkové müsli s mandlovým mlékem',
    mealType: 'Snídaně',
    price: 39,
    allergens: ['ořechy'],
    ingredients: [
      { name: 'Bezlepkové müsli', category: 'Potraviny' },
      { name: 'Mandlové mléko', category: 'Potraviny' },
    ],
  },
  {
    id: 'l1',
    name: 'Kuřecí stir-fry s rýží',
    mealType: 'Oběd',
    price: 89,
    allergens: [],
    ingredients: [
      { name: 'Kuřecí prsa', category: 'Potraviny' },
      { name: 'Rýže', category: 'Potraviny' },
      { name: 'Paprika', category: 'Potraviny' },
    ],
  },
  {
    id: 'l2',
    name: 'Těstoviny s rajčatovou omáčkou',
    mealType: 'Oběd',
    price: 62,
    allergens: ['lepek'],
    ingredients: [
      { name: 'Těstoviny', category: 'Potraviny' },
      { name: 'Rajčata', category: 'Potraviny' },
      { name: 'Parmazán', category: 'Potraviny' },
    ],
  },
  {
    id: 'l3',
    name: 'Čočkové kari se zeleninou',
    mealType: 'Oběd',
    price: 58,
    allergens: [],
    ingredients: [
      { name: 'Čočka', category: 'Potraviny' },
      { name: 'Kokosové mléko', category: 'Potraviny' },
      { name: 'Mrkev', category: 'Potraviny' },
    ],
  },
  {
    id: 'l4',
    name: 'Grilovaný losos s bramborami',
    mealType: 'Oběd',
    price: 129,
    allergens: [],
    ingredients: [
      { name: 'Losos', category: 'Potraviny' },
      { name: 'Brambory', category: 'Potraviny' },
      { name: 'Citron', category: 'Potraviny' },
    ],
  },
  {
    id: 'd1',
    name: 'Zeleninová polévka',
    mealType: 'Večeře',
    price: 42,
    allergens: [],
    ingredients: [
      { name: 'Mrkev', category: 'Potraviny' },
      { name: 'Brambory', category: 'Potraviny' },
      { name: 'Celer', category: 'Potraviny' },
    ],
  },
  {
    id: 'd2',
    name: 'Bramborový salát se šunkou',
    mealType: 'Večeře',
    price: 54,
    allergens: [],
    ingredients: [
      { name: 'Brambory', category: 'Potraviny' },
      { name: 'Šunka', category: 'Potraviny' },
      { name: 'Majonéza', category: 'Potraviny' },
    ],
  },
  {
    id: 'd3',
    name: 'Zapékané těstoviny se sýrem',
    mealType: 'Večeře',
    price: 68,
    allergens: ['lepek', 'laktóza'],
    ingredients: [
      { name: 'Těstoviny', category: 'Potraviny' },
      { name: 'Eidam', category: 'Potraviny' },
      { name: 'Smetana', category: 'Potraviny' },
    ],
  },
  {
    id: 'd4',
    name: 'Pečená zelenina s cizrnou',
    mealType: 'Večeře',
    price: 49,
    allergens: [],
    ingredients: [
      { name: 'Cizrna', category: 'Potraviny' },
      { name: 'Cuketa', category: 'Potraviny' },
      { name: 'Paprika', category: 'Potraviny' },
    ],
  },
  {
    id: 's1',
    name: 'Ovoce a oříšky',
    mealType: 'Svačina',
    price: 22,
    allergens: ['ořechy'],
    ingredients: [
      { name: 'Jablka', category: 'Potraviny' },
      { name: 'Mandle', category: 'Potraviny' },
    ],
  },
  {
    id: 's2',
    name: 'Celozrnná tyčinka',
    mealType: 'Svačina',
    price: 18,
    allergens: ['lepek'],
    ingredients: [{ name: 'Celozrnná tyčinka', category: 'Potraviny' }],
  },
  {
    id: 's3',
    name: 'Zeleninové tyčinky s humusem',
    mealType: 'Svačina',
    price: 26,
    allergens: [],
    ingredients: [
      { name: 'Mrkev', category: 'Potraviny' },
      { name: 'Humus', category: 'Potraviny' },
    ],
  },
]

function recipesFor(mealType: MealType, excludedAllergens: Set<string>) {
  const pool = RECIPES.filter((recipe) => recipe.mealType === mealType && !recipe.allergens.some((allergen) => excludedAllergens.has(allergen)))
  return pool.length > 0 ? pool : RECIPES.filter((recipe) => recipe.mealType === mealType)
}

/** Whether the household currently has this ingredient in stock (spíž/lednice/mrazák/domácnost,
 *  wherever it's tracked) — case/whitespace-insensitive exact match, same no-fuzzy-matching
 *  philosophy as `lib/products.ts`'s `matchProductByName`. A pantry row present with quantity 0
 *  doesn't count as "have it". */
export function matchIngredientToStock(ingredient: Ingredient, pantryItems: PantryItem[]): PantryItem | undefined {
  const normalized = ingredient.name.trim().toLowerCase()
  return pantryItems.find((item) => item.quantity > 0 && item.name.trim().toLowerCase() === normalized)
}

function stockCoverageScore(recipe: Recipe, pantryItems: PantryItem[]): number {
  return recipe.ingredients.filter((ingredient) => matchIngredientToStock(ingredient, pantryItems) != null).length
}

/** Picks a recipe from `pool` for a given day-index slot. With no pantry stock supplied, this is
 *  the original deterministic rotation (`index % pool.length`). With stock supplied, prefers
 *  whichever recipe in the pool uses the most ingredients the household already has — "use up what
 *  you have" — falling back to the plain rotation when nothing in the pool matches any stock at
 *  all (rather than picking pool[0] every time, which would make every stock-less slot identical). */
function pickRecipe(pool: Recipe[], index: number, pantryItems: PantryItem[] | null): Recipe {
  if (!pantryItems || pantryItems.length === 0) return pool[index % pool.length]
  let best = pool[0]
  let bestScore = stockCoverageScore(best, pantryItems)
  for (const recipe of pool) {
    const score = stockCoverageScore(recipe, pantryItems)
    if (score > bestScore) {
      best = recipe
      bestScore = score
    }
  }
  return bestScore > 0 ? best : pool[index % pool.length]
}

/** Generates the week's plan. When `pantryItems` is provided (the household opted in to "vytvořit
 *  z zásob"), each slot prefers the recipe in its pool that uses the most currently-in-stock
 *  ingredients, so the plan leans on what's already at home; `splitIngredientsByStock()` below is
 *  what then decides which remaining ingredients actually need buying. Omitting `pantryItems`
 *  (or passing null) reproduces the original stock-agnostic rotation exactly. */
export function generateWeeklyPlan(budgetLimit: number, household: Household, pantryItems: PantryItem[] | null = null): WeeklyMealPlan {
  const excludedAllergens = new Set(
    household.members.flatMap((member) => member.allergies.map((allergy) => allergy.toLowerCase())),
  )

  const days: DayPlan[] = DAYS.map((day, index) => {
    const breakfastPool = recipesFor('Snídaně', excludedAllergens)
    const lunchPool = recipesFor('Oběd', excludedAllergens)
    const dinnerPool = recipesFor('Večeře', excludedAllergens)
    const snackPool = recipesFor('Svačina', excludedAllergens)
    return {
      day,
      breakfast: pickRecipe(breakfastPool, index, pantryItems),
      lunch: pickRecipe(lunchPool, index, pantryItems),
      dinner: pickRecipe(dinnerPool, index, pantryItems),
      snack: pickRecipe(snackPool, index, pantryItems),
    }
  })

  const mealsTotal = days.reduce((sum, day) => sum + day.breakfast.price + day.lunch.price + day.dinner.price + day.snack.price, 0)
  const staplesTotal = STAPLES.length * 60
  const estimatedTotal = mealsTotal + staplesTotal

  const recommendedStores =
    budgetLimit > 0 && estimatedTotal > budgetLimit
      ? ['Lidl', 'Penny']
      : household.preferences.preferredStores.length > 0
        ? household.preferences.preferredStores
        : ['Lidl', 'Albert']

  return { days, staples: STAPLES, estimatedTotal, recommendedStores, cookedMeals: [] }
}

const MEAL_SLOT: Record<MealType, 'breakfast' | 'lunch' | 'dinner' | 'snack'> = {
  Snídaně: 'breakfast',
  Oběd: 'lunch',
  Večeře: 'dinner',
  Svačina: 'snack',
}

/** Replaces just one day's one meal slot with a different recipe — "generování nového návrhu pro
 *  každé jídlo" when the household isn't happy with a specific suggestion, without discarding the
 *  rest of the week's plan. Always excludes the currently-assigned recipe so a click reliably
 *  produces something different; once every option in the pool has been shown (repeated clicks),
 *  it cycles back rather than getting stuck with nothing to offer. Deterministic given the same
 *  plan/pantry state — no randomness — so it stays testable. */
export function regenerateMeal(
  plan: WeeklyMealPlan,
  day: string,
  mealType: MealType,
  household: Household,
  pantryItems: PantryItem[] | null = null,
): WeeklyMealPlan {
  const dayIndex = plan.days.findIndex((d) => d.day === day)
  if (dayIndex === -1) return plan

  const excludedAllergens = new Set(household.members.flatMap((member) => member.allergies.map((allergy) => allergy.toLowerCase())))
  const slot = MEAL_SLOT[mealType]
  const currentRecipe = plan.days[dayIndex][slot]

  const fullPool = recipesFor(mealType, excludedAllergens)
  const remaining = fullPool.filter((recipe) => recipe.id !== currentRecipe.id)
  const pool = remaining.length > 0 ? remaining : fullPool
  const nextRecipe = pickRecipe(pool, dayIndex, pantryItems)

  const newDays = plan.days.map((dayPlan, index) => (index === dayIndex ? { ...dayPlan, [slot]: nextRecipe } : dayPlan))
  const mealsTotal = newDays.reduce((sum, dayPlan) => sum + dayPlan.breakfast.price + dayPlan.lunch.price + dayPlan.dinner.price + dayPlan.snack.price, 0)
  const staplesTotal = plan.staples.length * 60

  return { ...plan, days: newDays, estimatedTotal: mealsTotal + staplesTotal }
}

export function recipeFor(plan: WeeklyMealPlan, day: string, mealType: MealType): Recipe | undefined {
  return plan.days.find((dayPlan) => dayPlan.day === day)?.[MEAL_SLOT[mealType]]
}

export function mealKey(day: string, mealType: MealType): string {
  return `${day}__${mealType}`
}

export function isMealCooked(plan: WeeklyMealPlan, day: string, mealType: MealType): boolean {
  return plan.cookedMeals.includes(mealKey(day, mealType))
}

/** Marks a meal as actually cooked — idempotent, so calling it again for an already-cooked meal is
 *  a no-op rather than double-recording it. Pure/local-only: the actual pantry deduction happens
 *  server-side in `markMealCookedAction` (app/actions/meal-plan.ts), which uses this to update the
 *  persisted plan after deducting. */
export function markMealCooked(plan: WeeklyMealPlan, day: string, mealType: MealType): WeeklyMealPlan {
  if (isMealCooked(plan, day, mealType)) return plan
  return { ...plan, cookedMeals: [...plan.cookedMeals, mealKey(day, mealType)] }
}

/** Splits a plan's full ingredient list into what the household already has (won't be added to
 *  the shopping list) and what still needs buying — "aplikace využije co nejvíce surovin ze zásob
 *  a zbytek si přidá do nákupního seznamu". */
export function splitIngredientsByStock(plan: WeeklyMealPlan, pantryItems: PantryItem[]): { fromStock: Ingredient[]; toBuy: Ingredient[] } {
  const fromStock: Ingredient[] = []
  const toBuy: Ingredient[] = []
  for (const ingredient of planIngredients(plan)) {
    if (matchIngredientToStock(ingredient, pantryItems)) fromStock.push(ingredient)
    else toBuy.push(ingredient)
  }
  return { fromStock, toBuy }
}

/** Monday of the week containing `today` (YYYY-MM-DD), so repeated generation within one week overwrites the same saved plan.
 *  Pure UTC calendar math (Date.UTC + getUTCDay/setUTCDate) — deliberately avoids local-timezone-dependent Date methods
 *  mixed with the UTC-based toISOString(), which would otherwise shift the result by a day depending on server timezone. */
export function currentWeekStart(today: string): string {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday
  date.setUTCDate(date.getUTCDate() + diffToMonday)
  return date.toISOString().slice(0, 10)
}

export function planIngredients(plan: WeeklyMealPlan): Ingredient[] {
  const unique = new Map<string, Ingredient>()
  for (const day of plan.days) {
    for (const recipe of [day.breakfast, day.lunch, day.dinner, day.snack]) {
      for (const ingredient of recipe.ingredients) unique.set(ingredient.name, ingredient)
    }
  }
  for (const staple of plan.staples) unique.set(staple.name, staple)
  return Array.from(unique.values())
}
