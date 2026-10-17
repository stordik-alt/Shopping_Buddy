export { ITEM_UNITS, unitLabel } from '@anitka/shared/units'
export type { ItemUnit } from '@anitka/shared/units'

/** Product types counted in doses by default (lib/product-types.ts keys): the washing gel and powder
 *  state a number of washes on the pack; capsules are counted in pieces. */
export const DOSE_TYPE_KEYS: ReadonlySet<string> = new Set(['praci-gel', 'praci-prasek'])
