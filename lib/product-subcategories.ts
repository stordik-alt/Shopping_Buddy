// Fixed subcategory taxonomy for products/inventory, one layer under the existing `item_category`
// enum (Potraviny/Drogerie/Děti/Domácnost/Ostatní). The same values are used by products,
// purchase_items, pantry_items and ordinary receipt-derived budget expenses, so one product has one
// shared category/subcategory across Zásoby and Rozpočet. Non-product expense targets keep their own
// separate subcategory taxonomy in lib/expense-categories.ts.
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
    'Vejce',
    'Maso a uzeniny',
    'Ryby a mořské plody',
    'Ovoce a zelenina',
    'Luštěniny',
    'Ořechy, semínka a sušené ovoce',
    'Nápoje',
    'Káva a čaj',
    'Alkoholické nápoje',
    'Sladkosti',
    'Džemy, med a pomazánky',
    'Slané pochutiny',
    'Lahůdky a hotová jídla',
    'Rostlinné alternativy',
    'Trvanlivé potraviny',
    'Mouka a pečení',
    'Oleje a tuky',
    'Konzervy',
    'Mražené potraviny',
    'Těstoviny a rýže',
    'Koření a bylinky',
    'Omáčky a dochucovadla',
    'Cereálie a snídaně',
    'Dětská výživa',
    'Ostatní potraviny',
  ],
  Drogerie: ['Praní', 'Mytí nádobí', 'Čištění domácnosti', 'Kosmetika', 'Hygiena', 'Dětská hygiena', 'Ostatní drogerie'],
  Domácnost: ['Papír', 'Kuchyň', 'Úklid', 'Ostatní'],
  Děti: ['Pleny', 'Dětská kosmetika', 'Dětské potřeby', 'Hračky', 'Ostatní'],
  // Things that are neither food, drugstore, household nor children's goods.
  Ostatní: ['Oblečení a obuv', 'Elektronika', 'Tabák a e-cigarety', 'Ostatní zboží'],
} as const satisfies Record<ItemCategory, readonly string[]>

export type ProductSubcategory = (typeof PRODUCT_SUBCATEGORIES)[keyof typeof PRODUCT_SUBCATEGORIES][number]

/** The Potraviny subcategories added on 2026-10-03 (migration 0060). Products, purchase lines and
 *  pantry rows the keyword rules now place in one of them are moved there once by
 *  `scripts/move-to-new-subcategories.ts` (lib/db/new-subcategories.ts). */
export const NEW_FOOD_SUBCATEGORIES = [
  'Vejce',
  'Ryby a mořské plody',
  'Luštěniny',
  'Ořechy, semínka a sušené ovoce',
  'Káva a čaj',
  'Alkoholické nápoje',
  'Džemy, med a pomazánky',
  'Lahůdky a hotová jídla',
  'Rostlinné alternativy',
  'Mouka a pečení',
  'Oleje a tuky',
  'Koření a bylinky',
] as const satisfies readonly (typeof PRODUCT_SUBCATEGORIES.Potraviny)[number][]

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

/** A keyword matches anywhere in the normalized name ("mléčn" in "mléčná čokoláda"). A leading or
 *  trailing space ties it to a word boundary: " ryby " is fish, never "rybíz"; " stika" is pike,
 *  never "paštika". `exclude` keywords veto the rule ("Kinder vajíčko s překvapením" is no egg), so
 *  the name falls through to a later rule or stays unplaced. */
type SubcategoryRule = { subcategory: string; keywords: string[]; exclude?: string[] }

// The first rule that matches wins, so a narrower or ambiguous group comes before a broader one:
// non-alcoholic beer before alcohol; alcohol, coffee and tea before "Nápoje"; ready meals and plant
// alternatives before the eggs, dairy and meat they mention; fish before meat and tins ("Tuňák v
// konzervě" is fish); pulses before vegetables ("Fazole v nálevu"); sauces before spices ("Rajská
// omáčka … koření"); oil before nuts ("Olej z vlašských ořechů"). Every keyword was checked against
// the real catalog (2026-10-03): a short one is tied to word boundaries where it is part of other
// words ("čočk" is "cock" in "Cocktails", "caj" starts "Cajthaml").
const POTRAVINY_RULES: SubcategoryRule[] = [
  { subcategory: 'Mražené potraviny', keywords: ['mražen', 'zmrzlina', 'mraž'] },
  { subcategory: 'Nápoje', keywords: ['nealko', ' 0 0 '] },
  {
    subcategory: 'Alkoholické nápoje',
    keywords: [
      ' pivo', ' piva ', 'lezak', 'ležák', ' ipa ', ' vino ', ' vína ', 'víno ', ' sekt ', 'prosecco', 'šampaňsk', 'champagne', 'spumante', 'cider', 'medovina',
      'vodka', ' rum ', 'whisk', ' gin ', 'liker', 'likér', 'liquore', 'liqueur', 'tequila', 'brandy', 'koňak', 'slivovice', 'hruškovice', 'meruňkovice', 'becherovka', 'fernet', 'griotka', 'aperitiv',
      'merlot', 'cabernet', 'chardonnay', 'sauvignon', 'riesling', 'ryzlink', 'frankovka', 'rulandsk', 'müller thurgau', 'pinot', 'primitivo', 'tramín', 'veltlínsk', 'svatovavřineck', 'zweigelt', 'chianti', 'rioja', 'hibernal', 'muškát moravský', 'tempranillo', 'garnacha', 'shiraz', 'syrah', 'malbec', 'montepulciano', 'peprmint',
      'suché červené', 'suché bílé', 'polosuché', 'polosladké',
      ' igt ', ' doc ', ' docg ', ' aoc ', ' 0 75 l', ' 0 75l',
    ],
  },
  {
    subcategory: 'Lahůdky a hotová jídla',
    keywords: ['bramborový salát', 'vlašský salát', 'těstovinový salát', 'pochoutkový salát', 'vajíčkový salát', 'majonézový salát', 'hotové jídlo', 'hotová jídla', ' aspik ', ' aspiku ', 'utopenc', 'obložen', 'sendvič', ' wrap '],
  },
  {
    subcategory: 'Rostlinné alternativy',
    keywords: ['rostlinný nápoj', 'rostlinná alternativa', 'rostlinný jogurt', 'rostlinný sýr', 'vegan', ' tofu', 'tempeh', 'seitan', 'sójový nápoj', 'ovesný nápoj', 'mandlový nápoj', 'rýžový nápoj', 'kokosový nápoj', 'alpro', 'oatly'],
  },
  { subcategory: 'Slané pochutiny', keywords: ['brambůrk', 'bramburk', 'chipsy', ' chips', 'tyčink slan', 'arašíd', 'arasid', 'krekr', 'křupky', 'tyčinky pekařské', 'doritos'] },
  { subcategory: 'Pečivo', keywords: ['chleb', 'rohlík', 'rohliky', 'houska', 'bageta', 'croissant', 'peciv', 'bulka', 'veka'] },
  {
    subcategory: 'Mléčné výrobky',
    keywords: ['mléko', 'mleko', 'mléčn', 'jogurt', 'kefír', 'kefir', 'sýr', 'syr', 'máslo', 'maslo', 'smetana', 'tvaroh', 'skyr', 'termix', 'pribináček', 'pribinacek', 'gouda', 'camembert', 'eidam', 'hermelín', 'mozzarell', 'parmaz', 'cheddar', 'niva', 'brie', 'feta'],
  },
  {
    subcategory: 'Ryby a mořské plody',
    keywords: [
      'losos', 'tuňák', 'tunak', 'treska', ' sleď', ' sledě', 'makrel', 'krevet', 'pstruh', ' kapr', 'sardink', 'sardel', ' ryba ', ' ryby ', ' rybí ', ' rybích ', 'rybí filé',
      'chobotnic', 'kalamár', 'surimi', 'tilapie', 'pangasius', 'candát', ' štika', ' mušle', 'ančovič', 'hering', 'šprot',
    ],
    exclude: ['koření'],
  },
  {
    subcategory: 'Maso a uzeniny',
    keywords: ['šunka', 'sunka', 'salám', 'salam', 'párky', 'parky', 'klobás', 'klobas', 'maso', 'kuřecí', 'kureci', 'vepřov', 'veprov', 'hovězí', 'hovezi', 'slanina', 'uzenin', 'mortadel'],
  },
  { subcategory: 'Luštěniny', keywords: ['čočka', 'čočky', 'čočkov', 'čočce', 'fazol', 'cizrn', ' hrách ', 'luštěnin', 'lusteniny'] },
  { subcategory: 'Ovoce a zelenina', keywords: ['jablk', 'banán', 'banan', 'pomeranč', 'pomeranc', 'zelenina', 'ovoce', 'rajče', 'rajce', 'okurk', 'brambor', 'cibul', 'mrkev'] },
  {
    subcategory: 'Káva a čaj',
    keywords: [' káva', ' kávy', 'kávová zrna', 'zrnková káva', 'mletá káva', 'instantní káva', 'espresso', 'cappuccino', ' kafe ', ' čaj ', ' čaje ', ' čajů ', ' čajový', 'rooibos', 'yerba'],
  },
  {
    subcategory: 'Nápoje',
    keywords: ['voda', 'napoj', 'nápoj', 'limonada', 'limonáda', 'cola', 'sok', 'šťáva', 'stava', 'džus', 'dzus', 'sirup'],
  },
  { subcategory: 'Sladkosti', keywords: ['čokolád', 'pralink', 'tyčinka', 'bonbon', 'sušenk', 'susenk', 'oplatk', 'zmrzlin', 'dort', 'keks'] },
  { subcategory: 'Omáčky a dochucovadla', keywords: ['kečup', 'kecup', 'hořčice', 'horcice', 'majonéz', 'majonez', 'omáčk', 'omack', 'dochucovad', ' ocet', 'sójová omáčka'] },
  {
    subcategory: 'Džemy, med a pomazánky',
    keywords: ['džem', 'dzem', 'marmelád', 'lekvár', 'povidl', ' med ', ' medu ', 'nutella', 'pomazánk', 'pomazank'],
  },
  { subcategory: 'Konzervy', keywords: ['konzerv', 'kompot'] },
  { subcategory: 'Cereálie a snídaně', keywords: ['cereál', 'cerealie', 'müsli', 'musli', 'ovesné vločky', 'ovesne vlocky'] },
  { subcategory: 'Těstoviny a rýže', keywords: ['těstovin', 'testovin', 'rýže', 'ryze', 'špagety', 'spagety'] },
  {
    subcategory: 'Oleje a tuky',
    keywords: [' olej ', ' oleje ', 'sádlo', 'margarín', 'margarin', 'palmarín', 'palmarin', ' ghí', ' ghee', 'kokosový tuk', 'pokrmový tuk'],
  },
  {
    subcategory: 'Ořechy, semínka a sušené ovoce',
    keywords: ['ořech', 'orech', 'oříšk', 'orisk', 'mandl', 'kešu', 'kesu', 'pistáci', 'semínk', 'semink', ' chia', 'rozink', 'datle', 'sušené ovoce', 'sušené meruňky', 'sušené švestky', 'brusinky sušené'],
  },
  {
    subcategory: 'Koření a bylinky',
    keywords: [
      'koření', 'koreni', ' pepř ', ' pepře ', ' sůl ', ' sul ', 'mletá paprika', 'paprika mletá', 'paprika sladká', 'skořice', 'oregano', 'bazalka', 'majoránka', 'kmín', 'bobkov', 'muškátový ořech',
      'hřebíček', 'kurkum', ' kari ', 'drcené chilli', 'chilli mleté', 'sušené chilli', 'chilli koření', 'tymián', 'rozmarýn', 'koriandr', 'dobromysl', 'zázvor mletý', 'česnek granulovaný', 'česnek sušený', 'vanilkový lusk', 'vanilkové lusky',
    ],
  },
  { subcategory: 'Dětská výživa', keywords: ['dětská výživa', 'detska vyziva', 'příkrm', 'prikrm', 'kojenecké mléko', 'kojenecke mleko'] },
  {
    subcategory: 'Mouka a pečení',
    keywords: [
      'mouka', 'mouky', ' droždí', 'kvasnice', 'prášek do pečiva', 'kypřic', 'krupice', 'strouhank', ' cukr ', 'cukr krupice', 'cukr krystal', 'cukr moučka', 'třtinový cukr', 'vanilkový cukr', 'vanilinový cukr',
      'kakaový prášek', 'kakao na pečení', 'holandské kakao', 'pudinkový prášek', 'želatina',
    ],
    exclude: ['bez droždí'],
  },
  {
    subcategory: 'Vejce',
    keywords: [' vejce', ' vajíčka', ' vajíčko', ' vajec ', 'křepelčí vejce'],
    exclude: ['polévk', 'překvapení', 'čokolád', 'kulajda', 's vejcem', 'do kapsy'],
  },
  { subcategory: 'Trvanlivé potraviny', keywords: ['trvanl'] },
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

const OSTATNI_RULES: SubcategoryRule[] = [
  { subcategory: 'Tabák a e-cigarety', keywords: ['cigaret', 'tabák', 'tabak', 'vape', 'doutník', 'doutnik'] },
  { subcategory: 'Elektronika', keywords: ['baterie', 'nabíječk', 'nabijeck', 'kabel', 'sluchátk', 'sluchatk', 'žárovk', 'zarovk'] },
  { subcategory: 'Oblečení a obuv', keywords: ['prádlo', 'pradlo', 'ponožk', 'ponozk', 'tričko', 'tricko', 'kalhot', 'boty', 'obuv', 'pyžamo', 'pyzamo', 'košile', 'kosile', 'čepice', 'cepice'] },
]

// Keyword lists above are written with normal Czech spelling (diacritics included, plus a few
// obvious unaccented duplicates left over from earlier drafts) — `normalizedName` at match time has
// its accents stripped (lib/product-normalize.ts), so every keyword must go through the same
// normalization once here, or an accented-only keyword like "šunka" would never match a haystack
// that has already been reduced to "sunka". Applied once at module load, not per lookup.
// A leading/trailing space (a word boundary, see SubcategoryRule) survives normalization, which
// would otherwise trim it.
const normalizeKeyword = (keyword: string): string =>
  `${keyword.startsWith(' ') ? ' ' : ''}${normalizeProductText(keyword)}${keyword.endsWith(' ') ? ' ' : ''}`

const normalizeRules = (rules: SubcategoryRule[]): SubcategoryRule[] =>
  rules.map((rule) => ({ subcategory: rule.subcategory, keywords: rule.keywords.map(normalizeKeyword), exclude: rule.exclude?.map(normalizeKeyword) }))

const RULES_BY_CATEGORY: Record<ItemCategory, SubcategoryRule[]> = {
  Potraviny: normalizeRules(POTRAVINY_RULES),
  Drogerie: normalizeRules(DROGERIE_RULES),
  Domácnost: normalizeRules(DOMACNOST_RULES),
  Děti: normalizeRules(DETI_RULES),
  Ostatní: normalizeRules(OSTATNI_RULES),
}

// Known Czech beverage brand names, checked before the generic category rules below. A brand name
// is an unambiguous signal ("Korunní Etera Jablko" and "YESS Pomeranč" are drinks, not produce),
// unlike a bare fruit/vegetable word, which many flavored drinks also carry in their name — without
// this tier, "jablk"/"pomeranč" in POTRAVINY_RULES' "Ovoce a zelenina" entry would win first and
// misclassify these as raw produce (found via a real dry-run of scripts/recategorize-products.ts
// against production data: KORUNNÍ ETERA JABLKO and YESS POMERANČ 0,5L both landed on "Ovoce a
// zelenina" before this fix). Deliberately just brand names, not a broader "contains a fruit word"
// exception — a bare "Jablko" with no brand or volume context should still resolve to produce.
const BEVERAGE_BRAND_KEYWORDS = [
  'jupik', 'jupík', 'kubik', 'kubík', 'mattoni', 'matton', 'dobra voda', 'dobrá voda',
  'korunni', 'korunní', 'yess', 'rajec', 'ondrasovka', 'ondrášovka', 'podebradka', 'poděbradka',
  'toma', 'kofola', 'birell', 'radler', 'pepsi', 'fanta', 'sprite',
].map(normalizeProductText)

// A liter-volume marker ("0,5l", "1,5l", "2l" — normalized, the comma becomes a space so the digit
// run stays attached to "l") is a strong, unambiguous beverage signal for any *unbranded* case the
// list above misses: raw produce is never sold "1,5l" on a Czech receipt. Used only to suppress a
// false "Ovoce a zelenina" keyword match, never to force a positive Nápoje guess by itself — falling
// through to `null` (unresolved) is preferable to a confident wrong category (NEHÁDEJ).
const LITER_VOLUME_PATTERN = /(^|\s)\d+l(\s|$)/

/** Deterministic keyword classification of a normalized product name into one of its item
 *  category's fixed subcategories — `null` when nothing matches confidently (never a guess). The
 *  caller (lib/categorization.ts) treats this as one priority tier among several; a `null` here
 *  does not stop fuzzy or AI matching from being tried next. */
export function classifySubcategoryByKeyword(category: ItemCategory, normalizedName: string): string | null {
  if (category === 'Potraviny' && BEVERAGE_BRAND_KEYWORDS.some((keyword) => normalizedName.includes(keyword))) return 'Nápoje'
  // Padded so a boundary keyword (" med ") also matches at the start or end of the name.
  const haystack = ` ${normalizedName} `
  for (const rule of RULES_BY_CATEGORY[category]) {
    if (rule.subcategory === 'Ovoce a zelenina' && LITER_VOLUME_PATTERN.test(normalizedName)) continue
    if (rule.keywords.some((keyword) => haystack.includes(keyword)) && !rule.exclude?.some((keyword) => haystack.includes(keyword))) return rule.subcategory
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
