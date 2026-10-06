import { matchKey } from '@/lib/receipt-list-match'
import { normalizeProductText } from '@/lib/product-normalize'
import { classifySubcategoryByKeyword } from '@/lib/product-subcategories'
import type { ItemCategory, ItemUnit, PantryArea, PantryItem, PantryLocation, PantryPlace, PantryTracking } from '@/lib/types'

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

/** Check-in days for the Potraviny subcategories (lib/product-subcategories.ts) — bread, meat and
 *  vegetables go off within days, tinned food and pasta keep for months, so one interval for the whole
 *  category asks too early about some and too late about others. Placeholder defaults like the
 *  category ones above; a subcategory not listed falls back to its category. */
export const CHECKIN_DAYS_BY_SUBCATEGORY: Partial<Record<ItemCategory, Record<string, number>>> = {
  Potraviny: {
    'Pečivo': 3,
    'Maso a uzeniny': 4,
    'Ovoce a zelenina': 5,
    'Mléčné výrobky': 7,
    'Ostatní potraviny': 10,
    'Nápoje': 30,
    'Sladkosti': 30,
    'Slané pochutiny': 30,
    'Dětská výživa': 30,
    'Omáčky a dochucovadla': 45,
    'Cereálie a snídaně': 45,
    'Mražené potraviny': 60,
    'Těstoviny a rýže': 60,
    'Trvanlivé potraviny': 60,
    'Konzervy': 90,
  },
}

/** Key of a subcategory override in the map `isDueForCheckin` takes. */
export function checkinSubcategoryKey(category: ItemCategory, subcategory: string): string {
  return `${category}::${subcategory}`
}

/** Every place stock can be kept, in the order the Zásoby folders are shown. The single source of
 *  truth for the UI (folder tiles, the per-item move select, the receipt-review location select);
 *  a test keeps it identical to the `pantry_location` database enum, so a location can never be
 *  offered in the UI that the database would then reject. */
export const PANTRY_LOCATIONS: PantryLocation[] = ['Spíž', 'Lednice', 'Mrazák', 'Domácnost', 'Lékárnička', 'Drogérka']

/** How many items a Zásoby folder shows per page (`components/shopping/pantry.tsx`) before the
 *  household has to page — a well-stocked "Spíž" or "Domácnost" can otherwise run to dozens of
 *  rows, each with its own stepper, location and tracking selects, and be a very long scroll on a
 *  phone (owner request, 2026-09-28: "Přidej stránkování i na kartu Zásoby"). */
export const PANTRY_PAGE_SIZE = 8

/** Every area a pantry place can belong to (`lib/db/schema.ts`'s `pantryAreaEnum`) — a test keeps
 *  this identical to the database enum, the same guard `PANTRY_LOCATIONS` already has. */
export const PANTRY_AREAS: PantryArea[] = ['Potraviny', 'Drogerie', 'Domácnost', 'Děti', 'Auto', 'Bydlení', 'Zvířata', 'Ostatní']

/** The area each fixed location belongs to, for grouping a household's custom places alongside them
 *  and for suggesting a sensible default area when the household adds a new custom place. */
export const FIXED_LOCATION_AREA: Record<PantryLocation, PantryArea> = {
  Spíž: 'Potraviny',
  Lednice: 'Potraviny',
  Mrazák: 'Potraviny',
  Domácnost: 'Domácnost',
  Lékárnička: 'Domácnost',
  Drogérka: 'Drogerie',
}

/** One place a pantry item can be kept — either one of the fixed `PantryLocation`s or a household's
 *  own (`PantryPlace`), presented the same way so the UI does not need two separate code paths. `key`
 *  is what `PantryItem`s are grouped and moved by (`placeKeyOf()` below); for a fixed location it is
 *  the location name itself (matching `PantryItem.location`), for a custom place it is prefixed so
 *  the two spaces can never collide. */
export type PantryPlaceOption = { key: string; name: string; area: PantryArea; custom: boolean; id?: string }

/** Prefix marking a `PantryPlaceOption.key`/`<select>` value as a custom place's id rather than a
 *  fixed `PantryLocation` name — exported so the UI and the server action agree on the format. */
export const CUSTOM_PLACE_KEY_PREFIX = 'custom:'

export function customPlaceKey(placeId: string): string {
  return `${CUSTOM_PLACE_KEY_PREFIX}${placeId}`
}

/** The custom place id encoded in a `PantryPlaceOption.key`/`<select>` value, or null when the key
 *  names a fixed `PantryLocation` instead. */
export function customPlaceIdFromKey(key: string): string | null {
  return key.startsWith(CUSTOM_PLACE_KEY_PREFIX) ? key.slice(CUSTOM_PLACE_KEY_PREFIX.length) : null
}

/** Every place the household can keep stock in right now: the fixed locations, then its own custom
 *  places grouped by area and named alphabetically within it. */
export function pantryPlaceOptions(customPlaces: PantryPlace[]): PantryPlaceOption[] {
  const fixed: PantryPlaceOption[] = PANTRY_LOCATIONS.map((location) => ({ key: location, name: location, area: FIXED_LOCATION_AREA[location], custom: false }))
  const customs: PantryPlaceOption[] = [...customPlaces]
    .sort((a, b) => PANTRY_AREAS.indexOf(a.area) - PANTRY_AREAS.indexOf(b.area) || a.name.localeCompare(b.name, 'cs'))
    .map((place) => ({ key: customPlaceKey(place.id), name: place.name, area: place.area, custom: true, id: place.id }))
  return [...fixed, ...customs]
}

/** The place key a pantry item is currently kept at — its custom place when it has one, otherwise
 *  its fixed location. The one thing every place-aware function groups/moves items by. */
export function placeKeyOf(item: Pick<PantryItem, 'location' | 'customPlaceId'>): string {
  return item.customPlaceId ? customPlaceKey(item.customPlaceId) : item.location
}

export type LocationSummary = {
  /** Rows kept in this location. */
  count: number
  /** Rows to check: asked about by the check-in cron (`askedAt` set) and still unanswered, or
   *  estimated as probably used up (lib/pantry-estimate.ts). */
  needsCheck: number
  /** Rows at zero quantity — kept on purpose by the stepper ("do šlo") until removed. */
  outOfStock: number
}

/** Per-place counts for the Zásoby folder tiles, keyed by `PantryPlaceOption.key`. Every place in
 *  `options` is present — an empty one has zeros — so the UI can always offer all folders (an empty
 *  folder is still a valid place to move something into). Expiry is deliberately not part of this:
 *  pantry rows carry no expiry date, and inventing one would be a made-up warning. */
export function summarizeByPlace(items: PantryItem[], options: PantryPlaceOption[], likelyGoneIds: ReadonlySet<string> = new Set()): Record<string, LocationSummary> {
  const summary = Object.fromEntries(options.map((option) => [option.key, { count: 0, needsCheck: 0, outOfStock: 0 }])) as Record<string, LocationSummary>
  for (const item of items) {
    const entry = summary[placeKeyOf(item)]
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
  subcategory?: string | null
  addedAt: Date
  askedAt: Date | null
  /** Absent = 'normal'. */
  tracking?: PantryTracking
}

/** Whether it's time to ask the household "do you still have this?" — once per category's
 *  check-in interval, counted from whichever is more recent: when the item was added/restocked,
 *  or when it was last asked about. Re-asks periodically rather than only once, since a pantry
 *  item left unconfirmed forever isn't useful — unlike a shopping reminder, this isn't a
 *  one-time event. `overrides` is the household's own per-category interval and
 *  `subcategoryOverrides` its own per-subcategory one (Profil domácnosti → Zásoby, spec section 13).
 *  The most specific wins: the household's subcategory value, then the built-in subcategory default,
 *  then the category's own (household value, else `CHECKIN_DAYS_BY_CATEGORY`). */
export function checkinDaysFor(
  item: Pick<PantryCheckinCandidate, 'category' | 'subcategory'>,
  overrides: Partial<Record<ItemCategory, number>> = {},
  subcategoryOverrides: Record<string, number> = {},
): number {
  if (item.subcategory) {
    const own = subcategoryOverrides[checkinSubcategoryKey(item.category, item.subcategory)]
    if (own != null) return own
    const builtIn = CHECKIN_DAYS_BY_SUBCATEGORY[item.category]?.[item.subcategory]
    if (builtIn != null) return builtIn
  }
  return overrides[item.category] ?? CHECKIN_DAYS_BY_CATEGORY[item.category]
}

export function isDueForCheckin(
  item: PantryCheckinCandidate,
  now: Date,
  overrides: Partial<Record<ItemCategory, number>> = {},
  subcategoryOverrides: Record<string, number> = {},
): boolean {
  if (item.tracking === 'off') return false
  const days = item.tracking === 'rare' ? RARE_CHECKIN_DAYS : checkinDaysFor(item, overrides, subcategoryOverrides)
  const intervalMs = days * 86_400_000
  if (now.getTime() - item.addedAt.getTime() < intervalMs) return false
  if (item.askedAt === null) return true
  return now.getTime() - item.askedAt.getTime() >= intervalMs
}

/** Candidates that are due for a check-in right now. */
export function findDueForCheckin<T extends PantryCheckinCandidate>(
  items: T[],
  now: Date,
  overrides: Partial<Record<ItemCategory, number>> = {},
  subcategoryOverrides: Record<string, number> = {},
): T[] {
  return items.filter((item) => isDueForCheckin(item, now, overrides, subcategoryOverrides))
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

// The Děti subcategories that are food (lib/product-subcategories.ts).
const CHILDRENS_FOOD = new Set(['Kojenecké mléko', 'Příkrmy', 'Kaše a cereálie', 'Dětské svačinky', 'Dětské nápoje'])
const isChildrensFood = (name: string): boolean => CHILDRENS_FOOD.has(classifySubcategoryByKeyword('Děti', normalizeProductText(name)) ?? '')

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
    // Children's food and drinks (Jupík, HiPP příkrm) are food: the fridge when the name says so,
    // otherwise the shelf — never the cleaning-supplies folder.
    if (category === 'Děti' && isChildrensFood(name)) return CHILLED_KEYWORDS.some((keyword) => normalized.includes(keyword)) ? 'Lednice' : 'Spíž'
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

/** −/+ step size: whole units for "ks" (you don't buy 0.3 of a countable item), a tenth for
 *  weight/volume units — matches how the household would actually type a correction. */
export const PANTRY_QUANTITY_STEP: Record<ItemUnit, number> = { ks: 1, kg: 0.1, g: 10, l: 0.1, ml: 10 }

/** A remaining quantity the household set during the check ("had 4, 1 left"). */
export type PantryQuantityChange = { id: string; quantity: number }

/** Validates the remaining quantities sent with a check: each must belong to an item that stays (an
 *  item that ran out is removed, not set to 0), be a positive finite number, and appear once. Rounded
 *  to three decimals like the quantity stepper. Throws on anything else, so a bad payload changes
 *  nothing. */
export function reviewQuantityChanges(changes: unknown, keptIds: string[]): PantryQuantityChange[] {
  if (changes === undefined) return []
  if (!Array.isArray(changes)) throw new Error('Neplatné množství v kontrole zásob.')
  const kept = new Set(keptIds)
  const seen = new Set<string>()
  return changes.map((change) => {
    const id = (change as PantryQuantityChange)?.id
    const quantity = (change as PantryQuantityChange)?.quantity
    if (typeof id !== 'string' || !kept.has(id) || seen.has(id) || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Neplatné množství v kontrole zásob.')
    }
    seen.add(id)
    return { id, quantity: Math.round(quantity * 1000) / 1000 }
  })
}

/** The pantry item a shopping-list name refers to, if the household has it at home and tracks it:
 *  same name once case, accents and synonyms are ignored ("Vajíčka" → "Vejce"). For the "Došlo?"
 *  question when something goes on the list. */
export function pantryItemAtHome(pantryItems: PantryItem[], name: string): PantryItem | null {
  const key = matchKey(name)
  if (!key) return null
  return pantryItems.find((item) => item.tracking !== 'off' && item.quantity > 0 && matchKey(item.name) === key) ?? null
}

export type DuplicatePlacement = {
  /** The name shared by the duplicate rows (as typed on the first of them, for display). */
  name: string
  ids: string[]
}

/** Items kept at more than one place under the same name (spec section 11: "stejnou položku na
 *  více místech") — case/whitespace-insensitive, the same match rule `pantryQuantityFor()` already
 *  uses. Flags the household's attention rather than guessing which row is the "right" one: they
 *  might genuinely mean to have milk in both the fridge and a spare in the pantry, so this is a
 *  question ("Zkontrolovat zásoby"), not an automatic merge. */
export function findDuplicatePlacements(items: PantryItem[]): DuplicatePlacement[] {
  const byName = new Map<string, PantryItem[]>()
  for (const item of items) {
    const key = item.name.trim().toLowerCase()
    if (!key) continue
    const group = byName.get(key)
    if (group) group.push(item)
    else byName.set(key, [item])
  }
  const duplicates: DuplicatePlacement[] = []
  for (const group of byName.values()) {
    const distinctPlaces = new Set(group.map((item) => placeKeyOf(item)))
    if (distinctPlaces.size > 1) duplicates.push({ name: group[0].name, ids: group.map((item) => item.id) })
  }
  return duplicates.sort((a, b) => a.name.localeCompare(b.name, 'cs'))
}

