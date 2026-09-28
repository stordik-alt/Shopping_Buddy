// Fixed subcategory taxonomy for products/inventory, one layer under the existing `item_category`
// enum (Potraviny/Drogerie/Děti/Domácnost/Ostatní) — shared by products, purchase_items and
// pantry_items so expenses/products/inventory all read the same subcategory for a given product
// (CLAUDE.md's product-categorization decision, mirroring how lib/expense-categories.ts already
// keeps expense subcategories fixed and server-validated rather than free text). Deliberately a
// *separate* system from expense_category's own subcategories — see lib/purchase-expenses.ts's
// EXPENSE_CATEGORY_OF_ITEM for the (unchanged) mapping from item_category to expense_category.
//
// "Děti" is intentionally not one of the item categories a child-oriented product is forced into:
// a children's drink (Kubík) stays classified as Potraviny ▸ Nápoje, with `isChildOriented` as a
// separate tag (see `products.is_child_oriented` in the schema) — reporting "dětské produkty" must
// not come at the cost of losing "this is a drink" for the main category (spec section 10).

import { normalizeProductText } from '@/lib/product-normalize'
import type { ItemCategory } from '@/lib/types'

export const PRODUCT_SUBCATEGORIES = {
  Potraviny: [
    'Pečivo',
    'Mléčné výrobky',
    'Maso a uzeniny',
    'Ovoce a zelenina',
    'Nápoje',
    'Sladkosti',
    'Slané pochutiny',
    'Trvanlivé potraviny',
    'Konzervy',
    'Mražené potraviny',
    'Těstoviny a rýže',
    'Omáčky a dochucovadla',
    'Cereálie a snídaně',
    'Dětská výživa',
    'Ostatní potraviny',
  ],
  Drogerie: ['Praní', 'Mytí nádobí', 'Čištění domácnosti', 'Kosmetika', 'Hygiena', 'Dětská hygiena', 'Ostatní drogerie'],
  Domácnost: ['Papír', 'Kuchyň', 'Úklid', 'Ostatní'],
  Děti: ['Pleny', 'Dětská kosmetika', 'Dětské potřeby', 'Hračky', 'Ostatní'],
  // 'Ostatní' (the item category, distinct from the "Ostatní" subcategory names above) has no
  // subcategory list of its own — a genuinely uncategorizable item has no finer bucket to offer.
  Ostatní: [],
} as const satisfies Record<ItemCategory, readonly string[]>

export type ProductSubcategory = (typeof PRODUCT_SUBCATEGORIES)[keyof typeof PRODUCT_SUBCATEGORIES][number]

/** The subcategories offered for an item category, in display order. */
export function subcategoriesOfItem(category: ItemCategory): readonly string[] {
  return PRODUCT_SUBCATEGORIES[category]
}

/** Whether `subcategory` is one of `category`'s fixed subcategories — the same server-side
 *  validation gate `isValidSubcategory` provides for expense subcategories; a category with no
 *  subcategory (null) is always valid, an AI or user-supplied subcategory that isn't in the fixed
 *  list is never accepted (spec section 11: "validate every AI response against the allowed set"). */
export function isValidProductSubcategory(category: ItemCategory, subcategory: string | null): boolean {
  return subcategory === null || (subcategoriesOfItem(category) as readonly string[]).includes(subcategory)
}

// --- Deterministic keyword classification --------------------------------------------------------
//
// A small, hand-curated Czech keyword table — the same "NEHÁDEJ" philosophy as lib/pantry.ts's
// inferPantryLocation(): confident deterministic rules first, `null` (never a guess) when nothing
// matches confidently, leaving the fuzzy/AI stages in lib/categorization.ts to try further or the
// household to decide. Ordered so a more specific rule (e.g. "mražen" → Mražené potraviny) is
// checked before a broader one that could otherwise also match (e.g. "zelenina").

type SubcategoryRule = { subcategory: string; keywords: string[] }

const POTRAVINY_RULES: SubcategoryRule[] = [
  { subcategory: 'Mražené potraviny', keywords: ['mražen', 'zmrzlina', 'mraž'] },
  { subcategory: 'Pečivo', keywords: ['chleb', 'rohlík', 'rohliky', 'houska', 'bageta', 'croissant', 'peciv', 'bulka', 'veka'] },
  {
    subcategory: 'Mléčné výrobky',
    keywords: ['mléko', 'mleko', 'mléčn', 'jogurt', 'kefír', 'kefir', 'sýr', 'syr', 'máslo', 'maslo', 'smetana', 'tvaroh', 'skyr', 'termix', 'pribináček', 'pribinacek'],
  },
  {
    subcategory: 'Maso a uzeniny',
    keywords: ['šunka', 'sunka', 'salám', 'salam', 'párky', 'parky', 'klobás', 'klobas', 'maso', 'kuřecí', 'kureci', 'vepřov', 'veprov', 'hovězí', 'hovezi', 'slanina', 'uzenin'],
  },
  { subcategory: 'Ovoce a zelenina', keywords: ['jablk', 'banán', 'banan', 'pomeranč', 'pomeranc', 'zelenina', 'ovoce', 'rajče', 'rajce', 'okurk', 'brambor', 'cibul', 'mrkev'] },
  {
    subcategory: 'Nápoje',
    keywords: [
      'jupik', 'jupík', 'kubik', 'kubík', 'mattoni', 'matton', 'dobra voda', 'dobrá voda', 'voda', 'napoj', 'nápoj', 'limonada', 'limonáda', 'cola', 'sok', 'šťáva', 'stava',
      'pivo', 'víno', 'vino', 'čaj', 'caj', 'káva', 'kava',
    ],
  },
  { subcategory: 'Sladkosti', keywords: ['čokoláda', 'cokolada', 'bonbon', 'sušenk', 'susenk', 'oplatk', 'zmrzlin', 'dort', 'keks'] },
  { subcategory: 'Slané pochutiny', keywords: ['brambůrk', 'bramburk', 'chipsy', 'tyčink slan', 'oříšk', 'orisk', 'arašíd', 'arasid'] },
  { subcategory: 'Konzervy', keywords: ['konzerv', 'kompot'] },
  { subcategory: 'Těstoviny a rýže', keywords: ['těstovin', 'testovin', 'rýže', 'ryze', 'špagety', 'spagety'] },
  { subcategory: 'Omáčky a dochucovadla', keywords: ['kečup', 'kecup', 'hořčice', 'horcice', 'majonéz', 'majonez', 'omáčk', 'omack', 'koření', 'koreni', 'dochucovad'] },
  { subcategory: 'Cereálie a snídaně', keywords: ['cereál', 'cerealie', 'müsli', 'musli', 'ovesné vločky', 'ovesne vlocky'] },
  { subcategory: 'Dětská výživa', keywords: ['dětská výživa', 'detska vyziva', 'příkrm', 'prikrm', 'kojenecké mléko', 'kojenecke mleko'] },
  { subcategory: 'Trvanlivé potraviny', keywords: ['mouka', 'cukr', 'sůl', 'sul', 'olej', 'ocet', 'trvanl'] },
]

const DROGERIE_RULES: SubcategoryRule[] = [
  { subcategory: 'Praní', keywords: ['prášek na praní', 'prasek na prani', 'aviváž', 'avivaz', 'gel na praní', 'gel na prani'] },
  { subcategory: 'Mytí nádobí', keywords: ['jar', 'mytí nádobí', 'myti nadobi', 'tableta do myčky', 'tableta do mycky'] },
  { subcategory: 'Čištění domácnosti', keywords: ['savo', 'čistič', 'cistic', 'úklid', 'uklid', 'wc gel', 'dezinfek'] },
  { subcategory: 'Dětská hygiena', keywords: ['dětsk', 'detsk'] },
  { subcategory: 'Hygiena', keywords: ['zubní', 'zubni', 'sprchový', 'sprchovy', 'mýdlo', 'mydlo', 'toaletní papír', 'toaletni papir', 'vložky', 'vlozky', 'tampon'] },
  { subcategory: 'Kosmetika', keywords: ['šampon', 'sampon', 'krém', 'krem', 'deodorant', 'kosmetik', 'rtěnka', 'rtenka'] },
]

const DOMACNOST_RULES: SubcategoryRule[] = [
  { subcategory: 'Papír', keywords: ['toaletní papír', 'toaletni papir', 'kuchyňské utěrky', 'kuchynske uterky', 'ubrousk', 'papírov', 'papirov'] },
  { subcategory: 'Kuchyň', keywords: ['alobal', 'fólie', 'folie', 'sáčky', 'sacky', 'nádobí', 'nadobi', 'hrnec', 'pánev', 'panev'] },
  { subcategory: 'Úklid', keywords: ['úklid', 'uklid', 'houba na nádobí', 'houba na nadobi', 'hadr', 'mop', 'koště', 'koste'] },
]

const DETI_RULES: SubcategoryRule[] = [
  { subcategory: 'Pleny', keywords: ['plen', 'pampers'] },
  { subcategory: 'Dětská kosmetika', keywords: ['dětský krém', 'detsky krem', 'dětský šampon', 'detsky sampon', 'dětský olej', 'detsky olej'] },
  { subcategory: 'Hračky', keywords: ['hračk', 'hracka', 'hračky'] },
  { subcategory: 'Dětské potřeby', keywords: ['dudlík', 'dudlik', 'kojeneck', 'láhev', 'lahev'] },
]

// Keyword lists above are written with normal Czech spelling (diacritics included, plus a few
// obvious unaccented duplicates left over from earlier drafts) — `normalizedName` at match time has
// its accents stripped (lib/product-normalize.ts), so every keyword must go through the same
// normalization once here, or an accented-only keyword like "šunka" would never match a haystack
// that has already been reduced to "sunka". Applied once at module load, not per lookup.
const normalizeRules = (rules: SubcategoryRule[]): SubcategoryRule[] =>
  rules.map((rule) => ({ subcategory: rule.subcategory, keywords: rule.keywords.map(normalizeProductText) }))

const RULES_BY_CATEGORY: Record<ItemCategory, SubcategoryRule[]> = {
  Potraviny: normalizeRules(POTRAVINY_RULES),
  Drogerie: normalizeRules(DROGERIE_RULES),
  Domácnost: normalizeRules(DOMACNOST_RULES),
  Děti: normalizeRules(DETI_RULES),
  Ostatní: [],
}

/** Deterministic keyword classification of a normalized product name into one of its item
 *  category's fixed subcategories — `null` when nothing matches confidently (never a guess). The
 *  caller (lib/categorization.ts) treats this as one priority tier among several; a `null` here
 *  does not stop fuzzy or AI matching from being tried next. */
export function classifySubcategoryByKeyword(category: ItemCategory, normalizedName: string): string | null {
  for (const rule of RULES_BY_CATEGORY[category]) {
    if (rule.keywords.some((keyword) => normalizedName.includes(keyword))) return rule.subcategory
  }
  return null
}

// --- Child-oriented tag ----------------------------------------------------------------------

/** Keywords that mark a product as aimed at children without changing its main category — e.g.
 *  "Kubík" stays Potraviny ▸ Nápoje but is also flagged child-oriented for reporting (spec section
 *  10). Deliberately small and specific to known children's brands/words; broader terms ("dětsk")
 *  are already handled by the Děti item category itself and would over-tag adult products that
 *  merely mention "pro děti" on packaging text picked up by OCR. */
const CHILD_ORIENTED_KEYWORDS = ['kubík', 'jupík', 'jupi ', 'fruko', 'kinder', 'haribo'].map(normalizeProductText)

export function isChildOrientedByKeyword(normalizedName: string): boolean {
  return CHILD_ORIENTED_KEYWORDS.some((keyword) => normalizedName.includes(keyword))
}

// --- Non-inventory (disposable/service) line detection ----------------------------------------

/** Receipt lines that are not a real product at all — a shopping bag, a returnable-bottle deposit,
 *  a service charge — and so must never become a pantry row, even though they are a legitimate
 *  expense line (spec sections 14/15: "a product can be an expense but not necessarily an inventory
 *  item"). Deliberately conservative: only well-known Czech receipt wording, checked as a whole-word
 *  match against the normalized name, so a real product that merely contains a similar substring
 *  ("Taškový pudink" does not exist, but the principle matters) is not silently excluded. Detection
 *  here only *pre-fills* a suggestion (`ReceiptLineItem.nonInventory`) — the household can always
 *  override it in review, and an uncertain line is still shown, never silently dropped
 *  (spec section 14: "do NOT simply delete uncertain items automatically"). */
const NON_INVENTORY_KEYWORDS = [
  'taška', 'igelitová taška', 'nákupní taška', 'plastová taška', 'papírová taška', 'euroobal',
  'zálohovaná láhev', 'záloha na láhev', 'vratná záloha', 'záloha', 'recyklační poplatek',
].map(normalizeProductText)

export function isNonInventoryLine(normalizedName: string): boolean {
  return NON_INVENTORY_KEYWORDS.some((keyword) => normalizedName === keyword || normalizedName.includes(keyword))
}
