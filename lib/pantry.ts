import type { ItemCategory, PantryItem, PantryLocation } from '@/lib/types'

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

// Keyword heuristic for splitting "Potraviny" between the fridge, freezer and pantry shelf —
// placeholder, same spirit as CHECKIN_DAYS_BY_CATEGORY above: there's no real per-product
// storage-requirement data yet, so a small, deliberately conservative Czech keyword list stands in
// until there is. Substring match on the lowercased name.
const FROZEN_KEYWORDS = ['mražen', 'zmrzlina']
const CHILLED_KEYWORDS = ['mléko', 'mléčný', 'jogurt', 'kefír', 'sýr', 'máslo', 'smetana', 'tvaroh', 'šunka', 'salám', 'párky', 'vejce', 'maso', 'kuřecí', 'vepřové', 'hovězí', 'losos', 'ryba']
const PANTRY_KEYWORDS = ['rýže', 'těstoviny', 'mouka', 'cukr', 'sůl', 'konzerv', 'olej', 'ocet', 'cereál', 'sušenky', 'trvanl', 'voda', 'nápoj']

/** Where a purchased item should land in the pantry — confidently, or `null` when it genuinely
 *  can't be determined without guessing (per the owner's explicit "NEHÁDEJ" rule for receipt
 *  import: an unrecognized storage location must go to manual review, never a silent default).
 *  Non-food categories go straight to "Domácnost" (cleaning/hygiene/household supplies); food is
 *  split into frozen/chilled/shelf-stable by keyword, and a `Potraviny` item matching none of the
 *  three lists — or a catch-all `Ostatní` item, whose category itself was already uncertain — is
 *  `null`, not a guessed default. Only used to seed a *new* pantry row — an existing row's location
 *  is never re-inferred on restock, so a manual move (e.g. chilled meat into the freezer) sticks. */
export function inferPantryLocation(category: ItemCategory, name: string): PantryLocation | null {
  if (category === 'Drogerie' || category === 'Děti' || category === 'Domácnost') return 'Domácnost'
  if (category !== 'Potraviny') return null // 'Ostatní' — the category itself was already unclear
  const normalized = name.trim().toLowerCase()
  if (FROZEN_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'Mrazák'
  if (CHILLED_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'Lednice'
  if (PANTRY_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'Spíž'
  return null
}

/** How much of a product the household currently has, per its real pantry data — case/whitespace-
 *  insensitive name match, same philosophy as `lib/products.ts`'s `matchProductByName()`. 0 when
 *  there's no matching pantry row, which is a genuine "none in stock" rather than an error. */
export function pantryQuantityFor(pantryItems: PantryItem[], productName: string): number {
  const normalized = productName.trim().toLowerCase()
  const match = pantryItems.find((item) => item.name.trim().toLowerCase() === normalized)
  return match?.quantity ?? 0
}
