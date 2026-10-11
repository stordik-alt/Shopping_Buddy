import { extractExplicitPackageSizes } from '@/lib/recipes/packaging'
import type { ItemUnit } from '@/lib/types'

/** Size of one piece, in kg or l (never ks). */
export type PieceSize = { quantity: number; unit: ItemUnit }

/** The size of one piece named in a purchased line ("MASLO PRAG. 250G" → 0.25 kg). Only an
 *  unambiguous name counts: two different sizes in one name are no evidence of either. */
export function pieceSizeFromName(name: string): PieceSize | null {
  const sizes = extractExplicitPackageSizes(name).filter((size) => size.unit === 'kg' || size.unit === 'l')
  if (sizes.length !== 1) return null
  return { quantity: sizes[0].quantity, unit: sizes[0].unit }
}

/** Whether two rows' piece sizes are the same (both unknown counts as the same). Sizes are always
 *  stored canonically in kg or l, so no unit conversion is needed. */
export function samePieceSize(a: PieceSize | null, b: PieceSize | null): boolean {
  if (!a || !b) return !a && !b
  return a.unit === b.unit && Math.abs(a.quantity - b.quantity) < 0.0005
}

/** The piece size to store with stock bought in pieces: the one a known multipack states, else the
 *  one written in the line's name; null for weighed goods or when neither says. */
export function pieceSizeOf(
  inventory: { unit: ItemUnit; unitQuantity: number | null; unitUnit: ItemUnit | null },
  name: string,
): PieceSize | null {
  if (inventory.unit !== 'ks') return null
  if (inventory.unitQuantity && (inventory.unitUnit === 'kg' || inventory.unitUnit === 'l')) {
    return { quantity: inventory.unitQuantity, unit: inventory.unitUnit }
  }
  return pieceSizeFromName(name)
}
