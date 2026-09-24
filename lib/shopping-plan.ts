// Shopping planner: where to buy what, using at most N stores, for the least money.
//
// Pure and deterministic (CLAUDE.md sections 5 and 19): given what each item costs at each store, it
// picks which stores to go to and what to buy at each, and explains what a different choice would
// cost. No database, no clock, no randomness — the same input always gives the same plan.
//
// The rules, agreed with the owner:
//  - At most `maxStores` stores. A basket split over many stores is not wanted, so the limit is real.
//  - The plan is the cheapest way to buy the items in at most that many stores. An item that no
//    chosen store offers is reported, never priced with a made-up number.
//  - Priority stores are preferred until the price difference is large: among plans within a small
//    tolerance of the cheapest, the one using the most priority stores wins, then the one with fewer
//    stores (no trip for a few crowns), then the cheaper. Beyond the tolerance price decides.
//  - For every item the plan says what it would cost at the other stores, so the saving of buying it
//    here rather than there is visible.

/** What buying one item costs at one store, for the quantity the item needs. */
export type PlanOffer = {
  needId: string
  storeId: string
  chain: string
  productId: string
  productName: string
  /** What the needed quantity costs at this store (already reflects a promotion). */
  cost: number
  /** Where the offer comes from: the user pinned this product, or it was picked automatically. */
  source: 'pinned' | 'auto'
}

export type PlanNeed = { id: string; name: string }

export type PlanSettings = {
  /** How many stores the user is willing to visit for this shop (≥ 1). */
  maxStores: number
  /** Stores to prefer (`stores.id`). Ignored when not among the allowed stores. */
  priorityStoreIds: string[]
  /** Stores that may be used at all, e.g. the user's "stores in my area". */
  allowedStoreIds: string[]
  /** How much dearer than the cheapest plan a plan may be and still win by using priority stores or
   *  fewer stores: the larger of `absolute` (Kč) and `relative` × the cheapest total. */
  tolerance?: { absolute: number; relative: number }
}

export const DEFAULT_TOLERANCE = { absolute: 5, relative: 0.03 }

/** More candidate stores than this and the search over store combinations would grow needlessly
 *  (C(12, ≤6) is under 2 500 combinations); the excess is dropped, priority stores first. */
export const MAX_CANDIDATE_STORES = 12

export type PlannedLine = {
  needId: string
  name: string
  storeId: string
  chain: string
  productId: string
  productName: string
  cost: number
  source: 'pinned' | 'auto'
  /** What the same item costs at each other allowed store that offers it, cheapest first.
   *  `difference` is that store's cost minus this line's cost: positive = dearer there (the saving of
   *  buying it here), negative = cheaper there (but not in the plan). */
  alternatives: { storeId: string; chain: string; productName: string; cost: number; difference: number; inPlan: boolean }[]
}

export type PlannedStore = { storeId: string; chain: string; isPriority: boolean; lines: PlannedLine[]; subtotal: number }

export type UnplannedNeed = {
  needId: string
  name: string
  /** Allowed stores that do offer it (empty: nowhere in the user's stores) — but not in the plan. */
  availableAt: { storeId: string; chain: string; cost: number }[]
}

export type ShoppingPlan = {
  stores: PlannedStore[]
  unplanned: UnplannedNeed[]
  /** Total of the planned lines. */
  total: number
  plannedCount: number
  needCount: number
  /** The best plan using a single store (most items covered, then cheapest); null when no store offers anything. */
  bestSingleStore: { storeId: string; chain: string; total: number; coveredCount: number } | null
  /** What the plan saves against the best single store, when both cover the same items; null otherwise. */
  savingVsSingleStore: number | null
  /** The floor: every planned item at its cheapest allowed store, no store limit. */
  cheapestPossible: { total: number; storeCount: number }
  /** How much more the store limit costs than that floor, for the items in the plan (≥ 0). */
  costOfStoreLimit: number
  /** How much more the plan costs than the cheapest plan because priority stores were preferred (≥ 0). */
  costOfPriority: number
  /** Whether the settings had to be adjusted (see `notes`). */
  notes: string[]
}

const cents = (value: number) => Math.round(value * 100) / 100

type Evaluation = {
  storeIds: string[]
  covered: number
  cost: number
  /** For each covered need, the chosen offer. */
  picks: Map<string, PlanOffer>
}

/** All combinations of `size` items of `items`, in a stable order. */
function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  const current: T[] = []
  const walk = (start: number) => {
    if (current.length === size) {
      result.push([...current])
      return
    }
    for (let index = start; index < items.length; index++) {
      current.push(items[index])
      walk(index + 1)
      current.pop()
    }
  }
  walk(0)
  return result
}

/** Builds the plan. See the file header for the rules. */
export function planShopping(needs: PlanNeed[], offers: PlanOffer[], settings: PlanSettings): ShoppingPlan {
  const tolerance = settings.tolerance ?? DEFAULT_TOLERANCE
  const notes: string[] = []
  const needIds = new Set(needs.map((need) => need.id))
  const nameOf = new Map(needs.map((need) => [need.id, need.name]))
  const allowed = new Set(settings.allowedStoreIds)

  // The cheapest offer per need and store (a need may have several offers at one store).
  const best = new Map<string, Map<string, PlanOffer>>() // needId -> storeId -> offer
  const chainOf = new Map<string, string>()
  for (const offer of offers) {
    if (!needIds.has(offer.needId) || !allowed.has(offer.storeId) || !Number.isFinite(offer.cost) || offer.cost < 0) continue
    chainOf.set(offer.storeId, offer.chain)
    const perStore = best.get(offer.needId) ?? new Map<string, PlanOffer>()
    const existing = perStore.get(offer.storeId)
    if (!existing || offer.cost < existing.cost || (offer.cost === existing.cost && offer.productId < existing.productId)) perStore.set(offer.storeId, offer)
    best.set(offer.needId, perStore)
  }

  const priority = new Set(settings.priorityStoreIds.filter((id) => chainOf.has(id)))
  // Candidate stores: those that offer anything; over the cap, priority stores first, then the ones
  // that cover the most needs, then by id for a stable order.
  const coverageOf = (storeId: string) => needs.filter((need) => best.get(need.id)?.has(storeId)).length
  let candidates = [...chainOf.keys()].sort((a, b) => a.localeCompare(b))
  if (candidates.length > MAX_CANDIDATE_STORES) {
    candidates = [...candidates]
      .sort((a, b) => Number(priority.has(b)) - Number(priority.has(a)) || coverageOf(b) - coverageOf(a) || a.localeCompare(b))
      .slice(0, MAX_CANDIDATE_STORES)
      .sort((a, b) => a.localeCompare(b))
    notes.push(`Zohledněno je jen ${MAX_CANDIDATE_STORES} obchodů, ostatní byly vynechány.`)
  }

  const requested = Math.floor(settings.maxStores)
  if (!Number.isFinite(requested) || requested < 1) notes.push('Počet obchodů musí být alespoň 1, použit byl 1 obchod.')
  const maxStores = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), Math.max(candidates.length, 1))

  const evaluate = (storeIds: string[]): Evaluation => {
    const picks = new Map<string, PlanOffer>()
    let cost = 0
    for (const need of needs) {
      let pick: PlanOffer | undefined
      for (const storeId of storeIds) {
        const offer = best.get(need.id)?.get(storeId)
        if (offer && (!pick || offer.cost < pick.cost || (offer.cost === pick.cost && offer.storeId < pick.storeId))) pick = offer
      }
      if (pick) {
        picks.set(need.id, pick)
        cost += pick.cost
      }
    }
    return { storeIds, covered: picks.size, cost: cents(cost), picks }
  }

  // Every combination of 1..maxStores candidate stores.
  const evaluations: Evaluation[] = []
  for (let size = 1; size <= maxStores; size++) for (const subset of combinations(candidates, size)) evaluations.push(evaluate(subset))

  const emptyPlan: ShoppingPlan = {
    stores: [],
    unplanned: needs.map((need) => ({ needId: need.id, name: need.name, availableAt: [] })),
    total: 0,
    plannedCount: 0,
    needCount: needs.length,
    bestSingleStore: null,
    savingVsSingleStore: null,
    cheapestPossible: { total: 0, storeCount: 0 },
    costOfStoreLimit: 0,
    costOfPriority: 0,
    notes,
  }
  if (evaluations.length === 0 || evaluations.every((evaluation) => evaluation.covered === 0)) return emptyPlan

  // The cheapest plan: cover the most items, then spend the least (fewer stores, then ids, break ties).
  const compareCheapest = (a: Evaluation, b: Evaluation) =>
    b.covered - a.covered || a.cost - b.cost || a.storeIds.length - b.storeIds.length || a.storeIds.join('|').localeCompare(b.storeIds.join('|'))
  const cheapest = [...evaluations].sort(compareCheapest)[0]

  // Among plans that cover as much and cost at most a little more, prefer priority stores, then
  // fewer stores, then the cheaper one.
  const window = Math.max(tolerance.absolute, tolerance.relative * cheapest.cost)
  const priorityCount = (evaluation: Evaluation) => evaluation.storeIds.filter((id) => priority.has(id)).length
  const chosen = [...evaluations]
    .filter((evaluation) => evaluation.covered === cheapest.covered && evaluation.cost <= cheapest.cost + window + 1e-9)
    .sort(
      (a, b) =>
        priorityCount(b) - priorityCount(a) ||
        a.storeIds.length - b.storeIds.length ||
        a.cost - b.cost ||
        a.storeIds.join('|').localeCompare(b.storeIds.join('|')),
    )[0]

  // Stores actually used (a chosen store that ends up with no items is not a trip).
  const usedStoreIds = [...new Set([...chosen.picks.values()].map((offer) => offer.storeId))]

  const stores: PlannedStore[] = usedStoreIds
    .map((storeId): PlannedStore => {
      const lines: PlannedLine[] = needs
        .filter((need) => chosen.picks.get(need.id)?.storeId === storeId)
        .map((need) => {
          const offer = chosen.picks.get(need.id) as PlanOffer
          const alternatives = [...(best.get(need.id) ?? new Map<string, PlanOffer>()).values()]
            .filter((other) => other.storeId !== storeId)
            .map((other) => ({
              storeId: other.storeId,
              chain: other.chain,
              productName: other.productName,
              cost: cents(other.cost),
              difference: cents(other.cost - offer.cost),
              inPlan: usedStoreIds.includes(other.storeId),
            }))
            .sort((a, b) => a.cost - b.cost || a.chain.localeCompare(b.chain, 'cs'))
          return {
            needId: need.id,
            name: need.name,
            storeId,
            chain: offer.chain,
            productId: offer.productId,
            productName: offer.productName,
            cost: cents(offer.cost),
            source: offer.source,
            alternatives,
          }
        })
      return { storeId, chain: chainOf.get(storeId) ?? '', isPriority: priority.has(storeId), lines, subtotal: cents(lines.reduce((sum, line) => sum + line.cost, 0)) }
    })
    .sort((a, b) => b.subtotal - a.subtotal || a.chain.localeCompare(b.chain, 'cs'))

  const unplanned: UnplannedNeed[] = needs
    .filter((need) => !chosen.picks.has(need.id))
    .map((need) => ({
      needId: need.id,
      name: need.name,
      availableAt: [...(best.get(need.id) ?? new Map<string, PlanOffer>()).values()]
        .map((offer) => ({ storeId: offer.storeId, chain: offer.chain, cost: cents(offer.cost) }))
        .sort((a, b) => a.cost - b.cost || a.chain.localeCompare(b.chain, 'cs')),
    }))

  const total = cents(stores.reduce((sum, store) => sum + store.subtotal, 0))

  // Best single store for comparison: most items covered, then cheapest.
  const singles = evaluations.filter((evaluation) => evaluation.storeIds.length === 1)
  const single = [...singles].sort(compareCheapest)[0]
  const bestSingleStore = single && single.covered > 0 ? { storeId: single.storeIds[0], chain: chainOf.get(single.storeIds[0]) ?? '', total: single.cost, coveredCount: single.covered } : null

  // The floor for the items the plan covers: each at its cheapest allowed store, no store limit.
  const plannedNeedIds = new Set(chosen.picks.keys())
  let floorTotal = 0
  const floorStores = new Set<string>()
  for (const need of needs) {
    if (!plannedNeedIds.has(need.id)) continue
    const offersFor = [...(best.get(need.id) ?? new Map<string, PlanOffer>()).values()]
    const cheapestOffer = offersFor.sort((a, b) => a.cost - b.cost || a.storeId.localeCompare(b.storeId))[0]
    floorTotal += cheapestOffer.cost
    floorStores.add(cheapestOffer.storeId)
  }

  return {
    stores,
    unplanned,
    total,
    plannedCount: chosen.picks.size,
    needCount: needs.length,
    bestSingleStore,
    savingVsSingleStore: bestSingleStore && bestSingleStore.coveredCount === chosen.covered ? cents(bestSingleStore.total - total) : null,
    cheapestPossible: { total: cents(floorTotal), storeCount: floorStores.size },
    costOfStoreLimit: Math.max(0, cents(total - floorTotal)),
    costOfPriority: Math.max(0, cents(total - cheapest.cost)),
    notes,
  }
}
