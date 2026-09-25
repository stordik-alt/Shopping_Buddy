import type { PricePoint } from '@/lib/prices'

// The regular-price history of one product at one store, reduced to the dates the price actually
// changed — the shape a small trend line needs. Built only from recorded observations
// (`priceHistory`, CLAUDE.md section 16); nothing is interpolated or estimated. Repeated daily
// confirmations of the same price collapse into one step.

export type PriceStep = { date: string; price: number }

export function priceSteps(point: PricePoint): PriceStep[] {
  const observations = [...(point.priceHistory ?? []), { price: point.regularPrice, recordedAt: point.recordedAt }]
    .map((observation) => ({ date: observation.recordedAt.slice(0, 10), price: observation.price }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const steps: PriceStep[] = []
  for (const observation of observations) {
    const last = steps[steps.length - 1]
    if (last && last.date === observation.date) {
      last.price = observation.price // two observations on one day: the later one counts
      continue
    }
    if (last && last.price === observation.price) continue
    steps.push({ ...observation })
  }
  // A same-day overwrite can leave two equal neighbours; merge them.
  return steps.filter((step, index) => index === 0 || step.price !== steps[index - 1].price)
}

/** Lowest and highest recorded regular price, and whether the current one is the lowest. `null`
 *  when the price never changed — there is no trend to show then. */
export function priceTrendSummary(steps: PriceStep[]): { min: number; max: number; current: number; atLowest: boolean } | null {
  if (steps.length < 2) return null
  const prices = steps.map((step) => step.price)
  const min = Math.min(...prices)
  const current = prices[prices.length - 1]
  return { min, max: Math.max(...prices), current, atLowest: current === min }
}
