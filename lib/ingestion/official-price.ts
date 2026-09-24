import type { ItemUnit } from '@/lib/types'

// The rules for how an official (retailer-published) price is written into `prices`, kept free of
// database code so they are deterministic and unit-testable (CLAUDE.md section 5). The model:
// - the CURRENT price of a product at a store is its observation with the latest `observed_at`;
// - there is at most ONE observation per product + store + retailer SKU + day (a repeat run the same
//   day refreshes it instead of adding a duplicate);
// - an observation is never overwritten by older data;
// - when the price changes, the previous observation stays as the OLD price and is closed with
//   `valid_until` = the date the new price was first observed. The real change happened at some point
//   between the two observation dates, so that date is the latest it can be, not an exact one.

export type OfficialPriceSnapshot = {
  id: string
  observedAt: string
  regularPrice: number
  unit: ItemUnit
  unitPrice: number
  currency: string
  /** Null while the observation is the open, latest one; set once a newer price replaced it. */
  validUntil: string | null
}

export type OfficialPriceInput = Pick<OfficialPriceSnapshot, 'observedAt' | 'regularPrice' | 'unit' | 'unitPrice' | 'currency'>

export type OfficialPriceAction =
  /** Add a new observation; `closePrevious` also closes the latest one as an old price. */
  | { kind: 'insert'; closePrevious: boolean }
  /** Same product and day already observed with different values: refresh that row. */
  | { kind: 'update-same-day' }
  /** Same product and day already observed with identical values: nothing to write. */
  | { kind: 'unchanged' }
  /** The latest stored observation is newer than this one: never let older data displace it. */
  | { kind: 'stale' }

const cents = (value: number) => Math.round(value * 100)

/** Whether two observations state the same price: package price, unit and currency. (The unit
 *  price follows from those, so it is not part of the "did the price change" question.) */
export function isSamePrice(a: OfficialPriceInput, b: OfficialPriceInput): boolean {
  return cents(a.regularPrice) === cents(b.regularPrice) && a.unit === b.unit && a.currency === b.currency
}

/** Decides what to write for a newly fetched price, given the latest stored observation of the same
 *  product + store + retailer SKU (`undefined` when there is none yet). ISO dates compare as
 *  strings. */
export function planOfficialPrice(input: OfficialPriceInput, latest: OfficialPriceSnapshot | undefined): OfficialPriceAction {
  if (!latest) return { kind: 'insert', closePrevious: false }
  if (latest.observedAt > input.observedAt) return { kind: 'stale' }
  if (latest.observedAt === input.observedAt) {
    return isSamePrice(latest, input) && cents(latest.unitPrice) === cents(input.unitPrice) ? { kind: 'unchanged' } : { kind: 'update-same-day' }
  }
  return { kind: 'insert', closePrevious: latest.validUntil === null && !isSamePrice(latest, input) }
}
