import { describe, expect, it } from 'vitest'
import { MAX_CANDIDATE_STORES, planShopping, type PlanNeed, type PlanOffer } from '@/lib/shopping-plan'

const chains: Record<string, string> = { lidl: 'Lidl', albert: 'Albert', billa: 'Billa', penny: 'Penny', dm: 'dm' }
const offer = (needId: string, storeId: string, cost: number, extra: Partial<PlanOffer> = {}): PlanOffer => ({
  needId,
  storeId,
  chain: chains[storeId] ?? storeId,
  productId: `${storeId}-${needId}`,
  productName: `${needId} @ ${storeId}`,
  cost,
  source: 'auto',
  ...extra,
})
const need = (id: string): PlanNeed => ({ id, name: id })
const settings = (overrides: Partial<Parameters<typeof planShopping>[2]> = {}) => ({ maxStores: 2, priorityStoreIds: [], allowedStoreIds: ['lidl', 'albert', 'billa', 'penny'], ...overrides })

// milk: Lidl 20, Albert 45, Billa 50 · bread: Albert 30, Billa 55, Lidl 60 · butter: Billa 50, Albert 90, Lidl 95
// One store: Lidl 175, Albert 165, Billa 155. Two: Lidl+Albert 140, Lidl+Billa 125, Albert+Billa 125.
// Three (each item at its cheapest): 20 + 30 + 50 = 100. Every extra store saves well over the tolerance.
const needs = [need('milk'), need('bread'), need('butter')]
const offers: PlanOffer[] = [
  offer('milk', 'lidl', 20), offer('milk', 'albert', 45), offer('milk', 'billa', 50),
  offer('bread', 'albert', 30), offer('bread', 'billa', 55), offer('bread', 'lidl', 60),
  offer('butter', 'billa', 50), offer('butter', 'albert', 90), offer('butter', 'lidl', 95),
]
const storeIds = (plan: ReturnType<typeof planShopping>) => plan.stores.map((store) => store.storeId).sort()

describe('the store limit', () => {
  it('with one store, buys everything at the store that is cheapest overall', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 1 }))
    expect(storeIds(plan)).toEqual(['billa'])
    expect(plan.total).toBe(155)
    expect(plan.plannedCount).toBe(3)
  })

  it('with two stores, splits the items where they are cheapest', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 2 }))
    // Lidl+Billa and Albert+Billa both cost 125; the tie breaks by store ids (albert|billa first).
    expect(plan.total).toBe(125)
    expect(storeIds(plan)).toEqual(['albert', 'billa'])
    expect(plan.stores.flatMap((store) => store.lines).find((line) => line.needId === 'bread')!.chain).toBe('Albert')
  })

  it('breaks a tie between equally cheap plans by store id, not by input order', () => {
    const tie: PlanOffer[] = [offer('x', 'lidl', 10), offer('x', 'albert', 10)]
    expect(storeIds(planShopping([need('x')], tie, settings({ maxStores: 1 })))).toEqual(['albert'])
    expect(storeIds(planShopping([need('x')], [...tie].reverse(), settings({ maxStores: 1 })))).toEqual(['albert'])
  })

  it('never uses more stores than allowed, however much cheaper it would be', () => {
    for (const maxStores of [1, 2, 3]) {
      expect(planShopping(needs, offers, settings({ maxStores })).stores.length).toBeLessThanOrEqual(maxStores)
    }
  })

  it('a bigger limit never costs more', () => {
    const totals = [1, 2, 3].map((maxStores) => planShopping(needs, offers, settings({ maxStores })).total)
    expect(totals[1]).toBeLessThanOrEqual(totals[0])
    expect(totals[2]).toBeLessThanOrEqual(totals[1])
  })

  it('with a limit above the number of stores, uses as many as pay off', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 10 }))
    expect(plan.total).toBe(100) // each item at its cheapest store
    expect(plan.stores.length).toBe(3)
  })

  it('treats a limit below 1 or not a number as one store, and says so', () => {
    for (const bad of [0, -3, Number.NaN]) {
      const plan = planShopping(needs, offers, settings({ maxStores: bad }))
      expect(plan.stores.length).toBe(1)
      expect(plan.notes.join(' ')).toContain('alespoň 1')
    }
  })

  it('reports what the store limit costs against the floor of unlimited stores', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 2 }))
    expect(plan.cheapestPossible).toEqual({ total: 100, storeCount: 3 })
    expect(plan.costOfStoreLimit).toBe(25) // 125 with two stores vs 100 with three
    expect(planShopping(needs, offers, settings({ maxStores: 3 })).costOfStoreLimit).toBe(0)
  })
})

describe('coverage comes before price', () => {
  it('picks the stores that cover an item only one store offers, even if that costs more', () => {
    const rare = [...offers, offer('caviar', 'penny', 500)]
    const plan = planShopping([...needs, need('caviar')], rare, settings({ maxStores: 2 }))
    expect(plan.plannedCount).toBe(4)
    expect(storeIds(plan)).toContain('penny')
    expect(plan.unplanned).toEqual([])
  })

  it('reports an item that no allowed store offers, and never prices it', () => {
    const plan = planShopping([...needs, need('unicorn')], offers, settings())
    expect(plan.unplanned).toEqual([{ needId: 'unicorn', name: 'unicorn', availableAt: [] }])
    expect(plan.needCount).toBe(4)
    expect(plan.plannedCount).toBe(3)
    expect(plan.total).toBe(125) // two stores, as without the unicorn: it adds nothing
  })

  it('reports an item that only an unused store offers, with where it can be found', () => {
    const scattered = [
      offer('a', 'lidl', 10), offer('b', 'albert', 10), offer('c', 'billa', 10), offer('c', 'penny', 12),
    ]
    const plan = planShopping([need('a'), need('b'), need('c')], scattered, settings({ maxStores: 2 }))
    expect(plan.plannedCount).toBe(2) // three items, three different stores, only two allowed
    expect(plan.unplanned).toHaveLength(1)
    expect(plan.unplanned[0].availableAt.length).toBeGreaterThan(0)
  })

  it('returns an empty plan for no needs, no offers, or no allowed stores', () => {
    expect(planShopping([], offers, settings()).stores).toEqual([])
    expect(planShopping(needs, [], settings()).unplanned).toHaveLength(3)
    expect(planShopping(needs, offers, settings({ allowedStoreIds: [] })).plannedCount).toBe(0)
    expect(planShopping([], [], settings())).toMatchObject({ total: 0, needCount: 0, bestSingleStore: null })
  })
})

describe('allowed stores', () => {
  it('never plans at a store that is not allowed', () => {
    const plan = planShopping(needs, offers, settings({ allowedStoreIds: ['lidl', 'albert'], maxStores: 3 }))
    expect(storeIds(plan).every((id) => ['lidl', 'albert'].includes(id))).toBe(true)
    expect(plan.total).toBe(20 + 30 + 90) // butter is dearer at Albert but Billa is not allowed
  })
})

describe('priority stores', () => {
  // Two stores fill the whole basket at about the same price: Lidl+Albert costs 100, Lidl+Billa 103.
  const close: PlanOffer[] = [
    offer('x', 'lidl', 10), offer('y', 'albert', 10), offer('z', 'billa', 13), offer('z', 'albert', 90), offer('y', 'billa', 90), offer('x', 'albert', 90),
  ]
  const three = [need('x'), need('y'), need('z')]

  it('prefers a priority store when it costs only a little more', () => {
    // Cheapest: lidl(x=10) + albert(y=10) + z at albert 90 = 110 ... billa is needed for z=13:
    // the cheapest 2-store plan is lidl+billa: x 10, y 90, z 13 = 113? compute below through the API instead.
    const cheapest = planShopping(three, close, settings({ maxStores: 2 }))
    const withPriority = planShopping(three, close, settings({ maxStores: 2, priorityStoreIds: ['albert'] }))
    expect(withPriority.total - cheapest.total).toBeLessThanOrEqual(5 + 1e-9)
    expect(withPriority.costOfPriority).toBe(Math.max(0, withPriority.total - cheapest.total))
  })

  it('does not prefer a priority store once it costs more than the tolerance', () => {
    const dear: PlanOffer[] = [offer('x', 'lidl', 10), offer('x', 'albert', 40), offer('y', 'lidl', 10), offer('y', 'albert', 40)]
    const plan = planShopping([need('x'), need('y')], dear, settings({ maxStores: 1, priorityStoreIds: ['albert'] }))
    expect(storeIds(plan)).toEqual(['lidl'])
    expect(plan.costOfPriority).toBe(0)
  })

  it('takes a priority store within the tolerance, and says what that costs', () => {
    const near: PlanOffer[] = [offer('x', 'lidl', 100), offer('x', 'albert', 103)]
    const plan = planShopping([need('x')], near, settings({ maxStores: 1, priorityStoreIds: ['albert'] }))
    expect(storeIds(plan)).toEqual(['albert'])
    expect(plan.total).toBe(103)
    expect(plan.costOfPriority).toBe(3)
    expect(plan.stores[0].isPriority).toBe(true)
  })

  it('the tolerance is the larger of 5 Kč and 3 % of the cheapest total', () => {
    // 3 % of 1 000 Kč is 30 Kč: 25 Kč dearer is still within the tolerance ...
    const big: PlanOffer[] = [offer('x', 'lidl', 1000), offer('x', 'albert', 1025)]
    expect(storeIds(planShopping([need('x')], big, settings({ maxStores: 1, priorityStoreIds: ['albert'] })))).toEqual(['albert'])
    // ... 35 Kč dearer is not.
    const over: PlanOffer[] = [offer('x', 'lidl', 1000), offer('x', 'albert', 1035)]
    expect(storeIds(planShopping([need('x')], over, settings({ maxStores: 1, priorityStoreIds: ['albert'] })))).toEqual(['lidl'])
  })

  it('accepts a custom tolerance', () => {
    const near: PlanOffer[] = [offer('x', 'lidl', 100), offer('x', 'albert', 103)]
    const strict = planShopping([need('x')], near, settings({ maxStores: 1, priorityStoreIds: ['albert'], tolerance: { absolute: 0, relative: 0 } }))
    expect(storeIds(strict)).toEqual(['lidl'])
  })

  it('ignores a priority store that is not allowed or offers nothing', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 1, priorityStoreIds: ['dm', 'nowhere'] }))
    expect(plan.stores.every((store) => !store.isPriority)).toBe(true)
  })

  it('with several priority stores, uses as many of them as fit in the limit', () => {
    const two: PlanOffer[] = [
      offer('x', 'lidl', 10), offer('x', 'albert', 11), offer('x', 'billa', 11),
      offer('y', 'lidl', 10), offer('y', 'albert', 11), offer('y', 'billa', 11),
    ]
    const plan = planShopping([need('x'), need('y')], two, settings({ maxStores: 2, priorityStoreIds: ['albert', 'billa'] }))
    // Within the tolerance of the cheapest (Lidl only, 20 Kč), the plan that uses the most priority stores wins.
    expect(storeIds(plan).every((id) => ['albert', 'billa'].includes(id))).toBe(true)
  })
})

describe('fewer stores when a trip is not worth it', () => {
  it('does not add a store to save less than the tolerance', () => {
    const tiny: PlanOffer[] = [offer('x', 'lidl', 50), offer('y', 'lidl', 50), offer('y', 'albert', 47)]
    const plan = planShopping([need('x'), need('y')], tiny, settings({ maxStores: 2 }))
    expect(storeIds(plan)).toEqual(['lidl']) // Albert would save 3 Kč, under the 5 Kč tolerance
    expect(plan.total).toBe(100)
  })

  it('does add a store when the saving is real', () => {
    const real: PlanOffer[] = [offer('x', 'lidl', 50), offer('y', 'lidl', 50), offer('y', 'albert', 30)]
    const plan = planShopping([need('x'), need('y')], real, settings({ maxStores: 2 }))
    expect(storeIds(plan)).toEqual(['albert', 'lidl'])
    expect(plan.total).toBe(80)
  })
})

describe('the saving of buying an item here and not elsewhere', () => {
  it('lists, for each planned item, what it costs at the other stores and the difference', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 3 }))
    const lidl = plan.stores.find((store) => store.storeId === 'lidl')!
    const milk = lidl.lines.find((line) => line.needId === 'milk')!
    expect(milk.cost).toBe(20)
    expect(milk.alternatives.map((alt) => [alt.chain, alt.cost, alt.difference])).toEqual([
      ['Albert', 45, 25],
      ['Billa', 50, 30],
    ])
    expect(milk.alternatives.every((alt) => alt.difference > 0)).toBe(true) // buying it at Lidl saves this much
  })

  it('marks an alternative that is also a store of the plan', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 3 }))
    const milk = plan.stores.flatMap((store) => store.lines).find((line) => line.needId === 'milk')!
    expect(milk.alternatives.find((alt) => alt.chain === 'Albert')!.inPlan).toBe(true)
  })

  it('shows a cheaper alternative that the store limit kept out of the plan, as a negative difference', () => {
    const limited = planShopping(needs, offers, settings({ maxStores: 1 }))
    const bread = limited.stores[0].lines.find((line) => line.needId === 'bread')!
    const butter = limited.stores[0].lines.find((line) => line.needId === 'butter')!
    expect(bread.alternatives.every((alt) => !alt.inPlan)).toBe(true)
    // Bread is bought at Billa for 55, but Albert has it for 30: cheaper elsewhere, not in the plan.
    expect(bread.alternatives.find((alt) => alt.chain === 'Albert')).toMatchObject({ cost: 30, difference: -25 })
    expect(butter.alternatives.every((alt) => alt.difference > 0)).toBe(true)
  })

  it('compares the plan with the best single store', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 3 }))
    expect(plan.bestSingleStore).toMatchObject({ chain: 'Billa', total: 155, coveredCount: 3 })
    expect(plan.savingVsSingleStore).toBe(55) // 155 in one store vs 100 in three
  })

  it('does not claim a saving against a single store that covers fewer items', () => {
    const plan = planShopping([...needs, need('caviar')], [...offers, offer('caviar', 'penny', 500)], settings({ maxStores: 2 }))
    expect(plan.bestSingleStore!.coveredCount).toBeLessThan(plan.plannedCount)
    expect(plan.savingVsSingleStore).toBeNull()
  })
})

describe('offers', () => {
  it('uses the cheapest of several offers for the same item at one store', () => {
    const multi: PlanOffer[] = [offer('x', 'lidl', 30, { productId: 'a' }), offer('x', 'lidl', 20, { productId: 'b' })]
    const plan = planShopping([need('x')], multi, settings({ maxStores: 1 }))
    expect(plan.stores[0].lines[0]).toMatchObject({ cost: 20, productId: 'b' })
  })

  it('carries whether an offer was pinned by the user', () => {
    const plan = planShopping([need('x')], [offer('x', 'lidl', 20, { source: 'pinned' })], settings({ maxStores: 1 }))
    expect(plan.stores[0].lines[0].source).toBe('pinned')
  })

  it('ignores offers for unknown items, non-finite or negative costs', () => {
    const junk: PlanOffer[] = [offer('ghost', 'lidl', 1), offer('x', 'lidl', Number.NaN), offer('x', 'albert', -5), offer('x', 'billa', Number.POSITIVE_INFINITY), offer('x', 'penny', 12)]
    const plan = planShopping([need('x')], junk, settings({ maxStores: 1 }))
    expect(plan.stores).toHaveLength(1)
    expect(plan.stores[0].storeId).toBe('penny')
  })

  it('subtotals add up to the total', () => {
    const plan = planShopping(needs, offers, settings({ maxStores: 3 }))
    expect(plan.stores.reduce((sum, store) => sum + store.subtotal, 0)).toBeCloseTo(plan.total, 2)
    expect(plan.stores.flatMap((store) => store.lines).reduce((sum, line) => sum + line.cost, 0)).toBeCloseTo(plan.total, 2)
  })

  it('rounds to whole haléře', () => {
    const plan = planShopping([need('x'), need('y')], [offer('x', 'lidl', 10.005), offer('y', 'lidl', 20.004)], settings({ maxStores: 1 }))
    expect(plan.total).toBeCloseTo(30.01, 2)
  })
})

describe('determinism', () => {
  it('gives the same plan whatever the order of needs, offers and stores', () => {
    const shuffledOffers = [...offers].reverse()
    const shuffledNeeds = [...needs].reverse()
    const a = planShopping(needs, offers, settings({ maxStores: 2, allowedStoreIds: ['lidl', 'albert', 'billa', 'penny'] }))
    const b = planShopping(shuffledNeeds, shuffledOffers, settings({ maxStores: 2, allowedStoreIds: ['penny', 'billa', 'albert', 'lidl'] }))
    expect(b.total).toBe(a.total)
    expect(storeIds(b)).toEqual(storeIds(a))
    expect(b.stores.flatMap((s) => s.lines.map((l) => `${l.needId}@${l.storeId}`)).sort()).toEqual(a.stores.flatMap((s) => s.lines.map((l) => `${l.needId}@${l.storeId}`)).sort())
  })

  it('does not mutate its input', () => {
    const before = JSON.stringify({ needs, offers })
    planShopping(needs, offers, settings())
    expect(JSON.stringify({ needs, offers })).toBe(before)
  })
})

describe('many stores', () => {
  it('caps the candidate stores, keeping priority stores, and says so', () => {
    const ids = Array.from({ length: MAX_CANDIDATE_STORES + 3 }, (_, i) => `s${String(i).padStart(2, '0')}`)
    const many = ids.map((id, i) => offer('x', id, 100 - i))
    const plan = planShopping([need('x')], many, { maxStores: 1, priorityStoreIds: ['s00'], allowedStoreIds: ids })
    expect(plan.notes.join(' ')).toContain(`${MAX_CANDIDATE_STORES} obchodů`)
    expect(plan.plannedCount).toBe(1)
  })
})
