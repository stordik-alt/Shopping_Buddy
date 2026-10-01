import { normalizeSearchText } from '@/lib/product-search'
import type { RecipeIngredient } from '@/lib/recipes/types'

export type RecipeMeasureEstimate = {
  quantity: number
  unit: 'g' | 'ml'
  estimated: boolean
  basis: 'standard-volume' | 'ingredient-mass' | 'ingredient-specific' | 'generic-estimate'
  description: string
}

const UNIT_ALIASES: Record<string, string> = {
  'lž': 'lžíce',
  'plž': 'lžíce',
  'lžič': 'lžička',
  'člž': 'lžička',
  'špet': 'špetka',
  'hrs': 'hrst',
}

const STANDARD_VOLUME: Record<string, number> = {
  lžička: 5,
  lžíce: 15,
  hrnek: 250,
  šálek: 200,
}

const MASS_PER_TEASPOON: Record<string, number> = {
  cukr: 4,
  'krupicovy cukr': 4,
  mouka: 3,
  'hladka mouka': 3,
  'polohruba mouka': 3,
  kakao: 2.5,
  'prasek do peciva': 4,
  soda: 4.6,
  sul: 5,
  'mleta paprika': 2.3,
  'paprika mleta': 2.3,
  paprika: 2.3,
  'mlety pepr': 2,
  'pepr mlety': 2,
  'cerne koreni': 2,
  'mleta skorice': 2.6,
  'skorice mleta': 2.6,
  skorice: 2.6,
  'grilovaci koreni': 2,
  oregano: 1,
  tymian: 1,
  bazalka: 1,
  'susene bylinky': 1,
}

const MASS_PER_PINCH: Record<string, number> = {
  sul: 0.5,
  'mlety pepr': 0.2,
  'pepr mlety': 0.2,
  'cerne koreni': 0.2,
  'mleta paprika': 0.3,
  'paprika mleta': 0.3,
  paprika: 0.3,
  'mleta skorice': 0.3,
  'skorice mleta': 0.3,
  skorice: 0.3,
  'grilovaci koreni': 0.3,
  oregano: 0.1,
  tymian: 0.1,
  bazalka: 0.1,
}

const MASS_PER_CLOVE: Record<string, number> = {
  cesnek: 3,
}

const normalizeName = (name: string) =>
  normalizeSearchText(name)
    .replace(/\b(mlety|mleta|mlete|suseny|susena|susene|drt|drz)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function canonicalMeasure(unit: string): string {
  const normalized = normalizeSearchText(unit).replace(/\./g, '').replace(/\s+/g, '')
  return UNIT_ALIASES[normalized] ?? normalized
}

function findMassPerTeaspoon(name: string): number | null {
  const normalized = normalizeName(name)
  const direct = MASS_PER_TEASPOON[normalized]
  if (direct != null) return direct
  const entry = Object.entries(MASS_PER_TEASPOON).find(([key]) => normalized.includes(key) || key.includes(normalized))
  return entry?.[1] ?? null
}

function findMassPerPinch(name: string): number | null {
  const normalized = normalizeName(name)
  const direct = MASS_PER_PINCH[normalized]
  if (direct != null) return direct
  const entry = Object.entries(MASS_PER_PINCH).find(([key]) => normalized.includes(key) || key.includes(normalized))
  return entry?.[1] ?? null
}

function findMassPerClove(name: string): number | null {
  const normalized = normalizeName(name)
  const direct = MASS_PER_CLOVE[normalized]
  if (direct != null) return direct
  return normalized.includes('cesnek') ? MASS_PER_CLOVE.cesnek : null
}

export function estimateRecipeMeasure(ingredient: RecipeIngredient): RecipeMeasureEstimate | null {
  if (ingredient.quantity == null || !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0 || !ingredient.unit) {
    return null
  }

  const unit = canonicalMeasure(ingredient.unit)
  const quantity = ingredient.quantity

  if (unit === 'lžička' || unit === 'lžíce') {
    const gramsPerTeaspoon = findMassPerTeaspoon(ingredient.name)
    if (gramsPerTeaspoon != null) {
      return {
        quantity: Math.round(gramsPerTeaspoon * quantity * (unit === 'lžíce' ? 3 : 1) * 100) / 100,
        unit: 'g',
        estimated: true,
        basis: 'ingredient-mass',
        description: `${quantity} ${unit} ≈ ${gramsPerTeaspoon * quantity * (unit === 'lžíce' ? 3 : 1)} g`,
      }
    }

    const milliliters = STANDARD_VOLUME[unit] * quantity
    return {
      quantity: milliliters,
      unit: 'ml',
      estimated: true,
      basis: 'standard-volume',
      description: `${quantity} ${unit} ≈ ${milliliters} ml`,
    }
  }

  if (unit === 'hrnek' || unit === 'šálek') {
    const milliliters = STANDARD_VOLUME[unit] * quantity
    return {
      quantity: milliliters,
      unit: 'ml',
      estimated: true,
      basis: 'standard-volume',
      description: `${quantity} ${unit} ≈ ${milliliters} ml`,
    }
  }

  if (unit === 'špetka') {
    const gramsPerPinch = findMassPerPinch(ingredient.name)
    const grams = (gramsPerPinch ?? 0.3) * quantity
    return {
      quantity: Math.round(grams * 100) / 100,
      unit: 'g',
      estimated: true,
      basis: gramsPerPinch == null ? 'generic-estimate' : 'ingredient-specific',
      description: `${quantity} ${unit} ≈ ${grams} g`,
    }
  }

  if (unit === 'stroužek') {
    const gramsPerClove = findMassPerClove(ingredient.name)
    if (gramsPerClove == null) return null
    return {
      quantity: Math.round(gramsPerClove * quantity * 100) / 100,
      unit: 'g',
      estimated: true,
      basis: 'ingredient-specific',
      description: `${quantity} ${unit} ≈ ${gramsPerClove * quantity} g`,
    }
  }

  return null
}
