/**
 * Conservative text and package-quantity normalization for product identity matching.
 * This module is pure and does not perform matching, persistence, or automatic merging.
 */

export type ParsedQuantity = {
  value: number
  unit: 'g' | 'kg' | 'ml' | 'l' | 'ks'
  baseValue: number
  baseUnit: 'g' | 'ml' | 'ks'
  multipackCount: number
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

/**
 * A number as a retailer writes it: `150`, `1.5` or a Czech thousands group (`1 000`, `1 000 000`
 * with a space, a non-breaking space or a narrow non-breaking space between the groups).
 *
 * The thousands group has to be part of the number, otherwise `1 000 ml` is read as `000 ml` and
 * dropped as a zero — and a pack that states its size as `1 000 ml` would then look like a pack
 * that states no size at all.
 */
const QUANTITY_NUMBER = '\\d{1,3}(?:\\s\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?'

export function parseProductQuantities(value: string | null | undefined): ParsedQuantity[] {
  const text = (value ?? '').toLocaleLowerCase('cs-CZ').replace(/,/g, '.')
  const results: ParsedQuantity[] = []
  const pattern = new RegExp(
    `(?:(\\d+)\\s*[x×]\\s*)?(${QUANTITY_NUMBER})\\s*(kg|g|ml|l|ks)\\b`,
    'giu',
  )

  for (const match of text.matchAll(pattern)) {
    const multipackCount = match[1] ? Number(match[1]) : 1
    // The thousands group is written with a space, which Number() does not read as a separator.
    const amount = Number(match[2].replace(/\s/g, ''))
    const rawUnit = match[3].toLowerCase() as ParsedQuantity['unit']
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(multipackCount) || multipackCount <= 0) continue

    if (rawUnit === 'kg') results.push({ value: amount, unit: 'kg', baseValue: amount * 1000, baseUnit: 'g', multipackCount })
    else if (rawUnit === 'g') results.push({ value: amount, unit: 'g', baseValue: amount, baseUnit: 'g', multipackCount })
    else if (rawUnit === 'l') results.push({ value: amount, unit: 'l', baseValue: amount * 1000, baseUnit: 'ml', multipackCount })
    else if (rawUnit === 'ml') results.push({ value: amount, unit: 'ml', baseValue: amount, baseUnit: 'ml', multipackCount })
    else results.push({ value: amount, unit: 'ks', baseValue: amount, baseUnit: 'ks', multipackCount })
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
  // preserving the count and size of each multipack component.
  if (leftQuantities.length === 0 || rightQuantities.length === 0) return null
  if (leftQuantities.length !== rightQuantities.length) return false

  return leftQuantities.every((quantity, index) => {
    const other = rightQuantities[index]
    return quantity.baseUnit === other.baseUnit
      && quantity.baseValue === other.baseValue
      && quantity.multipackCount === other.multipackCount
  })
}
