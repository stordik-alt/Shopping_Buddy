import { stockQuantityIn } from '@/lib/meal-plans'
import { resolveListItemTypes, stockTypeCanSatisfyRequestedType } from '@/lib/product-types'
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
  /** A culinary-measure ingredient the household has in stock (amount not comparable, so not missing). */
  stockUnmeasured?: boolean
  /** The household has this in stock, but in a unit that cannot be compared with the recipe's. */
  stockUnitMismatch?: boolean
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

  // Explicit but invalid quantities must always be rejected before applying any
  // unknown-unit fallback. Otherwise e.g. "0 balení" would be reported as an
  // unsupported unit instead of an invalid quantity.
  if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
    return null
  }

  // A recipe can contain a quantity with a unit that is not a standard store unit
  // (for example "2 balení" or a source-specific unit). Do not block shopping merely
  // because the unit cannot be converted reliably. Keep the original measure as a note
  // and add one product placeholder instead of inventing a conversion.
  if (quantity !== undefined && Number.isFinite(quantity) && quantity > 0 && ingredient.name.trim() && !mapped) {
    return {
      name: ingredient.name,
      quantity: 1,
      unit: 'ks',
      sourceMeasure: ingredient.unit ? `${quantity} ${ingredient.unit}` : `${quantity}`,
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

/** Stock rows that are the same product as the recipe ingredient. Matches by synonym-folded name
 *  and, like the meal plan (`matchIngredientToStock`), by product type — stock is saved under its
 *  type ("Kuře"), which a recipe's wording ("kuřecí maso") resolves to as well. */
function matchingStockRows(pantryItems: PantryItem[], ingredientName: string): PantryItem[] {
  const key = matchKey(ingredientName)
  if (!key) return []
  const requestedType = resolveListItemTypes(ingredientName)

  return pantryItems.filter((item) => {
    if (item.tracking === 'off' || item.quantity <= 0) return false
    if (matchKey(item.name) === key) return true
    return Boolean(
      requestedType &&
        item.productTypeKey &&
        requestedType.types.some((type) => stockTypeCanSatisfyRequestedType(item.productTypeKey as string, type)),
    )
  })
}

export function pantryStockQuantity(pantryItems: PantryItem[], ingredient: RecipeShoppingItem): number {
  return matchingStockRows(pantryItems, ingredient.name).reduce((total, item) => {
    // stockQuantityIn also reads a pack row (3 ks × 250 g) in the recipe's weight/volume unit.
    const converted = stockQuantityIn(item, ingredient.unit)
    return converted == null ? total : total + converted
  }, 0)
}

/** Whether the household has the ingredient at all, whatever its unit — used where the recipe
 *  gives no measurable amount (a pinch of salt) or one that cannot be compared with the stock row. */
export function hasPantryStock(pantryItems: PantryItem[], ingredientName: string): boolean {
  return matchingStockRows(pantryItems, ingredientName).length > 0
}

export function analyzeRecipeIngredient(ingredient: RecipeIngredient, pantryItems: PantryItem[], quantity = ingredient.quantity): RecipeShoppingAnalysis {
  const shoppingItem = toRecipeShoppingItem(ingredient, quantity)

  if (!shoppingItem) {
    const reason = ingredient.quantity === undefined
      ? 'Množství nelze bezpečně určit.'
      : !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0
        ? 'Množství není platné.'
        : !mapRecipeUnit(ingredient.unit)
          ? 'Jednotku nelze bezpečně převést do nákupního seznamu.'
          : 'Množství není platné.'
    return { ingredient, quantity: null, unit: null, stockQuantity: 0, missingQuantity: null, problem: reason }
  }

  // A culinary measure ("špetka soli", "podle chuti") has no amount that could be compared with a
  // stock row, so the ingredient counts as covered whenever the household has it at all — a
  // pinch of salt never justifies a trip to the shop for someone with a salt shaker at home.
  if (shoppingItem.sourceMeasure) {
    const covered = hasPantryStock(pantryItems, shoppingItem.name)
    return {
      ingredient,
      quantity: shoppingItem.quantity,
      unit: shoppingItem.unit,
      stockQuantity: covered ? shoppingItem.quantity : 0,
      missingQuantity: covered ? 0 : 1,
      sourceMeasure: shoppingItem.sourceMeasure,
      stockUnmeasured: covered,
      problem: null,
    }
  }

  const stockQuantity = pantryStockQuantity(pantryItems, shoppingItem)
  const missingQuantity = Math.max(0, shoppingItem.quantity - stockQuantity)
  // In stock but in a unit that cannot be compared (1 ks of chicken vs 500 g): we cannot say it is
  // enough, so it stays on the shopping side, but the UI tells the user they have some.
  const stockUnitMismatch = stockQuantity === 0 && hasPantryStock(pantryItems, shoppingItem.name)

  return {
    ingredient,
    quantity: shoppingItem.quantity,
    unit: shoppingItem.unit,
    stockQuantity,
    missingQuantity,
    stockUnitMismatch,
    problem: null,
  }
}

export function analyzeRecipeIngredients(ingredients: RecipeIngredient[], pantryItems: PantryItem[]): RecipeShoppingAnalysis[] {
  return ingredients.map((ingredient) => analyzeRecipeIngredient(ingredient, pantryItems))
}
