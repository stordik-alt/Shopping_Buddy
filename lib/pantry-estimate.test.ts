import { describe, expect, it } from 'vitest'
import { estimateConsumption, estimatePantry, estimateReason, restockedQuantity, selectForWeeklyCheck, shelfLifeDays, weeklyCheckMessage } from '@/lib/pantry-estimate'
import { purchaseRhythms } from '@/lib/purchase-rhythm'
import type { PantryItem, PurchaseRecord } from '@/lib/types'

const purchase = (date: string, ...names: string[]): PurchaseRecord => ({ id: date, date, total: 0, items: names.map((name) => ({ name, quantity: 1, unit: 'ks', price: 10 })) })
const item = (overrides: Partial<PantryItem>): PantryItem => ({ id: 'p', name: 'Mléko', category: 'Potraviny', location: 'Lednice', quantity: 1, unit: 'l', addedAt: '2026-09-20T09:00:00Z', ...overrides })

describe('shelfLifeDays', () => {
  it('knows short-lived fresh food', () => {
    expect(shelfLifeDays(item({ name: 'Rohlík tukový' }))).toBe(3)
    expect(shelfLifeDays(item({ name: 'Chléb kmínový' }))).toBe(3)
    expect(shelfLifeDays(item({ name: 'Mléko polotučné 1,5 %' }))).toBe(7)
    expect(shelfLifeDays(item({ name: 'Mleté maso vepřové' }))).toBe(3)
    expect(shelfLifeDays(item({ name: 'Banány' }))).toBe(7)
  })

  it('gives no estimate where it would be a guess', () => {
    expect(shelfLifeDays(item({ name: 'Trvanlivé mléko 1,5 %' }))).toBeNull()
    expect(shelfLifeDays(item({ name: 'Mléko', location: 'Mrazák' }))).toBeNull()
    expect(shelfLifeDays(item({ name: 'Rýže jasmínová' }))).toBeNull()
    expect(shelfLifeDays(item({ name: 'Mléko', category: 'Drogerie' }))).toBeNull() // e.g. body lotion "tělové mléko"
    expect(shelfLifeDays(item({ name: 'Čokoládové mléko' }))).toBe(7) // a word start, so "mléko" still counts
    expect(shelfLifeDays(item({ name: 'Sušenky s mlékem' }))).toBeNull()
  })
})

describe('estimateConsumption', () => {
  const weekly = [purchase('2026-09-01', 'Mléko'), purchase('2026-09-08', 'Mléko'), purchase('2026-09-15', 'Mléko')]

  it('uses the household rhythm first: gone once the usual interval has passed', () => {
    const rhythm = purchaseRhythms(weekly, '2026-09-30').get('mleko')
    expect(estimateConsumption(item({ addedAt: '2026-09-20T09:00:00Z' }), rhythm, '2026-09-26')).toEqual({ days: 7, basis: 'rhythm', age: 6, likelyGone: false })
    expect(estimateConsumption(item({ addedAt: '2026-09-20T09:00:00Z' }), rhythm, '2026-09-27')).toEqual({ days: 7, basis: 'rhythm', age: 7, likelyGone: true })
  })

  it('falls back to shelf life, and says nothing without either', () => {
    expect(estimateConsumption(item({ name: 'Rohlík' }), undefined, '2026-09-23')).toMatchObject({ basis: 'shelf-life', days: 3, likelyGone: true })
    expect(estimateConsumption(item({ name: 'Rýže' }), undefined, '2026-12-31')).toBeNull()
  })

  it('treats an item at zero as gone, and a future date as no estimate', () => {
    expect(estimateConsumption(item({ quantity: 0 }), undefined, '2026-09-20')?.likelyGone).toBe(true)
    expect(estimateConsumption(item({ addedAt: '2026-10-01T00:00:00Z' }), undefined, '2026-09-20')).toBeNull()
  })
})

describe('estimatePantry', () => {
  it('matches pantry items to purchases by normalized name', () => {
    const purchases = [purchase('2026-09-01', 'MLÉKO'), purchase('2026-09-11', 'mléko'), purchase('2026-09-21', 'Mléko ')]
    const estimates = estimatePantry([item({ id: 'a', addedAt: '2026-09-21T08:00:00Z' }), item({ id: 'b', name: 'Rýže' })], purchases, '2026-10-02')
    expect(estimates.get('a')).toEqual({ days: 10, basis: 'rhythm', age: 11, likelyGone: true })
    expect(estimates.has('b')).toBe(false)
  })
})

describe('estimateReason', () => {
  it('explains the estimate in Czech with the right plural', () => {
    expect(estimateReason({ days: 7, basis: 'rhythm', age: 8, likelyGone: true })).toBe('kupujete zhruba každých 7 dní')
    expect(estimateReason({ days: 3, basis: 'shelf-life', age: 4, likelyGone: true })).toBe('vydrží obvykle 3 dny')
    expect(estimateReason({ days: 3.5, basis: 'rhythm', age: 4, likelyGone: true })).toBe('kupujete zhruba každé 4 dny')
    expect(estimateReason({ days: 1, basis: 'rhythm', age: 1, likelyGone: true })).toBe('kupujete zhruba každý den')
  })
})

describe('selectForWeeklyCheck', () => {
  const now = new Date('2026-09-27T15:00:00Z')
  it('takes the probably-used-up items and those due for a check-in, used-up first', () => {
    const items = [
      item({ id: 'rice', name: 'Rýže', location: 'Spíž', addedAt: '2026-09-25T00:00:00Z' }), // neither
      item({ id: 'flour', name: 'Mouka', location: 'Spíž', addedAt: '2026-09-01T00:00:00Z' }), // check-in due (10 days for food)
      item({ id: 'bread', name: 'Chléb', location: 'Spíž', addedAt: '2026-09-22T00:00:00Z' }), // 3-day shelf life passed
    ]
    expect(selectForWeeklyCheck(items, [], '2026-09-27', now).map((entry) => entry.id)).toEqual(['bread', 'flour'])
  })

  it('does not re-ask an item asked about recently', () => {
    const items = [item({ id: 'flour', name: 'Mouka', location: 'Spíž', addedAt: '2026-09-01T00:00:00Z', askedAt: '2026-09-24T00:00:00Z' })]
    expect(selectForWeeklyCheck(items, [], '2026-09-27', now)).toEqual([])
  })
})

describe('weeklyCheckMessage', () => {
  it('lists up to five names and counts the rest with the right plural', () => {
    expect(weeklyCheckMessage(['Chléb', 'Mléko']).detail).toBe('Došlo, nebo ještě máte? Chléb, Mléko. Stačí potvrdit, zabere to chvilku.')
    expect(weeklyCheckMessage(['a', 'b', 'c', 'd', 'e', 'f', 'g']).detail).toContain('a, b, c, d, e a další 2.')
    expect(weeklyCheckMessage(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']).detail).toContain('a dalších 5.')
  })
})

describe('restockedQuantity', () => {
  it('adds to stock that is probably still there', () => {
    expect(restockedQuantity(item({ name: 'Rýže', location: 'Spíž', quantity: 1, addedAt: '2026-09-01T00:00:00Z' }), 2, '2026-09-25')).toBe(3)
    expect(restockedQuantity(item({ name: 'Mléko', quantity: 1, addedAt: '2026-09-23T00:00:00Z' }), 2, '2026-09-25')).toBe(3)
  })

  it('starts again from what was bought when the old stock is used up or past its shelf life', () => {
    expect(restockedQuantity(item({ name: 'Mléko', quantity: 0 }), 2, '2026-09-21')).toBe(2)
    expect(restockedQuantity(item({ name: 'Mléko', quantity: 1, addedAt: '2026-09-10T00:00:00Z' }), 2, '2026-09-25')).toBe(2)
  })

  it('sums as before for items watched rarely or not at all', () => {
    expect(restockedQuantity(item({ name: 'Mléko', quantity: 1, addedAt: '2026-09-01T00:00:00Z', tracking: 'rare' }), 2, '2026-09-25')).toBe(3)
  })
})

describe('tracking levels', () => {
  it('gives no estimate for items watched rarely or not at all, and never asks about "off" ones', () => {
    expect(estimateConsumption(item({ name: 'Rohlík', tracking: 'rare' }), undefined, '2026-12-31')).toBeNull()
    expect(estimateConsumption(item({ name: 'Rohlík', tracking: 'off' }), undefined, '2026-12-31')).toBeNull()
    const now = new Date('2026-12-31T12:00:00Z')
    const old = { location: 'Spíž' as const, addedAt: '2026-09-01T00:00:00Z' }
    expect(selectForWeeklyCheck([item({ id: 'a', name: 'Sůl', ...old, tracking: 'off' })], [], '2026-12-31', now)).toEqual([])
    expect(selectForWeeklyCheck([item({ id: 'b', name: 'Sůl', ...old, tracking: 'rare' })], [], '2026-12-31', now).map((entry) => entry.id)).toEqual(['b']) // 90 days passed
    expect(selectForWeeklyCheck([item({ id: 'c', name: 'Sůl', location: 'Spíž', addedAt: '2026-11-01T00:00:00Z', tracking: 'rare' })], [], '2026-12-31', now)).toEqual([])
  })
})
