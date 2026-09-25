import { describe, expect, it } from 'vitest'
import { suggestUsualItems } from '@/lib/usual-items'
import type { PurchaseRecord } from '@/lib/types'

function purchase(date: string, items: [string, number?, ('ks' | 'l' | 'kg')?][]): PurchaseRecord {
  return { id: date, date, total: 0, items: items.map(([name, quantity = 1, unit = 'ks']) => ({ name, quantity, unit, price: 10 })) }
}

const base = { onList: [], inPantry: [] }

describe('suggestUsualItems', () => {
  it('suggests an item bought every week once a week has (almost) passed', () => {
    const purchases = [purchase('2026-09-01', [['Mléko', 2, 'l']]), purchase('2026-09-08', [['Mléko', 2, 'l']]), purchase('2026-09-15', [['Mléko', 2, 'l']])]
    expect(suggestUsualItems({ ...base, purchases, today: '2026-09-21' })).toEqual([
      { name: 'Mléko', quantity: 2, unit: 'l', intervalDays: 7, daysSinceLast: 6, timesBought: 3 },
    ])
    // 3 days after the last purchase it is not due yet (6 of 7 days = the 0.8 threshold above).
    expect(suggestUsualItems({ ...base, purchases, today: '2026-09-18' })).toEqual([])
  })

  it('needs purchases on at least three different days', () => {
    const purchases = [purchase('2026-09-01', [['Chléb']]), purchase('2026-09-08', [['Chléb']])]
    expect(suggestUsualItems({ ...base, purchases, today: '2026-09-30' })).toEqual([])
  })

  it('counts two purchases on the same day once', () => {
    const purchases = [purchase('2026-09-01', [['Chléb']]), purchase('2026-09-01', [['Chléb']]), purchase('2026-09-08', [['Chléb']])]
    expect(suggestUsualItems({ ...base, purchases, today: '2026-09-30' })).toEqual([])
  })

  it('groups spellings that differ only in case, accents and punctuation', () => {
    const purchases = [purchase('2026-09-01', [['MLEKO POLOTUCNE']]), purchase('2026-09-08', [['Mléko, polotučné']]), purchase('2026-09-15', [['mléko polotučné']])]
    const [item] = suggestUsualItems({ ...base, purchases, today: '2026-09-22' })
    expect(item.name).toBe('mléko polotučné')
    expect(item.timesBought).toBe(3)
  })

  it('skips what is already on the list or at home', () => {
    const purchases = ['2026-09-01', '2026-09-08', '2026-09-15'].map((date) => purchase(date, [['Mléko'], ['Vejce']]))
    expect(suggestUsualItems({ purchases, today: '2026-09-22', onList: ['mleko'], inPantry: [] }).map((i) => i.name)).toEqual(['Vejce'])
    expect(suggestUsualItems({ purchases, today: '2026-09-22', onList: [], inPantry: ['VEJCE'] }).map((i) => i.name)).toEqual(['Mléko'])
  })

  it('ignores purchases older than 120 days and in the future', () => {
    const old = ['2026-01-01', '2026-01-08', '2026-01-15'].map((date) => purchase(date, [['Máslo']]))
    const future = ['2026-10-01', '2026-10-08', '2026-10-15'].map((date) => purchase(date, [['Sýr']]))
    expect(suggestUsualItems({ ...base, purchases: [...old, ...future], today: '2026-09-25' })).toEqual([])
  })

  it('suggests the usual amount and lists the most overdue first', () => {
    const purchases = [
      purchase('2026-08-01', [['Jogurt', 4], ['Káva']]),
      purchase('2026-08-15', [['Jogurt', 4], ['Káva']]),
      purchase('2026-08-29', [['Jogurt', 2], ['Káva']]),
      purchase('2026-09-12', [['Jogurt', 4]]),
      purchase('2026-09-19', [['Jogurt', 4]]),
    ]
    const result = suggestUsualItems({ ...base, purchases, today: '2026-10-03' })
    expect(result.map((i) => i.name)).toEqual(['Káva', 'Jogurt'])
    expect(result[1].quantity).toBe(4)
  })

  it('respects the limit', () => {
    const names = ['A', 'B', 'C', 'D']
    const purchases = ['2026-09-01', '2026-09-08', '2026-09-15'].map((date) => purchase(date, names.map((n) => [n] as [string])))
    expect(suggestUsualItems({ ...base, purchases, today: '2026-09-25', limit: 2 })).toHaveLength(2)
  })
})
