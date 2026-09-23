import type { Household, ItemCategory, ItemUnit, PantryItem } from '@/lib/types'

export type MealType = 'Snídaně' | 'Oběd' | 'Večeře' | 'Svačina'

export type Ingredient = { name: string; category: ItemCategory; quantity: number; unit: ItemUnit }

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
  { name: 'Toaletní papír', category: 'Drogerie', quantity: 1, unit: 'ks' },
  { name: 'Prací prostředek', category: 'Drogerie', quantity: 1, unit: 'ks' },
  { name: 'Houbičky na nádobí', category: 'Domácnost', quantity: 1, unit: 'ks' },
]

const RECIPES: Recipe[] = [
  {
    id: 'b1',
    name: 'Ovesná kaše s banánem',
    mealType: 'Snídaně',
    price: 28,
    allergens: [],
    ingredients: [
      { name: 'Ovesné vločky', category: 'Potraviny', quantity: 50, unit: 'g' },
      { name: 'Mléko polotučné', category: 'Potraviny', quantity: 0.25, unit: 'l' },
      { name: 'Banány', category: 'Potraviny', quantity: 1, unit: 'ks' },
    ],
  },
  {
    id: 'b2',
    name: 'Vejce na měkko s pečivem',
    mealType: 'Snídaně',
    price: 32,
    allergens: ['lepek'],
    ingredients: [
      { name: 'Vejce', category: 'Potraviny', quantity: 2, unit: 'ks' },
      { name: 'Pečivo', category: 'Potraviny', quantity: 2, unit: 'ks' },
      { name: 'Máslo', category: 'Potraviny', quantity: 10, unit: 'g' },
    ],
  },
  {
    id: 'b3',
    name: 'Řecký jogurt s ovocem',
    mealType: 'Snídaně',
    price: 35,
    allergens: ['laktóza'],
    ingredients: [
      { name: 'Řecký jogurt', category: 'Potraviny', quantity: 150, unit: 'g' },
      { name: 'Jablka', category: 'Potraviny', quantity: 1, unit: 'ks' },
      { name: 'Med', category: 'Potraviny', quantity: 10, unit: 'g' },
    ],
  },
  {
    id: 'b4',
    name: 'Bezlepkové müsli s mandlovým mlékem',
    mealType: 'Snídaně',
    price: 39,
    allergens: ['ořechy'],
    ingredients: [
      { name: 'Bezlepkové müsli', category: 'Potraviny', quantity: 50, unit: 'g' },
      { name: 'Mandlové mléko', category: 'Potraviny', quantity: 0.2, unit: 'l' },
    ],
  },
  {
    id: 'l1',
    name: 'Kuřecí stir-fry s rýží',
    mealType: 'Oběd',
    price: 89,
    allergens: [],
    ingredients: [
      { name: 'Kuřecí prsa', category: 'Potraviny', quantity: 0.15, unit: 'kg' },
      { name: 'Rýže', category: 'Potraviny', quantity: 0.08, unit: 'kg' },
      { name: 'Paprika', category: 'Potraviny', quantity: 1, unit: 'ks' },
    ],
  },
  {
    id: 'l2',
    name: 'Těstoviny s rajčatovou omáčkou',
    mealType: 'Oběd',
    price: 62,
    allergens: ['lepek'],
    ingredients: [
      { name: 'Těstoviny', category: 'Potraviny', quantity: 0.1, unit: 'kg' },
      { name: 'Rajčata', category: 'Potraviny', quantity: 0.2, unit: 'kg' },
      { name: 'Parmazán', category: 'Potraviny', quantity: 20, unit: 'g' },
    ],
  },
  {
    id: 'l3',
    name: 'Čočkové kari se zeleninou',
    mealType: 'Oběd',
    price: 58,
    allergens: [],
    ingredients: [
      { name: 'Čočka', category: 'Potraviny', quantity: 0.1, unit: 'kg' },
      { name: 'Kokosové mléko', category: 'Potraviny', quantity: 0.2, unit: 'l' },
      { name: 'Mrkev', category: 'Potraviny', quantity: 0.15, unit: 'kg' },
    ],
  },
  {
    id: 'l4',
    name: 'Grilovaný losos s bramborami',
    mealType: 'Oběd',
    price: 129,
    allergens: [],
    ingredients: [
      { name: 'Losos', category: 'Potraviny', quantity: 0.15, unit: 'kg' },
      { name: 'Brambory', category: 'Potraviny', quantity: 0.3, unit: 'kg' },
      { name: 'Citron', category: 'Potraviny', quantity: 1, unit: 'ks' },
    ],
  },
  {
    id: 'd1',
    name: 'Zeleninová polévka',
    mealType: 'Večeře',
    price: 42,
    allergens: [],
    ingredients: [
      { name: 'Mrkev', category: 'Potraviny', quantity: 0.15, unit: 'kg' },
      { name: 'Brambory', category: 'Potraviny', quantity: 0.2, unit: 'kg' },
      { name: 'Celer', category: 'Potraviny', quantity: 0.1, unit: 'kg' },
    ],
  },
  {
    id: 'd2',
    name: 'Bramborový salát se šunkou',
    mealType: 'Večeře',
    price: 54,
    allergens: [],
    ingredients: [
      { name: 'Brambory', category: 'Potraviny', quantity: 0.3, unit: 'kg' },
      { name: 'Šunka', category: 'Potraviny', quantity: 0.1, unit: 'kg' },
      { name: 'Majonéza', category: 'Potraviny', quantity: 0.05, unit: 'kg' },
    ],
  },
  {
    id: 'd3',
    name: 'Zapékané těstoviny se sýrem',
    mealType: 'Večeře',
    price: 68,
    allergens: ['lepek', 'laktóza'],
    ingredients: [
      { name: 'Těstoviny', category: 'Potraviny', quantity: 0.1, unit: 'kg' },
      { name: 'Eidam', category: 'Potraviny', quantity: 0.1, unit: 'kg' },
      { name: 'Smetana', category: 'Potraviny', quantity: 0.2, unit: 'l' },
    ],
  },
  {
    id: 'd4',
    name: 'Pečená zelenina s cizrnou',
    mealType: 'Večeře',
    price: 49,
    allergens: [],
    ingredients: [
      { name: 'Cizrna', category: 'Potraviny', quantity: 0.2, unit: 'kg' },
      { name: 'Cuketa', category: 'Potraviny', quantity: 0.2, unit: 'kg' },
      { name: 'Paprika', category: 'Potraviny', quantity: 1, unit: 'ks' },
    ],
  },
  {
    id: 's1',
    name: 'Ovoce a oříšky',
    mealType: 'Svačina',
    price: 22,
    allergens: ['ořechy'],
    ingredients: [
      { name: 'Jablka', category: 'Potraviny', quantity: 1, unit: 'ks' },
      { name: 'Mandle', category: 'Potraviny', quantity: 0.03, unit: 'kg' },
    ],
  },
  {
    id: 's2',
    name: 'Celozrnná tyčinka',
    mealType: 'Svačina',
    price: 18,
    allergens: ['lepek'],
    ingredients: [{ name: 'Celozrnná tyčinka', category: 'Potraviny', quantity: 1, unit: 'ks' }],
  },
  {
    id: 's3',
    name: 'Zeleninové tyčinky s humusem',
    mealType: 'Svačina',
    price: 26,
    allergens: [],
    ingredients: [
      { name: 'Mrkev', category: 'Potraviny', quantity: 0.1, unit: 'kg' },
      { name: 'Humus', category: 'Potraviny', quantity: 0.05, unit: 'kg' },
    ],
  },
]

function recipesFor(mealType: MealType, excludedAllergens: Set<string>) {
  const pool = RECIPES.filter((recipe) => recipe.mealType === mealType && !recipe.allergens.some((allergen) => excludedAllergens.has(allergen)))
  return pool.length > 0 ? pool : RECIPES.filter((recipe) => recipe.mealType === mealType)
}

type UnitGroup = 'mass' | 'volume' | 'count'
const UNIT_INFO: Record<ItemUnit, { group: UnitGroup; toBase: number }> = {
  kg: { group: 'mass', toBase: 1000 },
  g: { group: 'mass', toBase: 1 },
  l: { group: 'volume', toBase: 1000 },
  ml: { group: 'volume', toBase: 1 },
  ks: { group: 'count', toBase: 1 },
}

/** Converts a quantity between units that measure the same thing — mass (kg<->g) or volume
 *  (l<->ml), e.g. 0.25 l -> 250 ml. Returns `null` for units that can't be meaningfully compared
 *  (e.g. kg vs ks, or anything vs 'ks') rather than guessing at a conversion that doesn't exist —
 *  a recipe needing weight/volume of something the pantry only counts in pieces (or vice versa)
 *  genuinely can't be resolved without knowing that product's real package size, which per
 *  `docs/01_CURRENT_STATE.md`'s "Product normalization" gap isn't modeled yet. */
export function convertQuantity(quantity: number, fromUnit: ItemUnit, toUnit: ItemUnit): number | null {
  const from = UNIT_INFO[fromUnit]
  const to = UNIT_INFO[toUnit]
  // A unit we don't know (or none at all — plans saved before ingredients carried a unit, still
  // stored as JSON in `meal_plans.plan`) is "not comparable", never a crash. Checked before the
  // same-unit shortcut so two missing units don't count as matching.
  if (!from || !to) return null
  if (fromUnit === toUnit) return quantity
  if (from.group !== to.group || from.group === 'count') return null
  return (quantity * from.toBase) / to.toBase
}

/** Whether the household currently has *enough* of this ingredient in stock (spíž/lednice/mrazák/
 *  domácnost, wherever it's tracked) — case/whitespace-insensitive exact name match, same
 *  no-fuzzy-matching philosophy as `lib/products.ts`'s `matchProductByName`, but now genuinely
 *  quantity-aware via `convertQuantity()` rather than just "is there any row at all" — a pantry row
 *  with less than the recipe actually needs (or in a unit that can't be compared) doesn't count. */
export function matchIngredientToStock(ingredient: Ingredient, pantryItems: PantryItem[]): PantryItem | undefined {
  const normalized = ingredient.name.trim().toLowerCase()
  return pantryItems.find((item) => {
    if (item.name.trim().toLowerCase() !== normalized) return false
    const available = convertQuantity(item.quantity, item.unit, ingredient.unit)
    return available != null && available >= ingredient.quantity
  })
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

function isCurrentIngredient(value: unknown): value is Ingredient {
  const ingredient = value as Partial<Ingredient> | null
  return (
    typeof ingredient?.name === 'string' &&
    typeof ingredient.quantity === 'number' &&
    Number.isFinite(ingredient.quantity) &&
    typeof ingredient.unit === 'string' &&
    ingredient.unit in UNIT_INFO
  )
}

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const

/** Reads a plan back from `meal_plans.plan` and brings it up to the current shape, so callers can
 *  rely on the `WeeklyMealPlan` type instead of trusting whatever JSON was stored.
 *
 *  Plans are persisted as JSON, so a household that generated its plan before ingredients carried a
 *  `quantity`/`unit` (or before `cookedMeals` existed) still has the old shape in the database — and
 *  reading it as-is crashed the dashboard in `convertQuantity`. Old ingredients are re-resolved from
 *  the code-based recipe catalog by recipe id (the saved name and price are kept as the household
 *  saw them). Returns `null` when the value is not a plan, or a legacy recipe/staple can no longer
 *  be found in the catalog, so the household simply regenerates instead of seeing invented data.
 *  Invalid JSON still throws — corrupt data must not be silently ignored. */
export function parseSavedPlan(json: string): WeeklyMealPlan | null {
  const saved = JSON.parse(json) as Partial<WeeklyMealPlan> | null
  if (!saved || !Array.isArray(saved.days)) return null

  const days: DayPlan[] = []
  for (const savedDay of saved.days) {
    const day = { ...savedDay } as DayPlan
    for (const slot of MEAL_SLOTS) {
      const recipe = day[slot]
      if (!recipe || !Array.isArray(recipe.ingredients)) return null
      if (recipe.ingredients.every(isCurrentIngredient)) continue
      const catalogRecipe = RECIPES.find((candidate) => candidate.id === recipe.id)
      if (!catalogRecipe) return null
      day[slot] = { ...recipe, ingredients: catalogRecipe.ingredients }
    }
    days.push(day)
  }

  let staples: Ingredient[] = []
  if (Array.isArray(saved.staples)) {
    if (saved.staples.every(isCurrentIngredient)) {
      staples = saved.staples
    } else {
      for (const staple of saved.staples as Ingredient[]) {
        const catalogStaple = STAPLES.find((candidate) => candidate.name === staple?.name)
        if (!catalogStaple) return null
        staples.push(catalogStaple)
      }
    }
  }

  return {
    days,
    staples,
    estimatedTotal: saved.estimatedTotal ?? 0,
    recommendedStores: saved.recommendedStores ?? [],
    cookedMeals: saved.cookedMeals ?? [],
  }
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

/** One entry per distinct ingredient name across the whole week, with quantities *summed* across
 *  every recipe/day that uses it — a recipe repeated on multiple days (common once a meal-type pool
 *  is smaller than 7) needs that many multiples of its ingredients, not just one. Assumes the same
 *  ingredient name is always authored with the same unit across the recipe catalog (true for every
 *  recipe here); a future genuinely inconsistent unit for the same name would just stop summing
 *  correctly for that one ingredient rather than throw, since `Ingredient` doesn't carry enough
 *  information here to safely convert on the fly. Staples aren't repeated per-day, so they're just
 *  added once each, same as before. */
export function planIngredients(plan: WeeklyMealPlan): Ingredient[] {
  const combined = new Map<string, Ingredient>()
  for (const day of plan.days) {
    for (const recipe of [day.breakfast, day.lunch, day.dinner, day.snack]) {
      for (const ingredient of recipe.ingredients) {
        const existing = combined.get(ingredient.name)
        combined.set(ingredient.name, existing ? { ...ingredient, quantity: existing.quantity + ingredient.quantity } : ingredient)
      }
    }
  }
  for (const staple of plan.staples) {
    if (!combined.has(staple.name)) combined.set(staple.name, staple)
  }
  return Array.from(combined.values())
}
