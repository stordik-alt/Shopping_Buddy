import type { ItemUnit } from '@/lib/types'

/** Every unit a list item, pantry row or purchase line can be counted in. `dávka` (a dose) is how a
 *  washing gel or powder is counted: "45 dávek" is what the pack says and what the household uses up. */
export const ITEM_UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml', 'dávka']

/** The unit as it reads next to a number: "1 dávka", "3 dávky", "45 dávek"; the other units are
 *  abbreviations and stay as they are. */
export function unitLabel(quantity: number, unit: ItemUnit): string {
  if (unit !== 'dávka') return unit
  if (quantity === 1) return 'dávka'
  if (Number.isInteger(quantity) && quantity >= 2 && quantity <= 4) return 'dávky'
  return 'dávek'
}

/** Product types counted in doses by default (lib/product-types.ts keys): the washing gel and powder
 *  state a number of washes on the pack; capsules are counted in pieces. */
export const DOSE_TYPE_KEYS: ReadonlySet<string> = new Set(['praci-gel', 'praci-prasek'])
