/**
 * Conservative text and package-quantity normalization for product identity matching.
 * This module is pure and does not perform matching, persistence, or automatic merging.
 */

export type ParsedQuantity = {
  value: number
  unit: 'g' | 'kg' | 'ml' | 'l' | 'ks'
  baseValue: number
  baseUnit: 'g' | 'ml' | 'ks'
}

export function normalizeProductIdentityText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('cs-CZ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function parseProductQuantities(value: string | null | undefined): ParsedQuantity[] {
  const text = (value ?? '').toLocaleLowerCase('cs-CZ').replace(/,/g, '.')
  const results: ParsedQuantity[] = []
  const pattern = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ks)\b/giu

  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1])
    const rawUnit = match[2].toLowerCase() as ParsedQuantity['unit']
    if (!Number.isFinite(amount) || amount <= 0) continue

    if (rawUnit === 'kg') results.push({ value: amount, unit: 'kg', baseValue: amount * 1000, baseUnit: 'g' })
    else if (rawUnit === 'g') results.push({ value: amount, unit: 'g', baseValue: amount, baseUnit: 'g' })
    else if (rawUnit === 'l') results.push({ value: amount, unit: 'l', baseValue: amount * 1000, baseUnit: 'ml' })
    else if (rawUnit === 'ml') results.push({ value: amount, unit: 'ml', baseValue: amount, baseUnit: 'ml' })
    else results.push({ value: amount, unit: 'ks', baseValue: amount, baseUnit: 'ks' })
  }

  return results
}

export function packageQuantitiesEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean | null {
  const leftQuantities = parseProductQuantities(left)
  const rightQuantities = parseProductQuantities(right)

  // Unknown is not agreement. Require the same number and order of quantity expressions,
  // which preserves multipack composition (e.g. 2 x 500 ml differs from 1 l).
  if (leftQuantities.length === 0 || rightQuantities.length === 0) return null
  if (leftQuantities.length !== rightQuantities.length) return false

  return leftQuantities.every((quantity, index) => {
    const other = rightQuantities[index]
    return quantity.baseUnit === other.baseUnit && quantity.baseValue === other.baseValue
  })
}
