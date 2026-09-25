import { normalizeMatchName } from '@/lib/receipt-list-match'
import type { ItemUnit, PurchaseRecord } from '@/lib/types'

// "Doplnit obvyklé": items the household buys regularly that are due again and not on the list.
// Deterministic and built only from the household's own recorded purchases (CLAUDE.md section 24 —
// never inferred from prices). Items are grouped by their normalized name, the only identity a
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

/** Purchases older than this are ignored: habits change, and a year-old pattern is not "usual". */
const WINDOW_DAYS = 120
/** At least this many purchases on different days, i.e. at least two intervals to take a median of. */
const MIN_PURCHASE_DAYS = 3
/** Due once this share of the usual interval has passed — a few days early is more useful than late. */
const DUE_FACTOR = 0.8
const DEFAULT_LIMIT = 8

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

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

  type Group = { name: string; latestDay: number; days: Set<number>; amounts: Map<string, { quantity: number; unit: ItemUnit; count: number; lastDay: number }> }
  const groups = new Map<string, Group>()

  for (const purchase of input.purchases) {
    const day = dayNumber(purchase.date)
    if (day > today || today - day > WINDOW_DAYS) continue
    for (const item of purchase.items) {
      const key = normalizeMatchName(item.name)
      if (!key || skip.has(key)) continue
      const group = groups.get(key) ?? { name: item.name, latestDay: day, days: new Set<number>(), amounts: new Map() }
      if (day >= group.latestDay) {
        group.latestDay = day
        group.name = item.name // the most recent spelling is shown
      }
      group.days.add(day)
      const amountKey = `${item.quantity} ${item.unit}`
      const amount = group.amounts.get(amountKey) ?? { quantity: item.quantity, unit: item.unit, count: 0, lastDay: day }
      amount.count += 1
      amount.lastDay = Math.max(amount.lastDay, day)
      group.amounts.set(amountKey, amount)
      groups.set(key, group)
    }
  }

  const suggestions: (UsualItem & { overdue: number })[] = []
  for (const group of groups.values()) {
    if (group.days.size < MIN_PURCHASE_DAYS) continue
    const days = [...group.days].sort((a, b) => a - b)
    const intervalDays = median(days.slice(1).map((day, index) => day - days[index]))
    const daysSinceLast = today - days[days.length - 1]
    if (daysSinceLast < intervalDays * DUE_FACTOR) continue
    // The amount bought most often; on a tie, the one bought most recently.
    const amount = [...group.amounts.values()].sort((a, b) => b.count - a.count || b.lastDay - a.lastDay)[0]
    suggestions.push({
      name: group.name,
      quantity: amount.quantity,
      unit: amount.unit,
      intervalDays,
      daysSinceLast,
      timesBought: group.days.size,
      overdue: daysSinceLast / intervalDays,
    })
  }

  return suggestions
    .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name, 'cs'))
    .slice(0, input.limit ?? DEFAULT_LIMIT)
    .map(({ overdue: _overdue, ...item }) => item)
}
