import { dayNumber, purchaseRhythms, type PurchaseRhythm } from '@/lib/purchase-rhythm'
import { normalizeSearchText } from '@/lib/product-search'
import { normalizeMatchName } from '@/lib/receipt-list-match'
import { isDueForCheckin } from '@/lib/pantry'
import type { PantryItem, PurchaseRecord } from '@/lib/types'

// "Asi došlo": which pantry items the household has probably used up, so a check can offer them
// already marked "Došlo" and the household only confirms. Deterministic, never AI (CLAUDE.md
// sections 22 and 30), and never acted on silently — an estimate only pre-fills a check the
// household saves; nothing is removed without them.
//
// Two sources, the first that applies wins:
//  1. The household's own rhythm: an item bought on 3+ different days in the last 120 days
//     (lib/purchase-rhythm.ts) is probably gone once its usual interval has passed since it was
//     last restocked or confirmed ("Ještě mám" restarts the clock).
//  2. A short shelf life by kind — only for fresh food in the fridge or on the shelf, where the
//     answer is not in doubt (bread in days, milk in a week). Placeholder values in the same spirit
//     as CHECKIN_DAYS_BY_CATEGORY in lib/pantry.ts; anything not listed gets no estimate rather
//     than a guess, and frozen food never does.

export type ConsumptionEstimate = {
  /** The usual time the item lasts, in days. */
  days: number
  basis: 'rhythm' | 'shelf-life'
  /** Days since the item was last restocked or confirmed. */
  age: number
  likelyGone: boolean
}

/** Fresh food by how long it usually lasts, matched at the start of a word of the normalized name.
 *  Deliberately short and unambiguous: "trvanlivé" (long-life) products are excluded below. */
const SHELF_LIFE: { days: number; stems: string[] }[] = [
  { days: 3, stems: ['rohlik', 'chleb', 'bageta', 'bagety', 'houska', 'housky', 'kobliha', 'croissant', 'kaiserk', 'veka', 'pecivo'] },
  { days: 3, stems: ['mlete maso', 'kureci prsa', 'kureci stehna', 'kure ', 'vepr', 'hovezi', 'losos', 'pstruh', 'ryba'] },
  { days: 7, stems: ['mleko', 'jogurt', 'kefir', 'smetana', 'tvaroh', 'zakys', 'podmasli', 'salat', 'spenat', 'rajc', 'okurk', 'paprik', 'jahod', 'maliny', 'boruvk', 'hrozn', 'banan', 'broskv', 'avokad'] },
]
const LONG_LIFE = ['trvanl', 'uht', 'susen', 'sterilizovan', 'konzerv', 'mrazen']

/** The shelf life of a fresh food, or null when it is not clearly one. */
export function shelfLifeDays(item: Pick<PantryItem, 'name' | 'category' | 'location'>): number | null {
  if (item.category !== 'Potraviny' || item.location === 'Mrazák') return null
  const name = ` ${normalizeSearchText(item.name).replace(/[^a-z0-9%]+/g, ' ').trim()} `
  if (LONG_LIFE.some((stem) => name.includes(stem))) return null
  for (const { days, stems } of SHELF_LIFE) {
    if (stems.some((stem) => name.includes(` ${stem}`))) return days
  }
  return null
}

/** The estimate for one item; null when there is nothing to base one on. */
export function estimateConsumption(
  item: Pick<PantryItem, 'name' | 'category' | 'location' | 'addedAt' | 'quantity'>,
  rhythm: PurchaseRhythm | undefined,
  today: string,
): ConsumptionEstimate | null {
  const age = dayNumber(today) - dayNumber(item.addedAt)
  if (age < 0) return null
  const fromRhythm = rhythm?.intervalDays ?? null
  const shelf = fromRhythm === null ? shelfLifeDays(item) : null
  const days = fromRhythm ?? shelf
  if (days === null) return null
  return { days, basis: fromRhythm !== null ? 'rhythm' : 'shelf-life', age, likelyGone: item.quantity <= 0 || age >= days }
}

/** Estimates for a whole pantry, keyed by pantry item id (items without an estimate are absent). */
export function estimatePantry(items: PantryItem[], purchases: PurchaseRecord[], today: string): Map<string, ConsumptionEstimate> {
  const rhythms = purchaseRhythms(purchases, today)
  const estimates = new Map<string, ConsumptionEstimate>()
  for (const item of items) {
    const estimate = estimateConsumption(item, rhythms.get(normalizeMatchName(item.name)), today)
    if (estimate) estimates.set(item.id, estimate)
  }
  return estimates
}

/** Why an item is thought to be gone, for the check: "kupujete zhruba každých 7 dní". */
export function estimateReason(estimate: ConsumptionEstimate): string {
  const days = Math.max(1, Math.round(estimate.days))
  const few = days >= 2 && days <= 4
  if (estimate.basis === 'shelf-life') return `vydrží obvykle ${days} ${days === 1 ? 'den' : few ? 'dny' : 'dní'}`
  return days === 1 ? 'kupujete zhruba každý den' : `kupujete zhruba ${few ? 'každé' : 'každých'} ${days} ${few ? 'dny' : 'dní'}`
}

// --- Weekly check -----------------------------------------------------------------------------
//
// Instead of a nudge whenever some category's check-in interval runs out, the household gets one
// notification a week (the pantry-checkin cron) listing what to check: items the check-in is due to
// ask about (lib/pantry.ts isDueForCheckin) and items probably used up. Its link opens the check
// with only those items, the used-up ones pre-marked, so the usual answer is a single "Uložit".

/** The items the weekly check asks about, probably-used-up first, then by name. */
export function selectForWeeklyCheck(items: PantryItem[], purchases: PurchaseRecord[], today: string, now: Date): PantryItem[] {
  const estimates = estimatePantry(items, purchases, today)
  const likelyGone = (item: PantryItem) => estimates.get(item.id)?.likelyGone === true
  return items
    .filter((item) => likelyGone(item) || isDueForCheckin({ category: item.category, addedAt: new Date(item.addedAt), askedAt: item.askedAt ? new Date(item.askedAt) : null }, now))
    .sort((a, b) => Number(likelyGone(b)) - Number(likelyGone(a)) || a.name.localeCompare(b.name, 'cs'))
}

/** The weekly notification's text for the selected items (at least one). */
export function weeklyCheckMessage(names: string[]): { title: string; detail: string } {
  const shown = names.slice(0, 5).join(', ')
  const rest = names.length - 5
  const more = rest <= 0 ? '' : rest <= 4 ? ` a další ${rest}` : ` a dalších ${rest}`
  return { title: 'Kontrola zásob', detail: `Došlo, nebo ještě máte? ${shown}${more}. Stačí potvrdit, zabere to chvilku.` }
}
