import type { ItemUnit } from '@/lib/types'

// What to do with one ingested promotion, given the product's currently active deal at the same
// chain and branch (if any). Pure, so the rule is unit-testable without a database; the writes live
// in lib/db/queries.ts (createActiveDealWriter / upsertActiveDeal).
//
// The rule (CLAUDE.md section 16 — never overwrite history): a deal whose validity has not ended is
// the one "active" row. Re-reading the same ongoing promotion leaves it alone or adjusts it (price or
// dates may shift slightly); only when no active row exists does a new row start, so past
// promotions stay in `deals` untouched.

/** A promotion as a connector reports it, in the units `deals` stores. */
export type IngestedDeal = {
  productId: string
  /** The chain the promotion belongs to. */
  storeId: string
  /** The branch it applies at; null for an online-only chain, whose deals have none. */
  storeLocationId: string | null
  dealPrice: number
  /** Promotion price per the product's unit. */
  unit?: ItemUnit
  unitPrice?: number
  currency?: string
  validFrom: string
  validUntil: string
}

/** The stored columns of an active deal that the comparison needs (numerics as Postgres returns them). */
export type ActiveDealSnapshot = {
  id: string
  dealPrice: string
  unit: ItemUnit | null
  unitPrice: string | null
  currency: string
  validFrom: string
  validUntil: string
}

/** The column values a deal is written with. */
export type DealValues = {
  dealPrice: string
  unit?: ItemUnit
  unitPrice?: string
  currency: string
  validFrom: string
  validUntil: string
}

export type ActiveDealPlan =
  | { kind: 'unchanged' }
  | { kind: 'update'; id: string; values: DealValues }
  | { kind: 'insert'; values: DealValues }

/** Key of the "one active deal per product, chain and branch" slot. */
export function activeDealKey(deal: { productId: string; storeId: string; storeLocationId: string | null }): string {
  return `${deal.productId}|${deal.storeId}|${deal.storeLocationId ?? ''}`
}

export function dealValues(deal: IngestedDeal): DealValues {
  // A unit price without its unit (or the reverse) would be a meaningless comparison basis.
  if ((deal.unit == null) !== (deal.unitPrice == null)) throw new Error('A deal needs both unit and unitPrice, or neither')
  return {
    dealPrice: deal.dealPrice.toString(),
    ...(deal.unit != null && deal.unitPrice != null ? { unit: deal.unit, unitPrice: deal.unitPrice.toString() } : {}),
    currency: deal.currency ?? 'CZK',
    validFrom: deal.validFrom,
    validUntil: deal.validUntil,
  }
}

/** Whether a stored money amount is the one a new reading would store. `deals` keeps two decimals and
 *  Postgres returns them as text ("19.90"), while a source may send 19.9 or 39.833 — compared as
 *  text, every re-read promotion looked changed and was rewritten on every run. Equal when the stored
 *  value is what rounding the new one to cents gives (half a cent of tolerance, plus float noise). */
function sameAmount(stored: string | null, next: string | undefined): boolean {
  if (stored == null || next == null) return stored == null && next == null
  return Math.abs(Number(stored) - Number(next)) <= 0.005 + 1e-9
}

export function planActiveDeal(existing: ActiveDealSnapshot | undefined, deal: IngestedDeal): ActiveDealPlan {
  const values = dealValues(deal)
  if (!existing) return { kind: 'insert', values }
  const changed =
    !sameAmount(existing.dealPrice, values.dealPrice) ||
    (existing.unit ?? null) !== (values.unit ?? null) ||
    !sameAmount(existing.unitPrice, values.unitPrice) ||
    existing.currency !== values.currency ||
    existing.validFrom !== values.validFrom ||
    existing.validUntil !== values.validUntil
  return changed ? { kind: 'update', id: existing.id, values } : { kind: 'unchanged' }
}
