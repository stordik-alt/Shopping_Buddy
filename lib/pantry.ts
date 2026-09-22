import type { ItemCategory } from '@/lib/types'

/** How many days a pantry item can go unconfirmed before the household gets asked "do you still
 *  have this?" — per category, since shelf life genuinely differs (milk vs. rice), but there's no
 *  real per-product shelf-life data to be more precise than that yet. Placeholder defaults,
 *  expected to be tuned later once real usage shows whether they're right — per the product
 *  owner's explicit call to start per-category and refine later rather than invent shelf-life
 *  data now. */
export const CHECKIN_DAYS_BY_CATEGORY: Record<ItemCategory, number> = {
  Potraviny: 10,
  Drogerie: 30,
  Děti: 21,
  Domácnost: 30,
  Ostatní: 14,
}

export type PantryCheckinCandidate = {
  category: ItemCategory
  addedAt: Date
  askedAt: Date | null
}

/** Whether it's time to ask the household "do you still have this?" — once per category's
 *  check-in interval, counted from whichever is more recent: when the item was added/restocked,
 *  or when it was last asked about. Re-asks periodically rather than only once, since a pantry
 *  item left unconfirmed forever isn't useful — unlike a shopping reminder, this isn't a
 *  one-time event. */
export function isDueForCheckin(item: PantryCheckinCandidate, now: Date): boolean {
  const intervalMs = CHECKIN_DAYS_BY_CATEGORY[item.category] * 86_400_000
  if (now.getTime() - item.addedAt.getTime() < intervalMs) return false
  if (item.askedAt === null) return true
  return now.getTime() - item.askedAt.getTime() >= intervalMs
}

/** Candidates that are due for a check-in right now. */
export function findDueForCheckin<T extends PantryCheckinCandidate>(items: T[], now: Date): T[] {
  return items.filter((item) => isDueForCheckin(item, now))
}
