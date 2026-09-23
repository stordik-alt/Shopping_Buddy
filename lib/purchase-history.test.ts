import { describe, expect, it } from 'vitest'
import { repeatPurchases } from './purchase-history'
import type { PurchaseRecord } from './types'

function purchase(id: string, date: string, names: string[]): PurchaseRecord {
  return {
    id,
    date,
    total: 100,
    items: names.map((name) => ({ name, quantity: 1, unit: 'ks', price: 10 })),
  }
}

describe('repeatPurchases', () => {
  it('requires three separate purchases before an item is considered repeated', () => {
    const records = [
      purchase('1', '2026-07-01', ['Mléko']),
      purchase('2', '2026-08-01', ['Mléko']),
      purchase('3', '2026-09-01', ['Mléko']),
      purchase('4', '2026-09-02', ['Banány']),
      purchase('5', '2026-09-03', ['Banány']),
    ]

    expect(repeatPurchases(records)).toEqual([{ name: 'Mléko', count: 3 }])
  })

  it('counts a product only once within one purchase', () => {
    const records = [
      purchase('1', '2026-07-01', ['Jupík', 'Jupík']),
      purchase('2', '2026-08-01', ['Jupík']),
      purchase('3', '2026-09-01', ['Jupík']),
    ]

    expect(repeatPurchases(records)).toEqual([{ name: 'Jupík', count: 3 }])
  })
})
