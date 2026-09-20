import type { Household, ItemCategory } from '@/lib/types'

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

export function generateWeeklyPlan(budgetLimit: number, household: Household): WeeklyMealPlan {
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
      breakfast: breakfastPool[index % breakfastPool.length],
      lunch: lunchPool[index % lunchPool.length],
      dinner: dinnerPool[index % dinnerPool.length],
      snack: snackPool[index % snackPool.length],
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

  return { days, staples: STAPLES, estimatedTotal, recommendedStores }
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
