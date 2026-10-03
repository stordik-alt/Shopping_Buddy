import { describe, expect, it } from 'vitest'
import { activeDealKey, planActiveDeal, type ActiveDealSnapshot, type IngestedDeal } from '@/lib/ingestion/active-deal'

const deal = (extra: Partial<IngestedDeal> = {}): IngestedDeal => ({
  productId: 'p1',
  storeId: 's1',
  storeLocationId: 'l1',
  dealPrice: 19.9,
  unit: 'kg',
  unitPrice: 39.8,
  validFrom: '2026-10-01',
  validUntil: '2026-10-07',
  ...extra,
})

const stored = (extra: Partial<ActiveDealSnapshot> = {}): ActiveDealSnapshot => ({
  id: 'd1',
  dealPrice: '19.9',
  unit: 'kg',
  unitPrice: '39.8',
  currency: 'CZK',
  validFrom: '2026-10-01',
  validUntil: '2026-10-07',
  ...extra,
})

describe('planActiveDeal', () => {
  it('inserts when the slot has no active deal', () => {
    expect(planActiveDeal(undefined, deal())).toEqual({
      kind: 'insert',
      values: { dealPrice: '19.9', unit: 'kg', unitPrice: '39.8', currency: 'CZK', validFrom: '2026-10-01', validUntil: '2026-10-07' },
    })
  })

  it('leaves the same promotion read again alone', () => {
    expect(planActiveDeal(stored(), deal())).toEqual({ kind: 'unchanged' })
  })

  it('compares amounts as the database stores them (two decimals, returned as "19.90")', () => {
    // Regression: compared as text, "19.90" !== "19.9" rewrote every active deal on every run.
    expect(planActiveDeal(stored({ dealPrice: '19.90', unitPrice: '39.83' }), deal({ dealPrice: 19.9, unitPrice: 39.833 }))).toEqual({ kind: 'unchanged' })
    expect(planActiveDeal(stored({ dealPrice: '19.90' }), deal({ dealPrice: 19.89 }))).toMatchObject({ kind: 'update' })
  })

  it.each([
    ['price', { dealPrice: 17.9 }],
    ['end date', { validUntil: '2026-10-10' }],
    ['start date', { validFrom: '2026-09-30' }],
    ['currency', { currency: 'EUR' }],
    ['unit price', { unitPrice: 35.8 }],
  ])('adjusts the active row in place when the %s changed', (_label, change) => {
    expect(planActiveDeal(stored(), deal(change))).toMatchObject({ kind: 'update', id: 'd1' })
  })

  it('treats a dropped unit price as a change', () => {
    expect(planActiveDeal(stored(), deal({ unit: undefined, unitPrice: undefined }))).toMatchObject({ kind: 'update' })
  })

  it('refuses a unit price without its unit', () => {
    expect(() => planActiveDeal(undefined, deal({ unit: undefined }))).toThrow('both unit and unitPrice')
  })
})

describe('activeDealKey', () => {
  it('separates branches and keeps a chain-wide deal (no branch) apart from a branch deal', () => {
    expect(activeDealKey(deal())).not.toBe(activeDealKey(deal({ storeLocationId: 'l2' })))
    expect(activeDealKey(deal({ storeLocationId: null }))).toBe('p1|s1|')
  })
})
