export type ItemUnit = 'ks' | 'kg' | 'g' | 'l' | 'ml' | 'dávka'

/** Every unit a list item, pantry row or purchase line can be counted in. */
export const ITEM_UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml', 'dávka']

/** Czech form used next to a quantity; abbreviations stay unchanged. */
export function unitLabel(quantity: number, unit: ItemUnit): string {
  if (unit !== 'dávka') return unit
  if (quantity === 1) return 'dávka'
  if (Number.isInteger(quantity) && quantity >= 2 && quantity <= 4) return 'dávky'
  return 'dávek'
}
