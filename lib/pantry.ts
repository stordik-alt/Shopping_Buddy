import { normalizeSearchText } from '@/lib/product-search'
import { matchKey } from '@/lib/receipt-list-match'
import type { ItemCategory, PantryItem, PantryLocation, PantryTracking } from '@/lib/types'

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

/** Every place stock can be kept, in the order the Zásoby folders are shown. The single source of
 *  truth for the UI (folder tiles, the per-item move select, the receipt-review location select);
 *  a test keeps it identical to the `pantry_location` database enum, so a location can never be
 *  offered in the UI that the database would then reject. */
export const PANTRY_LOCATIONS: PantryLocation[] = ['Spíž', 'Lednice', 'Mrazák', 'Domácnost', 'Lékárnička', 'Drogérka']

export type LocationSummary = {
  /** Rows kept in this location. */
  count: number
  /** Rows to check: asked about by the check-in cron (`askedAt` set) and still unanswered, or
   *  estimated as probably used up (lib/pantry-estimate.ts). */
  needsCheck: number
  /** Rows at zero quantity — kept on purpose by the stepper ("do šlo") until removed. */
  outOfStock: number
}

/** Per-location counts for the Zásoby folder tiles. Every location is present — an empty one has
 *  zeros — so the UI can always offer all folders (an empty folder is still a valid place to move
 *  something into). Expiry is deliberately not part of this: pantry rows carry no expiry date, and
 *  inventing one would be a made-up warning. */
export function summarizeByLocation(items: PantryItem[], likelyGoneIds: ReadonlySet<string> = new Set()): Record<PantryLocation, LocationSummary> {
  const summary = Object.fromEntries(
    PANTRY_LOCATIONS.map((location) => [location, { count: 0, needsCheck: 0, outOfStock: 0 }]),
  ) as Record<PantryLocation, LocationSummary>
  for (const item of items) {
    const entry = summary[item.location]
    if (!entry) continue
    entry.count += 1
    if (needsCheck(item, likelyGoneIds)) entry.needsCheck += 1
    if (item.quantity <= 0) entry.outOfStock += 1
  }
  return summary
}

/** Whether an item belongs in a check: the check-in asked about it, or it is probably used up. */
export function needsCheck(item: Pick<PantryItem, 'id' | 'askedAt' | 'tracking'>, likelyGoneIds: ReadonlySet<string>): boolean {
  if (item.tracking === 'off') return false
  return Boolean(item.askedAt) || likelyGoneIds.has(item.id)
}

/** The tracking levels in the order the UI offers them, with their labels. */
export const PANTRY_TRACKING: { value: PantryTracking; label: string }[] = [
  { value: 'normal', label: 'Sledovat' },
  { value: 'rare', label: 'Jen zřídka' },
  { value: 'off', label: 'Nesledovat' },
]

/** Check-in interval of an item watched only rarely (salt, spices, oil): a quarter of a year. */
export const RARE_CHECKIN_DAYS = 90

export type PantryCheckinCandidate = {
  category: ItemCategory
  addedAt: Date
  askedAt: Date | null
  /** Absent = 'normal'. */
  tracking?: PantryTracking
}

/** Whether it's time to ask the household "do you still have this?" — once per category's
 *  check-in interval, counted from whichever is more recent: when the item was added/restocked,
 *  or when it was last asked about. Re-asks periodically rather than only once, since a pantry
 *  item left unconfirmed forever isn't useful — unlike a shopping reminder, this isn't a
 *  one-time event. */
export function isDueForCheckin(item: PantryCheckinCandidate, now: Date): boolean {
  if (item.tracking === 'off') return false
  const intervalMs = (item.tracking === 'rare' ? RARE_CHECKIN_DAYS : CHECKIN_DAYS_BY_CATEGORY[item.category]) * 86_400_000
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

// Same placeholder philosophy for the two non-food folders. Deliberately narrow: only well-known
// medicine/first-aid and personal-care words, so a non-food item that matches neither keeps landing
// in "Domácnost" exactly as before (cleaning supplies, toilet paper, nappies, ...). Deliberately
// avoids ambiguous stems — "dezinfekc" (wound vs. surface), "lék" (also inside "mléko"), "krém" —
// because a wrong automatic filing is worse than the household's one-tap manual move.
const FIRST_AID_KEYWORDS = ['paralen', 'ibalgin', 'ibuprofen', 'panadol', 'nurofen', 'acylpyrin', 'aspirin', 'náplast', 'obvaz', 'obinadl', 'teploměr', 'léčiv', 'léky', 'vitamín', 'kapky do nosu', 'tablety proti']
const DRUGSTORE_KEYWORDS = ['šampon', 'kondicionér', 'mýdlo', 'sprchový', 'zubní', 'kartáček', 'deodorant', 'antiperspirant', 'holicí', 'žiletk', 'tampon', 'vložky', 'vatové', 'vatový', 'kosmetick', 'make-up', 'rtěnka', 'opalovací']

/** Where a purchased item should land in the pantry — confidently, or `null` when it genuinely
 *  can't be determined without guessing (per the owner's explicit "NEHÁDEJ" rule for receipt
 *  import: an unrecognized storage location must go to manual review, never a silent default).
 *  Non-food categories go to "Domácnost" (cleaning/household supplies) unless the name clearly
 *  says medicine/first-aid ("Lékárnička") or personal care/cosmetics ("Drogérka"), checked in that
 *  order; food is
 *  split into frozen/chilled/shelf-stable by keyword, and a `Potraviny` item matching none of the
 *  three lists — or a catch-all `Ostatní` item, whose category itself was already uncertain — is
 *  `null`, not a guessed default. Only used to seed a *new* pantry row — an existing row's location
 *  is never re-inferred on restock, so a manual move (e.g. chilled meat into the freezer) sticks. */
export function inferPantryLocation(category: ItemCategory, name: string): PantryLocation | null {
  const normalized = name.trim().toLowerCase()
  if (category === 'Drogerie' || category === 'Děti' || category === 'Domácnost') {
    if (FIRST_AID_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'Lékárnička'
    if (DRUGSTORE_KEYWORDS.some((keyword) => normalized.includes(keyword))) return 'Drogérka'
    return 'Domácnost'
  }
  if (category !== 'Potraviny') return null // 'Ostatní' — the category itself was already unclear
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

// --- Bulk check ("Zkontrolovat zásoby") -------------------------------------------------------
//
// Checking stock one row at a time meant walking the house and tapping every item. The bulk check
// shows many items at once, all assumed "Mám", so the household only taps what ran out and saves
// once: what ran out is removed, everything else is confirmed (the check-in clock restarts).

/** The largest check the server accepts in one save — a whole household's pantry fits easily. */
export const MAX_PANTRY_REVIEW_ITEMS = 1000

/** The order items are shown in a check: the ones the check-in already asked about first ("Máte
 *  ještě?"), then those unconfirmed the longest, then by name — so the likely-gone items are on top
 *  and the order never jumps between renders. */
export function pantryReviewOrder<T extends Pick<PantryItem, 'name' | 'addedAt' | 'askedAt'>>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(Boolean(b.askedAt)) - Number(Boolean(a.askedAt)) ||
      a.addedAt.localeCompare(b.addedAt) ||
      a.name.localeCompare(b.name, 'cs'),
  )
}

/** Splits a check into what to remove and what to confirm: every reviewed item not marked gone is
 *  kept. Ids are de-duplicated and a gone mark for an item outside the check is ignored, so a stale
 *  mark can never remove something the household did not see. */
export function splitPantryReview(reviewedIds: string[], goneIds: Iterable<string>): { goneIds: string[]; keptIds: string[] } {
  const reviewed = [...new Set(reviewedIds)]
  const gone = new Set(goneIds)
  return { goneIds: reviewed.filter((id) => gone.has(id)), keptIds: reviewed.filter((id) => !gone.has(id)) }
}

/** The pantry item a shopping-list name refers to, if the household has it at home and tracks it:
 *  same name once case, accents and synonyms are ignored ("Vajíčka" → "Vejce"). For the "Došlo?"
 *  question when something goes on the list. */
export function pantryItemAtHome(pantryItems: PantryItem[], name: string): PantryItem | null {
  const key = matchKey(name)
  if (!key) return null
  return pantryItems.find((item) => item.tracking !== 'off' && item.quantity > 0 && matchKey(item.name) === key) ?? null
}

/** What the home screen's "Došlo mi…" offers (components/dashboard/quick-out-of-stock.tsx): tracked
 *  items in stock. Without a query, the ones most likely gone come first (estimated as used up, then
 *  asked about), then by name; with a query, the items whose name contains it (case and accents
 *  ignored). At most `limit`. */
export function quickOutCandidates(items: PantryItem[], likelyGoneIds: ReadonlySet<string>, query: string, limit = 6): PantryItem[] {
  const tracked = items.filter((item) => item.tracking !== 'off' && item.quantity > 0)
  const needle = normalizeSearchText(query.trim())
  if (needle) return tracked.filter((item) => normalizeSearchText(item.name).includes(needle)).slice(0, limit)
  const rank = (item: PantryItem) => (likelyGoneIds.has(item.id) ? 0 : item.askedAt ? 1 : 2)
  return [...tracked].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'cs')).slice(0, limit)
}
