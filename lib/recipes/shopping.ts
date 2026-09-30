import { convertQuantity } from '@/lib/meal-plans'
import { matchKey } from '@/lib/receipt-list-match'
import type { RecipeIngredient } from '@/lib/recipes/types'
import type { ItemUnit, PantryItem } from '@/lib/types'

export type RecipeShoppingItem = {
  name: string
  quantity: number
  unit: ItemUnit
}

export type RecipeShoppingAnalysis = {
  ingredient: RecipeIngredient
  quantity: number | null
  unit: ItemUnit | null
  stockQuantity: number
  missingQuantity: number | null
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
  return unit.trim().toLocaleLowerCase('cs-CZ').replace(/\\./g, '').replace(/\\s+/g, '')
}

export function mapRecipeUnit(unit: string | undefined): { unit: ItemUnit; multiplier: number } | null {
  if (!unit) return null
  return UNIT_ALIASES[normalizeUnit(unit)] ?? null
}

export function toRecipeShoppingItem(ingredient: RecipeIngredient, quantity = ingredient.quantity): RecipeShoppingItem | null {
  const mapped = mapRecipeUnit(ingredient.unit)
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

  const stockQuantity = pantryStockQuantity(pantryItems, shoppingItem)
  const missingQuantity = Math.max(0, shoppingItem.quantity - stockQuantity)

  return {
    ingredient,
    quantity: shoppingItem.quantity,
    unit: shoppingItem.unit,
    stockQuantity,
    missingQuantity,
    problem: null,
  }
}

export function analyzeRecipeIngredients(ingredients: RecipeIngredient[], pantryItems: PantryItem[]): RecipeShoppingAnalysis[] {
  return ingredients.map((ingredient) => analyzeRecipeIngredient(ingredient, pantryItems))
}
