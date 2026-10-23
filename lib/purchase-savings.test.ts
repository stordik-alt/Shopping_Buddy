import { describe, expect, it } from 'vitest'
import { purchaseSavingsByMonth, type PurchaseSavingsRecord } from '@/lib/purchase-savings'

const saving = (id: string, date: string, discount: number | null, receiptSupported = true): PurchaseSavingsRecord => ({
  id,
  date,
  discount,
  receiptSupported,
})

describe('purchase savings', () => {
  it('separates receipt-reported savings from manually declared discounts by calendar month', () => {
    expect(purchaseSavingsByMonth([
      saving('receipt-1', '2026-10-02', 12.5),
      saving('receipt-2', '2026-10-15', 7.25),
      saving('manual-1', '2026-10-20', 5, false),
      saving('receipt-3', '2026-09-30', 3),
    ])).toEqual([
      { month: '2026-10', receiptReported: 19.75, declared: 5 },
      { month: '2026-09', receiptReported: 3, declared: 0 },
    ])
  })

  it('does not count a purchase twice when duplicate receipt links exist', () => {
    expect(purchaseSavingsByMonth([
      saving('same-purchase', '2026-10-02', 12),
      saving('same-purchase', '2026-10-02', 12),
    ])).toEqual([{ month: '2026-10', receiptReported: 12, declared: 0 }])
  })

  it('ignores missing and zero discount data rather than inventing savings', () => {
    expect(purchaseSavingsByMonth([
      saving('missing', '2026-10-02', null),
      saving('zero', '2026-10-03', 0),
    ])).toEqual([])
    expect(purchaseSavingsByMonth([])).toEqual([])
  })
})
