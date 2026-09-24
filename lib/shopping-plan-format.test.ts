import { describe, expect, it } from 'vitest'
import { alternativeLabel, alternativesToShow, planInsights } from '@/lib/shopping-plan-format'
import type { PlannedLine, ShoppingPlan } from '@/lib/shopping-plan'

const alt = (overrides: Partial<PlannedLine['alternatives'][number]> = {}): PlannedLine['alternatives'][number] => ({
  storeId: 'albert',
  chain: 'Albert',
  productName: 'Mléko',
  cost: 45,
  difference: 5,
  inPlan: false,
  ...overrides,
})

const line = (alternatives: PlannedLine['alternatives']): PlannedLine => ({
  needId: 'n',
  name: 'mléko',
  storeId: 'lidl',
  chain: 'Lidl',
  productId: 'p',
  productName: 'Mléko',
  cost: 40,
  source: 'auto',
  alternatives,
})

const plan = (overrides: Partial<ShoppingPlan> = {}): ShoppingPlan => ({
  stores: [],
  unplanned: [],
  total: 100,
  plannedCount: 3,
  needCount: 3,
  bestSingleStore: { storeId: 'billa', chain: 'Billa', total: 155, coveredCount: 3 },
  savingVsSingleStore: 55,
  cheapestPossible: { total: 100, storeCount: 3 },
  costOfStoreLimit: 0,
  costOfPriority: 0,
  notes: [],
  ...overrides,
})

describe('alternativeLabel', () => {
  it('says how much dearer it is elsewhere (the saving of buying here)', () => {
    expect(alternativeLabel(alt({ difference: 5 }))).toMatch(/^Albert: o 5,00\s+Kč dráž$/)
  })

  it('says how much cheaper it would be elsewhere, and whether that store is in the plan', () => {
    expect(alternativeLabel(alt({ difference: -25, inPlan: false }))).toMatch(/levněji, ale není v plánu$/)
    expect(alternativeLabel(alt({ difference: -25, inPlan: true }))).toMatch(/levněji \(kupujete tam jiné položky\)$/)
  })

  it('says so when the price is the same', () => {
    expect(alternativeLabel(alt({ difference: 0 }))).toBe('Albert: stejná cena')
  })
})

describe('alternativesToShow', () => {
  it('shows dearer alternatives first, then cheaper ones, up to the limit', () => {
    const shown = alternativesToShow(
      line([
        alt({ chain: 'A', difference: -10 }),
        alt({ chain: 'B', difference: 3 }),
        alt({ chain: 'C', difference: 8 }),
        alt({ chain: 'D', difference: -2 }),
      ]),
      3,
    )
    expect(shown.map((entry) => entry.chain)).toEqual(['B', 'C', 'A'])
  })

  it('returns nothing for a line with no alternatives', () => {
    expect(alternativesToShow(line([]))).toEqual([])
  })
})

describe('planInsights', () => {
  it('mentions the saving against the best single store when several stores are used', () => {
    const insights = planInsights(plan({ stores: [{} as never, {} as never] }))
    expect(insights.join(' ')).toMatch(/Oproti nákupu všeho v jednom obchodě \(Billa\) ušetříte 55,00\s+Kč/)
  })

  it('says nothing about a saving when only one store is used', () => {
    expect(planInsights(plan({ stores: [{} as never], savingVsSingleStore: 0 }))).toEqual([])
  })

  it('says what the store limit and the priority cost, only when they are real', () => {
    const insights = planInsights(plan({ stores: [{} as never], savingVsSingleStore: null, costOfStoreLimit: 25, costOfPriority: 3, cheapestPossible: { total: 100, storeCount: 3 } }))
    expect(insights.join(' ')).toMatch(/Omezení počtu obchodů stojí 25,00\s+Kč oproti nákupu bez omezení \(3 obchody, 100,00\s+Kč\)/)
    expect(insights.join(' ')).toMatch(/Přednost prioritních obchodů stojí 3,00\s+Kč/)
    expect(planInsights(plan({ stores: [{} as never], savingVsSingleStore: null, costOfStoreLimit: 0.2, costOfPriority: 0.1 }))).toEqual([])
  })
})
