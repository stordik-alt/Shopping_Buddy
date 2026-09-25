import { describe, expect, it } from 'vitest'
import { priceSteps, priceTrendSummary } from '@/lib/price-trend'
import type { PricePoint } from '@/lib/prices'

const point = (history: [string, number][], current: [string, number]): PricePoint => ({
  store: 'Billa',
  unit: 'l',
  unitPrice: current[1],
  regularPrice: current[1],
  recordedAt: current[0],
  priceHistory: history.map(([recordedAt, price]) => ({ price, recordedAt })),
})

describe('priceSteps', () => {
  it('keeps only the dates the price changed', () => {
    const steps = priceSteps(point([['2026-09-01', 30], ['2026-09-05', 30], ['2026-09-10', 28], ['2026-09-15', 28]], ['2026-09-20', 32]))
    expect(steps).toEqual([
      { date: '2026-09-01', price: 30 },
      { date: '2026-09-10', price: 28 },
      { date: '2026-09-20', price: 32 },
    ])
  })

  it('does not repeat the current price when the history already contains it', () => {
    expect(priceSteps(point([['2026-09-01', 30], ['2026-09-10', 28]], ['2026-09-10', 28]))).toEqual([
      { date: '2026-09-01', price: 30 },
      { date: '2026-09-10', price: 28 },
    ])
  })

  it('sorts unordered history and gives a single step for a price that never changed', () => {
    expect(priceSteps(point([['2026-09-10', 30], ['2026-09-01', 30]], ['2026-09-20', 30]))).toEqual([{ date: '2026-09-01', price: 30 }])
    expect(priceSteps({ ...point([], ['2026-09-20', 30]), priceHistory: undefined })).toEqual([{ date: '2026-09-20', price: 30 }])
  })
})

describe('priceTrendSummary', () => {
  it('is null without a change', () => {
    expect(priceTrendSummary([{ date: '2026-09-01', price: 30 }])).toBeNull()
  })

  it('reports the range and whether today is the lowest', () => {
    expect(priceTrendSummary([{ date: 'a', price: 30 }, { date: 'b', price: 28 }])).toEqual({ min: 28, max: 30, current: 28, atLowest: true })
    expect(priceTrendSummary([{ date: 'a', price: 28 }, { date: 'b', price: 32 }])).toEqual({ min: 28, max: 32, current: 32, atLowest: false })
  })
})
