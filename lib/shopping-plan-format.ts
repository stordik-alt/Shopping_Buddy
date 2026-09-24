import { money } from '@/lib/format'
import type { PlannedLine, ShoppingPlan } from '@/lib/shopping-plan'

// Words for the shopping plan: what buying an item here rather than elsewhere saves, and what the
// plan as a whole saves or costs. Kept apart from the component so the sentences — and the sign
// conventions behind them — are testable.

/** One line about an alternative for a planned item, or `null` when there is nothing worth saying.
 *  `difference` is the alternative's cost minus the planned cost: positive = dearer there. */
export function alternativeLabel(alt: PlannedLine['alternatives'][number]): string | null {
  const amount = Math.abs(alt.difference)
  if (amount < 0.005) return `${alt.chain}: stejná cena`
  if (alt.difference > 0) return `${alt.chain}: o ${money(amount)} dráž`
  return alt.inPlan ? `${alt.chain}: o ${money(amount)} levněji (kupujete tam jiné položky)` : `${alt.chain}: o ${money(amount)} levněji, ale není v plánu`
}

/** The alternatives worth showing for a line: at most `limit`, dearer ones first (the saving of
 *  buying here), then cheaper ones that the plan left out. */
export function alternativesToShow(line: PlannedLine, limit = 3): PlannedLine['alternatives'] {
  const dearer = line.alternatives.filter((alt) => alt.difference >= 0)
  const cheaper = line.alternatives.filter((alt) => alt.difference < 0)
  return [...dearer, ...cheaper].slice(0, limit)
}

/** The plan's headline facts as sentences, only those that are true and non-trivial. */
export function planInsights(plan: ShoppingPlan): string[] {
  const insights: string[] = []
  const single = plan.bestSingleStore
  if (single && plan.savingVsSingleStore != null && plan.savingVsSingleStore >= 0.5 && plan.stores.length > 1) {
    insights.push(`Oproti nákupu všeho v jednom obchodě (${single.chain}) ušetříte ${money(plan.savingVsSingleStore)}.`)
  }
  if (plan.costOfStoreLimit >= 0.5) {
    insights.push(`Omezení počtu obchodů stojí ${money(plan.costOfStoreLimit)} oproti nákupu bez omezení (${plan.cheapestPossible.storeCount} ${storeWord(plan.cheapestPossible.storeCount)}, ${money(plan.cheapestPossible.total)}).`)
  }
  if (plan.costOfPriority >= 0.5) {
    insights.push(`Přednost prioritních obchodů stojí ${money(plan.costOfPriority)} oproti nejlevnějšímu plánu.`)
  }
  return insights
}

function storeWord(count: number): string {
  return count === 1 ? 'obchod' : count >= 2 && count <= 4 ? 'obchody' : 'obchodů'
}
