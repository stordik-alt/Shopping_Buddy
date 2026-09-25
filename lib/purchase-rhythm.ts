import { normalizeMatchName } from '@/lib/receipt-list-match'
import type { ItemUnit, PurchaseRecord } from '@/lib/types'

// How often the household buys each thing, from its own recorded purchases (CLAUDE.md section 24 —
// never inferred from prices). Shared by "Doplnit obvyklé" (lib/usual-items.ts) and the pantry's
// "asi došlo" estimate (lib/pantry-estimate.ts), so both read the same rhythm. Purchase lines are
// grouped by normalized name, the only identity a purchase line carries on the client.

/** Purchases older than this are ignored: habits change, and a year-old pattern is not "usual". */
export const RHYTHM_WINDOW_DAYS = 120
/** At least this many purchases on different days, i.e. at least two intervals to take a median of. */
export const MIN_PURCHASE_DAYS = 3

export type PurchaseRhythm = {
  /** The most recent spelling of the name. */
  name: string
  /** Distinct purchase days (day numbers), ascending. */
  days: number[]
  /** Median days between purchases; null with fewer than MIN_PURCHASE_DAYS purchase days. */
  intervalDays: number | null
  /** Amounts bought, keyed "quantity unit". */
  amounts: Map<string, { quantity: number; unit: ItemUnit; count: number; lastDay: number }>
}

/** Days since the Unix epoch of a `YYYY-MM-DD…` date — whole days, time of day ignored. */
export function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Every item bought in the window before `today`, keyed by normalized name. */
export function purchaseRhythms(purchases: PurchaseRecord[], today: string): Map<string, PurchaseRhythm> {
  const todayNumber = dayNumber(today)
  const groups = new Map<string, { name: string; latestDay: number; days: Set<number>; amounts: PurchaseRhythm['amounts'] }>()
  for (const purchase of purchases) {
    const day = dayNumber(purchase.date)
    if (day > todayNumber || todayNumber - day > RHYTHM_WINDOW_DAYS) continue
    for (const item of purchase.items) {
      const key = normalizeMatchName(item.name)
      if (!key) continue
      const group = groups.get(key) ?? { name: item.name, latestDay: day, days: new Set<number>(), amounts: new Map() }
      if (day >= group.latestDay) {
        group.latestDay = day
        group.name = item.name
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
  const rhythms = new Map<string, PurchaseRhythm>()
  for (const [key, group] of groups) {
    const days = [...group.days].sort((a, b) => a - b)
    const intervalDays = days.length >= MIN_PURCHASE_DAYS ? median(days.slice(1).map((day, index) => day - days[index])) : null
    rhythms.set(key, { name: group.name, days, intervalDays, amounts: group.amounts })
  }
  return rhythms
}
