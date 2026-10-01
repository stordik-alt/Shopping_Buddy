import { convertQuantity } from '@/lib/meal-plans'
import { matchKey } from '@/lib/receipt-list-match'
import type { RecipeIngredient } from '@/lib/recipes/types'
import type { ItemUnit, PantryItem } from '@/lib/types'

export type RecipeShoppingItem = {
  name: string
  quantity: number
  unit: ItemUnit
  /** Original recipe measure when the cooking unit cannot be represented as a store quantity. */
  sourceMeasure?: string
}

export type RecipeShoppingAnalysis = {
  ingredient: RecipeIngredient
  quantity: number | null
  unit: ItemUnit | null
  stockQuantity: number
  missingQuantity: number | null
  /** Original recipe measure for a culinary unit represented as one shopping item. */
  sourceMeasure?: string
  problem: string | null
}

const UNIT_ALIASES: Record<string, { unit: ItemUnit; multiplier: number }> = {
  ks: { unit: 'ks', multiplier: 1 },
  kus: { unit: 'ks', multiplier: 1 },
  kusy: { unit: 'ks', multiplier: 1 },
  kusu: { unit: 'ks', multiplier: 1 },
  kousek: { unit: 'ks', multiplier: 1 },
  kousky: { unit: 'ks', multiplier: 1 },
  g: { unit: 'g', multiplier: 1 },
  gram: { unit: 'g', multiplier: 1 },
  gramy: { unit: 'g', multiplier: 1 },
  dkg: { unit: 'g', multiplier: 10 },
  dag: { unit: 'g', multiplier: 10 },
  kg: { unit: 'kg', multiplier: 1 },
  l: { unit: 'l', multiplier: 1 },
  litr: { unit: 'l', multiplier: 1 },
  litry: { unit: 'l', multiplier: 1 },
  ml: { unit: 'ml', multiplier: 1 },
  millilitr: { unit: 'ml', multiplier: 1 },
  millilitry: { unit: 'ml', multiplier: 1 },
  cl: { unit: 'l', multiplier: 0.01 },
  dl: { unit: 'l', multiplier: 0.1 },
}

function normalizeUnit(unit: string): string {
  return unit.trim().toLocaleLowerCase('cs-CZ').replace(/\./g, '').replace(/\s+/g, '')
}

const SHOPPING_PLACEHOLDER_UNITS = new Set([
  'špetka',
  'hrst',
  'stroužek',
  'plátek',
  'snítka',
  'svazek',
  'řapík',
  'kopeček',
  'lžíce',
  'lžička',
  'hrnek',
  'šálek',
])

const SHOPPING_UNIT_ALIASES: Record<string, string> = {
  kus: 'ks',
  kusu: 'ks',
  kusy: 'ks',
  kousek: 'ks',
  kousky: 'ks',
  'lž': 'lžíce',
  plž: 'lžíce',
  člž: 'lžička',
  'lžič': 'lžička',
  'špet': 'špetka',
  'hrs': 'hrst',
  'strouž': 'stroužek',
  'plát': 'plátek',
  'snít': 'snítka',
  'svaz': 'svazek',
  'řap': 'řapík',
  'kop': 'kopeček',
}

function canonicalRecipeUnit(unit: string): string {
  const normalized = normalizeUnit(unit)
  return SHOPPING_UNIT_ALIASES[normalized] ?? normalized
}

export function mapRecipeUnit(unit: string | undefined): { unit: ItemUnit; multiplier: number } | null {
  if (!unit) return null
  return UNIT_ALIASES[normalizeUnit(unit)] ?? null
}

export function toRecipeShoppingItem(ingredient: RecipeIngredient, quantity = ingredient.quantity): RecipeShoppingItem | null {
  const recipeUnit = ingredient.unit ? canonicalRecipeUnit(ingredient.unit) : null
  const mapped = mapRecipeUnit(ingredient.unit)

  // Some recipes intentionally omit a measurable amount (for example "sůl podle chuti"
  // or "pepř dle potřeby"). The missing amount must not make the ingredient impossible
  // to add to the shopping list. Treat it as one product placeholder and preserve the
  // fact that the recipe did not specify a quantity.
  if (quantity === undefined && ingredient.name.trim()) {
    return {
      name: ingredient.name,
      quantity: 1,
      unit: 'ks',
      sourceMeasure: 'množství neuvedeno',
    }
  }

  // Cooking measures such as "špetka", "lžička" or "stroužek" are valid recipe data,
  // but they are not reliable store units. Keep the recipe measure as a note and add one
  // shopping-list item in ks instead of blocking the ingredient entirely. The package/count
  // decision remains with the user because it depends on the product being bought.
  if (recipeUnit && SHOPPING_PLACEHOLDER_UNITS.has(recipeUnit)) {
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) return null
    return {
      name: ingredient.name,
      quantity: 1,
      unit: 'ks',
      sourceMeasure: quantity !== undefined ? `${quantity} ${recipeUnit}` : recipeUnit,
    }
  }

  if (quantity === undefined || !Number.isFinite(quantity) || quantity <= 0 || !mapped) return null
  const normalizedQuantity = quantity * mapped.multiplier
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) return null
  return { name: ingredient.name, quantity: normalizedQuantity, unit: mapped.unit }
}

export function pantryStockQuantity(pantryItems: PantryItem[], ingredient: RecipeShoppingItem): number {
  const key = matchKey(ingredient.name)
  if (!key) return 0

  return pantryItems.reduce((total, item) => {
    if (item.tracking === 'off' || item.quantity <= 0 || matchKey(item.name) !== key) return total
    const converted = convertQuantity(item.quantity, item.unit, ingredient.unit)
    return converted == null ? total : total + converted
  }, 0)
}

export function analyzeRecipeIngredient(ingredient: RecipeIngredient, pantryItems: PantryItem[], quantity = ingredient.quantity): RecipeShoppingAnalysis {
  const shoppingItem = toRecipeShoppingItem(ingredient, quantity)

  if (!shoppingItem) {
    const reason = ingredient.quantity === undefined
      ? 'Množství nelze bezpečně určit.'
      : !mapRecipeUnit(ingredient.unit)
        ? 'Jednotku nelze bezpečně převést do nákupního seznamu.'
        : 'Množství není platné.'
    return { ingredient, quantity: null, unit: null, stockQuantity: 0, missingQuantity: null, problem: reason }
  }

  // A culinary measure is deliberately treated as one "buy this product" placeholder.
  // Without package-size data we must not claim that an existing pantry quantity satisfies it.
  const stockQuantity = shoppingItem.sourceMeasure ? 0 : pantryStockQuantity(pantryItems, shoppingItem)
  const missingQuantity = shoppingItem.sourceMeasure ? 1 : Math.max(0, shoppingItem.quantity - stockQuantity)

  return {
    ingredient,
    quantity: shoppingItem.quantity,
    unit: shoppingItem.unit,
    stockQuantity,
    missingQuantity,
    sourceMeasure: shoppingItem.sourceMeasure,
    problem: null,
  }
}

export function analyzeRecipeIngredients(ingredients: RecipeIngredient[], pantryItems: PantryItem[]): RecipeShoppingAnalysis[] {
  return ingredients.map((ingredient) => analyzeRecipeIngredient(ingredient, pantryItems))
}
