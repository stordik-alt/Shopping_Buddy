import { describe, expect, it } from 'vitest'
import { isSamePrice, planOfficialPrice, type OfficialPriceInput, type OfficialPriceSnapshot } from '@/lib/ingestion/official-price'

const stored = (overrides: Partial<OfficialPriceSnapshot> = {}): OfficialPriceSnapshot => ({
  id: 'row-1',
  observedAt: '2026-09-20',
  regularPrice: 50,
  unit: 'kg',
  unitPrice: 100,
  currency: 'CZK',
  validUntil: null,
  ...overrides,
})
const fetched = (overrides: Partial<OfficialPriceInput> = {}): OfficialPriceInput => ({
  observedAt: '2026-09-24',
  regularPrice: 50,
  unit: 'kg',
  unitPrice: 100,
  currency: 'CZK',
  ...overrides,
})

describe('isSamePrice', () => {
  it('compares package price, unit and currency at whole-haléř precision', () => {
    expect(isSamePrice(fetched(), fetched())).toBe(true)
    expect(isSamePrice(fetched({ regularPrice: 49.9 }), fetched({ regularPrice: 49.90000001 }))).toBe(true)
    expect(isSamePrice(fetched({ regularPrice: 49.9 }), fetched({ regularPrice: 50 }))).toBe(false)
    expect(isSamePrice(fetched({ unit: 'l' }), fetched())).toBe(false)
    expect(isSamePrice(fetched({ currency: 'EUR' }), fetched())).toBe(false)
  })
})

describe('planOfficialPrice', () => {
  it('inserts the first observation of a SKU without closing anything', () => {
    expect(planOfficialPrice(fetched(), undefined)).toEqual({ kind: 'insert', closePrevious: false })
  })

  it('inserts a new day\'s observation of an unchanged price without closing the previous one', () => {
    expect(planOfficialPrice(fetched(), stored())).toEqual({ kind: 'insert', closePrevious: false })
  })

  it('closes the previous observation as an old price when the price changed', () => {
    expect(planOfficialPrice(fetched({ regularPrice: 45 }), stored())).toEqual({ kind: 'insert', closePrevious: true })
  })

  it('treats a changed unit as a changed price', () => {
    expect(planOfficialPrice(fetched({ unit: 'l' }), stored())).toEqual({ kind: 'insert', closePrevious: true })
  })

  it('does not close a previous observation that is already closed', () => {
    expect(planOfficialPrice(fetched({ regularPrice: 45 }), stored({ validUntil: '2026-09-22' }))).toEqual({ kind: 'insert', closePrevious: false })
  })

  it('does nothing when the same day was already stored with identical values', () => {
    expect(planOfficialPrice(fetched(), stored({ observedAt: '2026-09-24' }))).toEqual({ kind: 'unchanged' })
  })

  it('refreshes the same day\'s row when the values differ (a later fetch the same day)', () => {
    expect(planOfficialPrice(fetched({ regularPrice: 45 }), stored({ observedAt: '2026-09-24' }))).toEqual({ kind: 'update-same-day' })
    // The price is the same but the unit price differs (e.g. a corrected package size).
    expect(planOfficialPrice(fetched({ unitPrice: 90 }), stored({ observedAt: '2026-09-24' }))).toEqual({ kind: 'update-same-day' })
  })

  it('never lets older data displace a newer observation', () => {
    expect(planOfficialPrice(fetched({ observedAt: '2026-09-10' }), stored({ observedAt: '2026-09-24' }))).toEqual({ kind: 'stale' })
    expect(planOfficialPrice(fetched({ observedAt: '2026-09-10', regularPrice: 1 }), stored({ observedAt: '2026-09-24' }))).toEqual({ kind: 'stale' })
  })
})
