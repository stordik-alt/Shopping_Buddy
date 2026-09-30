import { dealEffectiveUnitPrice, effectivePrice, type PricePoint, type ProductPrice } from '@/lib/prices'
import { toComparableUnit } from '@/lib/product-search'
import type { StandaloneOffer } from '@/lib/offers'
import type { RecipeIngredient } from '@/lib/recipes/types'

export type RecipeIngredientPrice = {
  ingredientId: string
  ingredientName: string
  productName: string
  quantity: number
  unit: RecipeIngredient['unit']
  cost: number
  store: string
  isDeal: boolean
  dealPrice?: number
  dealValidUntil?: string
  sourceType?: PricePoint['sourceType']
}

export type RecipeStorePrice = {
  store: string
  total: number
  pricedIngredients: number
  dealIngredients: number
}

export type RecipePriceEstimate = {
  ingredientCount: number
  pricedIngredientCount: number
  unpricedIngredients: string[]
  estimatedTotal: number | null
  complete: boolean
  cheapestCompleteStore: RecipeStorePrice | null
  completeStoreEstimates: RecipeStorePrice[]
  ingredientPrices: RecipeIngredientPrice[]
  activeDeals: Array<{
    ingredientName: string
    store: string
    price: number
    estimatedCost: number
    validUntil: string
  }>
}

type Candidate = RecipeIngredientPrice

function recipeUnitCost(quantity: number, unit: RecipeIngredient['unit'], price: PricePoint): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !unit) return null

  if (unit === 'ks') {
    if (price.unit !== 'ks') return null
    return effectivePrice(price) * quantity
  }

  if (unit !== 'kg' && unit !== 'g' && unit !== 'l' && unit !== 'ml') return null
  if (price.unit === 'ks') return null

  const comparable = toComparableUnit(price.unit, dealEffectiveUnitPrice(price))
  if (unit === comparable.unit) return Math.round(comparable.unitPrice * quantity * 100) / 100

  if (unit === 'g' && comparable.unit === 'kg') return Math.round((comparable.unitPrice * quantity) / 1000 * 100) / 100
  if (unit === 'kg' && comparable.unit === 'g') return Math.round(comparable.unitPrice * quantity * 1000 * 100) / 100
  if (unit === 'ml' && comparable.unit === 'l') return Math.round((comparable.unitPrice * quantity) / 1000 * 100) / 100
  if (unit === 'l' && comparable.unit === 'ml') return Math.round(comparable.unitPrice * quantity * 1000 * 100) / 100

  return null
}

function standaloneUnitCost(quantity: number, unit: RecipeIngredient['unit'], offer: StandaloneOffer): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !unit || !offer.unit || offer.unitPrice == null) return null

  if (unit === 'ks') return offer.unit === 'ks' ? Math.round(offer.unitPrice * quantity * 100) / 100 : null
  if (unit !== 'kg' && unit !== 'g' && unit !== 'l' && unit !== 'ml') return null
  if (offer.unit === 'ks') return null

  const comparable = toComparableUnit(offer.unit, offer.unitPrice)
  if (unit === comparable.unit) return Math.round(comparable.unitPrice * quantity * 100) / 100
  if (unit === 'g' && comparable.unit === 'kg') return Math.round((comparable.unitPrice * quantity) / 1000 * 100) / 100
  if (unit === 'kg' && comparable.unit === 'g') return Math.round(comparable.unitPrice * quantity * 1000 * 100) / 100
  if (unit === 'ml' && comparable.unit === 'l') return Math.round((comparable.unitPrice * quantity) / 1000 * 100) / 100
  if (unit === 'l' && comparable.unit === 'ml') return Math.round(comparable.unitPrice * quantity * 1000 * 100) / 100

  return null
}

function candidateFromStandaloneOffer(ingredient: RecipeIngredient, offer: StandaloneOffer): Candidate | null {
  const cost = standaloneUnitCost(ingredient.quantity ?? 0, ingredient.unit, offer)
  if (cost == null) return null
  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    productName: offer.productName,
    quantity: ingredient.quantity ?? 0,
    unit: ingredient.unit,
    cost,
    store: offer.store,
    isDeal: true,
    dealPrice: offer.dealPrice,
    dealValidUntil: offer.validUntil,
    sourceType: 'OTHER',
  }
}

function candidatesForProduct(
  ingredient: RecipeIngredient,
  product: ProductPrice,
  standaloneOffers: StandaloneOffer[],
): Candidate[] {
  if (ingredient.quantity == null) return []
  const candidates: Candidate[] = []

  for (const price of product.prices) {
    const cost = recipeUnitCost(ingredient.quantity, ingredient.unit, price)
    if (cost == null) continue
    candidates.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      productName: product.productName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      cost,
      store: price.store,
      isDeal: price.dealPrice != null,
      dealPrice: price.dealPrice,
      dealValidUntil: price.dealValidUntil,
      sourceType: price.sourceType,
    })
  }

  for (const offer of standaloneOffers) {
    if (offer.productName.trim().toLocaleLowerCase('cs-CZ') !== product.productName.trim().toLocaleLowerCase('cs-CZ')) continue
    const cost = standaloneUnitCost(ingredient.quantity, ingredient.unit, offer)
    if (cost == null) continue
    candidates.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      productName: offer.productName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      cost,
      store: offer.store,
      isDeal: true,
      dealValidUntil: offer.validUntil,
      sourceType: 'OTHER',
    })
  }

  return candidates.sort((a, b) => a.cost - b.cost || a.store.localeCompare(b.store, 'cs'))
}

export function estimateRecipePrice(
  ingredients: RecipeIngredient[],
  matchedProducts: ProductPrice[],
  standaloneOffers: StandaloneOffer[] = [],
): RecipePriceEstimate {
  const productByName = new Map(matchedProducts.map((product) => [product.productName.trim().toLocaleLowerCase('cs-CZ'), product]))
  const allIngredientCandidates = ingredients.map((ingredient) => {
    const product = productByName.get(ingredient.name.trim().toLocaleLowerCase('cs-CZ'))
    if (product) return candidatesForProduct(ingredient, product, standaloneOffers)
    return standaloneOffers
      .filter((offer) => offer.productName.trim().toLocaleLowerCase('cs-CZ') === ingredient.name.trim().toLocaleLowerCase('cs-CZ'))
      .map((offer) => candidateFromStandaloneOffer(ingredient, offer))
      .filter((candidate): candidate is Candidate => candidate != null)
      .sort((a, b) => a.cost - b.cost || a.store.localeCompare(b.store, 'cs'))
  })
  const ingredientCandidates = allIngredientCandidates.map((candidates) => candidates[0] ?? null)

  const ingredientPrices = ingredientCandidates.filter((candidate): candidate is Candidate => candidate != null)
  const unpricedIngredients = ingredients
    .filter((_, index) => ingredientCandidates[index] == null)
    .map((ingredient) => ingredient.name)

  const estimatedTotal = ingredientPrices.length > 0
    ? Math.round(ingredientPrices.reduce((sum, candidate) => sum + candidate.cost, 0) * 100) / 100
    : null

  const stores = [...new Set(allIngredientCandidates.flatMap((candidates) => candidates.map((candidate) => candidate.store)))]
  const completeStoreEstimates = stores
    .map((store) => {
      const candidates = allIngredientCandidates.map((candidates) => candidates.find((candidate) => candidate.store === store) ?? null)
        .filter((candidate): candidate is Candidate => candidate != null)

      if (candidates.length !== ingredients.length || ingredients.length === 0) return null
      return {
        store,
        total: Math.round(candidates.reduce((sum, candidate) => sum + candidate.cost, 0) * 100) / 100,
        pricedIngredients: candidates.length,
        dealIngredients: candidates.filter((candidate) => candidate.isDeal).length,
      }
    })
    .filter((value): value is RecipeStorePrice => value != null)
    .sort((a, b) => a.total - b.total || a.store.localeCompare(b.store, 'cs'))

  const activeDeals = ingredientPrices
    .filter((candidate) => candidate.isDeal && candidate.dealValidUntil && candidate.dealPrice != null)
    .map((candidate) => ({
      ingredientName: candidate.ingredientName,
      store: candidate.store,
      price: candidate.dealPrice as number,
      estimatedCost: candidate.cost,
      validUntil: candidate.dealValidUntil as string,
    }))
    .sort((a, b) => a.price - b.price || a.store.localeCompare(b.store, 'cs'))

  return {
    ingredientCount: ingredients.length,
    pricedIngredientCount: ingredientPrices.length,
    unpricedIngredients,
    estimatedTotal,
    complete: ingredients.length > 0 && ingredientPrices.length === ingredients.length,
    cheapestCompleteStore: completeStoreEstimates[0] ?? null,
    completeStoreEstimates,
    ingredientPrices,
    activeDeals,
  }
}
