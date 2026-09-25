import { dayNumber, purchaseRhythms } from '@/lib/purchase-rhythm'
import { normalizeMatchName } from '@/lib/receipt-list-match'
import type { ItemUnit, PurchaseRecord } from '@/lib/types'

// "Doplnit obvyklé": items the household buys regularly that are due again and not on the list.
// Deterministic and built only from the household's own recorded purchases (lib/purchase-rhythm.ts,
// CLAUDE.md section 24 — never inferred from prices). Items are grouped by their normalized name, the only identity a
// purchase line carries on the client; this is a suggestion the user confirms, not a price
// comparison, so name grouping is acceptable here (CLAUDE.md section 12 is about price identity).

export type UsualItem = {
  name: string
  quantity: number
  unit: ItemUnit
  /** Median number of days between purchases. */
  intervalDays: number
  daysSinceLast: number
  timesBought: number
}

/** Due once this share of the usual interval has passed — a few days early is more useful than late. */
const DUE_FACTOR = 0.8
const DEFAULT_LIMIT = 8

export function suggestUsualItems(input: {
  purchases: PurchaseRecord[]
  /** `YYYY-MM-DD`, the household's today. */
  today: string
  /** Names of items still to buy on the list — never suggested again. */
  onList: string[]
  /** Names of items the household has at home (pantry) — not suggested either. */
  inPantry: string[]
  limit?: number
}): UsualItem[] {
  const today = dayNumber(input.today)
  const skip = new Set([...input.onList, ...input.inPantry].map(normalizeMatchName))

  const suggestions: (UsualItem & { overdue: number })[] = []
  for (const [key, rhythm] of purchaseRhythms(input.purchases, input.today)) {
    if (skip.has(key) || rhythm.intervalDays === null) continue
    const { intervalDays, days } = rhythm
    const daysSinceLast = today - days[days.length - 1]
    if (daysSinceLast < intervalDays * DUE_FACTOR) continue
    // The amount bought most often; on a tie, the one bought most recently.
    const amount = [...rhythm.amounts.values()].sort((a, b) => b.count - a.count || b.lastDay - a.lastDay)[0]
    suggestions.push({
      name: rhythm.name,
      quantity: amount.quantity,
      unit: amount.unit,
      intervalDays,
      daysSinceLast,
      timesBought: days.length,
      overdue: daysSinceLast / intervalDays,
    })
  }

  return suggestions
    .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name, 'cs'))
    .slice(0, input.limit ?? DEFAULT_LIMIT)
    .map(({ overdue: _overdue, ...item }) => item)
}
