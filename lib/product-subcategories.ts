// Fixed subcategory taxonomy for products/inventory, one layer under the existing `item_category`
// enum (Potraviny/Drogerie/Děti/Domácnost/Ostatní). The same values are used by products,
// purchase_items, pantry_items and ordinary receipt-derived budget expenses, so one product has one
// shared category/subcategory across Zásoby and Rozpočet. Non-product expense targets keep their own
// separate subcategory taxonomy in lib/expense-categories.ts.
//
// A product aimed at children is not forced into "Děti": a Kinder chocolate stays Potraviny ▸
// Sladkosti, with `isChildOriented` as a separate tag (see `products.is_child_oriented` in the
// schema). Children's food and drinks the chains sell as such do sit under Děti (Děti ▸ Dětské
// nápoje for Jupík, Kubík and Yess — owner decision 2026-10-06, lib/product-brands.ts).

import { brandOf, brandSubcategoryIn } from '@/lib/product-brands'
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
  // "Zdraví a doplňky stravy" and "Doplňky a oblečení" (owner approval 2026-10-06): vitamins, medicines
  // and plasters, and hosiery, glasses and hair accessories, which sat unplaced or in Ostatní drogerie.
  Drogerie: ['Praní', 'Mytí nádobí', 'Čištění domácnosti', 'Kosmetika', 'Hygiena', 'Dětská hygiena', 'Zdraví a doplňky stravy', 'Doplňky a oblečení', 'Ostatní drogerie'],
  // "Zahrada" (2026-10-06): the same name as the budget's existing Domácnost ▸ Zahrada.
  Domácnost: ['Papír', 'Kuchyň', 'Úklid', 'Zahrada', 'Ostatní'],
  // Food for children (owner request 2026-10-04: "Přidej do Děti i potravinové podkategorie"):
  // the chains list baby milk, purées, porridge, snacks and drinks under Děti, not under Potraviny.
  Děti: ['Pleny', 'Dětská kosmetika', 'Dětské potřeby', 'Hračky', 'Kojenecké mléko', 'Příkrmy', 'Kaše a cereálie', 'Dětské svačinky', 'Dětské nápoje', 'Ostatní'],
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

/** Subcategory names in Czech alphabetical order (A–Z, "Ch" after "H") — the order every picker and
 *  every overview by subcategory shows them in (owner request 2026-10-06). */
export function sortSubcategoryNames(names: readonly string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, 'cs'))
}

const SORTED_SUBCATEGORIES: Record<ItemCategory, readonly string[]> = {
  Potraviny: sortSubcategoryNames(PRODUCT_SUBCATEGORIES.Potraviny),
  Drogerie: sortSubcategoryNames(PRODUCT_SUBCATEGORIES.Drogerie),
  Domácnost: sortSubcategoryNames(PRODUCT_SUBCATEGORIES.Domácnost),
  Děti: sortSubcategoryNames(PRODUCT_SUBCATEGORIES.Děti),
  Ostatní: sortSubcategoryNames(PRODUCT_SUBCATEGORIES.Ostatní),
}

/** The subcategories offered for an item category, A–Z. */
export function subcategoriesOfItem(category: ItemCategory): readonly string[] {
  return SORTED_SUBCATEGORIES[category]
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
 *  the name falls through to a later rule or stays unplaced. `excludeBefore` keywords veto it only
 *  when they come before the first matching keyword: a name says what the product is first and what
 *  it tastes of or contains after — "Mléčná čokoláda plněná likérem" is chocolate, while
 *  "Bottega Liquore 17% čokoláda" is a liqueur. */
type SubcategoryRule = { subcategory: string; keywords: string[]; exclude?: string[]; excludeBefore?: string[]; headOnly?: boolean; startOnly?: boolean }

/** What may stand before a `startOnly` keyword: produce brands and plain qualifiers ("BIO", "Metro
 *  Chef", "Česká Farma", "cherry", a colour). Any other word in front ("Mirinda Mango", "ZON Malina",
 *  "Avokádo Jalovec") means the fruit is only a flavour or a brand, and the rule does not apply. */
const PRODUCE_PREFIXES = [
  'bio', 'alb', 'metro chef', 'bon via', 'bonvia', 'premium', 'fine life', 'čerstvě utrženo', 'čerstvé', 'čerstvá', 'česká farma', 'farma', 'aro', 'bonduelle', 'gold', 'efko', 'clever', 'billa',
  'albert', "nature's promise", 'nature s promise', 'jeden tag', 'monoprix', 'alnatura', 'dmbio', 'eat me', 'titbit', 'cherry', 'baby', 'mini', 'zralé', 'zralý', 'zlatá', 'velké', 'velký',
  'červená', 'červené', 'červený', 'žlutá', 'žluté', 'žlutý', 'bílá', 'bílé', 'bílý', 'černé', 'černý', 'zelená', 'zelené', 'zelený', 'sladká', 'sladké', 'kanadské', 'české', 'český',
]

/** Words after which a name lists what the product contains or tastes of: "Gervais s paprikou",
 *  "Gnocchi s Parmigiano", "Jogurt bez laktózy". A `headOnly` rule's keyword must come before the
 *  first of them — the fruit, vegetable or cheese must be the product itself. */
const LINKING_WORDS = [' s ', ' se ', ' z ', ' ze ', ' na ', ' v ', ' ve ', ' do ', ' pro ', ' bez ', ' příchu', ' prichu']

/** Words naming a kind of food that a drink, nut, spice or pulse is often only the flavour or the
 *  filling of ("čokoláda s kousky kávy", "omáčka s fazolemi", "jogurt … vaječný likér"). Used as
 *  `excludeBefore` by the subcategories added on 2026-10-03, after a first run in production put
 *  such products there (2026-10-03). */
const FOOD_HEADS = [
  'čokolád', 'tyčink', 'sušenk', 'oplat', 'bonbon', 'bonbón', 'pralin', 'jogurt', ' dezert ', 'pudink', 'puding', 'pudding', 'kaše ', 'granol', 'müsli',
  'polévka', 'omáčk', 'perník', 'závin', 'lupínk', 'chips', 'tortil', 'trubičk', 'zmrzlin', 'nanuk', 'figurk', 'krekr',
]

// The first rule that matches wins, so a narrower or ambiguous group comes before a broader one:
// non-alcoholic beer before alcohol; alcohol, coffee and tea before "Nápoje"; ready meals and plant
// alternatives before the eggs, dairy and meat they mention; fish before meat and tins ("Tuňák v
// konzervě" is fish); pulses before vegetables ("Fazole v nálevu"); sauces before spices ("Rajská
// omáčka … koření"); oil before nuts ("Olej z vlašských ořechů"). Every keyword was checked against
// the real catalog (2026-10-03): a short one is tied to word boundaries where it is part of other
// words ("čočk" is "cock" in "Cocktails", "caj" starts "Cajthaml").
/** Drinks, sweets, jams, teas, seasonings and snacks only flavoured with — or named after — a fruit or
 *  vegetable ("Monster Mango", "Malinový džem", "Paprika mletá", "Jahodové knedlíky"). */
const PRODUCE_EXCLUDE = [
  ...FOOD_HEADS, 'nápoj', 'napoj', 'drink', 'nektar', 'džus', 'dzus', 'šťáv', 'sirup', 'limonád', 'smoothie', 'kombucha', 'energy', 'tonic', ' voda', 'příchu', 'prichu',
  'jogurt', 'žvýk', 'džem', 'marmel', 'povidl', 'kompot', 'konzerv', ' želé ', 'ocet', ' čaj', 'čaje', ' tea', 'müsli', 'sušen', 'kysan', 'sterilovan', 'nálev',
  'mlet', 'lahůdkov', 'uzen', 'koření', 'kořen', 'granul', 'protlak', 'pesto', 'kečup', 'krmiv', 'kočk', ' psy', 'likér', 'cider', ' víno', 'mošt', 'krém', 'kousky',
  // Drinks, sweets and snacks sold under a fruit's name.
  'shock', 'cappy', 'rauch', 'relax', 'hello', 'tymbark', 'pfanner', 'lindt', 'milka', 'fruitfunk', 'kiddylicious', 'semtex', 'hami', 'gervais', 'jarritos', 'saguaro', 'il sano', 'onigiri', 'sushi',
  // Produce is sold as a noun ("Jahody", "Švestky"); the adjective names a flavour ("Jahodové knedlíky").
  'jahodov', 'malinov', 'meruňkov', 'borůvkov', 'švestkov', 'višňov', 'třešňov', 'hruškov', 'jablečn', 'broskvov', 'ananasov', 'mangov', 'citronov', 'pomerančov',
  'knedl', 'kuličk', 'lodičk', 'rolls', 'plátky',
  // Spices sold under the brand "Avokádo" ("Avokádo Kmín celý").
  'kmín', 'bobkov', 'pepř', 'jalovec', 'majoránk', 'oregano', 'tymián', 'rozmarýn', 'skořic', 'hřebíč', 'badyán', 'nové koření', 'hořčic',
  // Dishes and snacks made from a vegetable.
  'snack', 'taštičk', 'řízek', 'pomaz', 'gyoza', 'mysli', 'paprika sladká',
]

const POTRAVINY_RULES: SubcategoryRule[] = [
  { subcategory: 'Mražené potraviny', keywords: ['mražen', 'zmrzlina', 'mraž', 'hranolky', 'nanuk', 'sorbet', 'magnum', 'gelato', 'mrož', 'miamo'], exclude: [' koření ', 'kořen'] },
  { subcategory: 'Nápoje', keywords: ['nealko', ' 0 0 '] },
  {
    subcategory: 'Alkoholické nápoje',
    keywords: [
      ' pivo ', ' piva ', 'lezak', 'ležák', ' ipa ', ' vino ', ' vína ', 'víno ', ' sekt ', 'prosecco', 'šampaňsk', 'champagne', 'spumante', 'cider', 'medovina',
      'vodka', ' rum ', 'whisk', ' gin ', 'liker', 'likér', 'liquore', 'liqueur', 'tequila', 'brandy', 'koňak', 'slivovice', 'hruškovice', 'meruňkovice', 'becherovka', 'fernet', 'griotka', 'aperitiv',
      'merlot', 'cabernet', 'chardonnay', 'sauvignon', 'riesling', 'ryzlink', 'frankovka', 'rulandsk', 'müller thurgau', 'pinot', 'primitivo', 'tramín', 'veltlínsk', 'svatovavřineck', 'zweigelt', 'chianti', 'rioja', 'hibernal', 'muškát moravský', 'tempranillo', 'garnacha', 'shiraz', 'syrah', 'malbec', 'montepulciano', 'peprmint',
      'suché červené', 'suché bílé', 'polosuché', 'polosladké',
      ' igt ', ' doc ', ' docg ', ' 0 75 l', ' 0 75l',
      // Beer and spirits named only by brand or style (non-alcoholic beer is caught by "nealko" above).
      // Beer styles named in English (2026-10-06: "Irish stout 12°", "Clock APA 12°").
      ' stout', ' apa ', ' lager', ' porter ', ' weizen', 'pale ale',
      'výčepní', 'kozel', 'pilsner', 'gambrinus', 'radegast', 'staropramen', 'krušovic', 'budvar', 'svijan', 'božkov', 'chateau', 'château', ' brut', 'jägermeister', 'bacardi', 'captain morgan', 'meruňkovic', 'jelínek', 'žufánek', 'frisco',
    ],
    // Food flavoured with a drink: "zakysaná smetana vaječný likér", "Cheddar … sýr s whisky".
    // ... and bouillon "s chutí červeného vína" is a seasoning.
    exclude: ['zakysan', 'cheddar', ' sýr ', 'sýrov', 'krekr', 'bujón', 'bujon'],
    excludeBefore: [...FOOD_HEADS, 'mléko', 'paštik'],
  },
  {
    subcategory: 'Lahůdky a hotová jídla',
    keywords: [
      'bramborový salát', 'vlašský salát', 'těstovinový salát', 'pochoutkový salát', 'vajíčkový salát', 'salát vajíčkový', 'majonézový salát', 'hotové jídlo', 'hotová jídla',
      ' aspik ', ' aspiku ', 'utopenc', 'obložen', 'sendvič', ' wrap ',
      // A soup, ready or instant — "polévka" only, so "na polévku" and "polévková směs" stay out.
      'polévka', 'do hrnečku', 'vitana bistro', 's játrovými knedlíčky',
      'pizza', 'kimchi',
      // Deli salads named by kind (2026-10-06, checked against the catalog).
      'pařížský salát', 'šopský salát', 'zelný salát', 'rajčatový salát', 'camping salát', 'rumcajs salát', 'salát á la krab', 'krabí salát', 'lahůdkový salát', 'coleslaw', 'wakame',
    ],
    // Toast bread called "sendvič" and tortilla wraps are bread; pizza flour, sauce or spice is no pizza.
    exclude: [' toust ', 'tortil', 'mouka', 'omáčk', 'koření', 'kořen', 'směs na', 'tyčink', 'chips', 'lupínk', 'vroubk', 'krekr'],
  },
  {
    // Bouillon, Masox, gravy, roux and marinades are seasonings (owner, 2026-10-06: "Vitana Masox,
    // šťáva na maso atd., všechno to jsou dochucovadla"). Before meat and vegetables, which their
    // names mention ("Hovězí bujón", "Zeleninový vývar"); after ready meals, so a soup ("Vývar s
    // játrovými knedlíčky", "polévka") stays one. The thing itself, not what is cooked in it: "Kuřecí
    // křídla v marinádě" stay meat (headOnly).
    subcategory: 'Omáčky a dochucovadla',
    keywords: [
      'masox', 'bujón', 'bujon', 'vývar', 'šťáva na maso', 'šťáva k masu', 'šťáva na čínu', 'šťáva drůbeží', 'šťáva vepřová', 'šťáva hovězí', 'vepřová šťáva', 'jíška', 'jíšky', 'zápražk',
      'marináda', 'marinády',
    ],
    // "Old Cock Vývar" is a beer.
    exclude: ['knedlíč', 'nudl', 'zavářk', 'porce', 'ležák', 'pivo', 'plech', 'old cock'],
    headOnly: true,
  },
  {
    subcategory: 'Rostlinné alternativy',
    keywords: ['rostlinný nápoj', 'rostlinná alternativa', 'rostlinný jogurt', 'rostlinný sýr', ' tofu', 'tempeh', 'seitan', 'sójový nápoj', 'ovesný nápoj', 'mandlový nápoj', 'rýžový nápoj', 'kokosový nápoj', 'alpro', 'oatly'],
    excludeBefore: FOOD_HEADS,
  },
  {
    // "Vegan" on its own also names chocolates, sauces and biscuits, which stay where they belong.
    // ("Veggie" is no keyword: it names crisps, sweets and kimchi as often as meat alternatives.)
    subcategory: 'Rostlinné alternativy',
    keywords: ['vegan'],
    exclude: ['čokolád', 'omáčk', 'sušenk', 'granol', 'bonbon', 'tyčink', 'pomazánk', 'protein', 'puding', 'pudding', 'chléb', 'croissant'],
  },
  { subcategory: 'Slané pochutiny', keywords: ['brambůrk', 'bramburk', 'chipsy', ' chips', 'tyčink slan', 'arašíd', 'arasid', 'krekr', 'křupky', 'tyčinky pekařské', 'doritos', 'lupínk', 'popcorn', 'preclík', 'nachos', 'slané tyčinky', 'solené tyčinky',
    // Salty sticks and snacks named by kind (2026-10-06); plain "tyčinky" also names crab sticks,
    // grill sticks and fertilizer sticks, so only these.
    'tyčinky solené', 'tyčinky pepřové', 'pepřové tyčinky', 'sýrové tyčinky', 'bramborové tyčinky', 'hradecké tyčinky', 'bramborový snack', 'kukuřičný snack', 'žitný snack'],
    // Peanuts in chocolate, peanut butter and peanut cookies are no salty snack.
    exclude: ['strouhank', 'čokolád', 'arašídové máslo', 'cookies', 'sušenk'],
  },
  {
    subcategory: 'Pečivo',
    keywords: [
      'chleb', 'rohlík', 'rohliky', 'houska', 'bageta', 'croissant', 'peciv', 'bulka', 'veka', ' toust ', 'tortil', 'kaiserk', 'koláč', 'buchta', 'závin', 'vánočk', 'mazanec', 'ciabatt', 'focaccia',
      // Crispbread and sandwich bread (2026-10-06).
      'křehké plátky', 'knäckebrot', 'knackebrot', 'finn crisp', 'sandwich', ' žemle', 'bagel',
    ],
    // "Rohlik.cz" is a shop's name, not a roll; seasoning for tortillas is no bread. Flour named
    // after bread ("Mouka pšeničná chlebová") is flour, but bread made of flour ("Tortilly z pšeničné
    // mouky", "Chléb bez mouky") is bread: the flour word vetoes only when it comes first.
    // Sandwich biscuits are sweets, wagyu "tenké křehké plátky" are meat.
    exclude: ['rohlik cz', ' koření ', 'kořenící', 'sušenk', 'gullón', 'gullon', 'bahlsen', 'biscuit', 'wagyu', 'sukiyaki'],
    excludeBefore: ['mouka', 'mouky'],
  },
  {
    subcategory: 'Mléčné výrobky',
    keywords: ['mléko', 'mleko', 'mléčn', 'jogurt', 'kefír', 'kefir', 'sýr', 'syr', 'máslo', 'maslo', 'smetana', 'tvaroh', 'skyr', 'termix', 'pribináček', 'pribinacek', 'gouda', 'camembert', 'eidam', 'hermelín', 'mozzarell', 'parmaz', 'cheddar', 'niva', 'brie', 'feta', 'lučina', 'cottage', 'mascarpone', 'ricotta', 'halloumi', 'grana padano', 'parmigiano', 'ementál', 'tvarůžk', 'žervé', 'lipánek', 'smetanov', 'creme fraiche', 'actimel', 'activia', 'kiri '],
    headOnly: true,
    exclude: ['mléčná čokoláda', 'mléčné čokolády', 'mléčnou čokolád', 'mléčné čokoládě', 'arašídové máslo', 'ořechové máslo', 'mandlové máslo', 'kakaové máslo', 'bambucké máslo'],
  },
  {
    subcategory: 'Ryby a mořské plody',
    keywords: [
      'losos', 'tuňák', 'tunak', 'treska', 'tresčí', ' sleď', ' sledě', 'makrel', 'krevet', 'pstruh', ' kapr', 'sardink', 'sardel', ' ryba ', ' ryby ', ' rybí ', ' rybích ', 'rybí filé',
      'chobotnic', 'kalamár', 'surimi', 'mečoun', 'tilapie', 'pangasius', 'candát', ' štika', ' mušle', 'ančovič', 'hering', 'šprot',
    ],
    // Seasoning for fish and fish sauce are not fish ("Krevety … s černým kořením" are).
    exclude: [' koření ', 'rybí omáčk', 'fish sauce'],
    excludeBefore: FOOD_HEADS,
  },
  {
    subcategory: 'Maso a uzeniny',
    keywords: [
      'šunka', 'sunka', 'salám', 'salam', 'párky', 'parky', 'klobás', 'klobas', 'maso', 'kuřecí', 'kureci', 'vepřov', 'veprov', 'hovězí', 'hovezi', 'slanina', 'uzenin', 'mortadel', 'paštik',
      ' kuře ', ' kuřete', ' krůt', 'kachn', 'telecí', 'jehněčí', 'králík', 'prosciutto', 'pancetta', 'chorizo', 'párečk', 'tlačenk', 'jitrnic', 'jelito', 'špekáč', 'vysočina', 'debrecín',
      'krkovic', 'svíčková', 'roštěn', 'žebírk', 'bratwurst', 'frankfurt', 'játr', 'stehn', 'křídl', 'kabanos',
      ' husa', ' husí', ' koleno', ' steak', 'tomahawk',
    ],
    // A vegetable, cheese or tofu "steak" is no meat.
    exclude: ['květák', 'celer', 'zeleninov', 'hermelín', 'sýrov', 'tofu', 'čokolád', 'fries', 'frites', 'hranol', 'vegi', 'koření', 'kořen', 'příchu', 'prichu', 'krmiv', 'kočk', ' psy', 'pamlsk', 'veggie', 'vegetarián', 'rostlinn', 'sádlo', 'omáčk', 'nudle', 'těstovin', 'tortellin', 'ravioli'],
  },
  { subcategory: 'Luštěniny', keywords: ['čočka', 'čočky', 'čočkov', 'čočce', 'fazol', 'cizrn', ' hrách ', 'luštěnin', 'lusteniny'], exclude: ['čokolád'], excludeBefore: FOOD_HEADS },
  {
    subcategory: 'Ovoce a zelenina',
    keywords: ['jablk', 'banán', 'banan', 'pomeranč', 'pomeranc', 'zelenina', 'ovoce', 'rajče', 'rajce', 'okurk', 'brambor', 'cibul', 'mrkev'],
    exclude: PRODUCE_EXCLUDE,
    headOnly: true,
  },
  {
    // More kinds of produce — only as the first word of the name (after a produce brand or a plain
    // qualifier): "Metro Chef Žampiony", "Cherry rajčata", but never "Mirinda Mango".
    subcategory: 'Ovoce a zelenina',
    keywords: [
      'rajčat', 'mango', 'hrušk', 'broskv', 'grapefruit', 'jahod', 'malin', 'borůvk', 'ananas', 'citron', 'limetk', 'kiwi', 'meloun', 'hrozn', 'švestk', 'meruňk', 'třešn', 'višn',
      'rukola', 'polníč', 'salát gem', 'salat l gem', 'salát římský', 'římský salát', 'salát ledový', 'salát rukola', 'salát polníček', 'hřib', 'liška obecná', 'lišky obecné',
      'žampion', 'špenát', 'brokolic', 'květák', 'cuket', 'lilek', 'dýně', 'ledový salát', 'zelí', 'kapust', 'celer', 'petržel', 'pórek', 'ředkvičk', 'řepa', 'kukuřice', 'hrášek', 'paprika', 'česnek',
    ],
    exclude: PRODUCE_EXCLUDE,
    startOnly: true,
  },
  {
    subcategory: 'Káva a čaj',
    keywords: [
      ' káva', ' kávy', 'kávová zrna', 'zrnková káva', 'mletá káva', 'instantní káva', 'espresso', 'cappuccino', ' kafe ', ' čaj ', ' čaje ', ' čajů ', ' čajový', 'rooibos', 'yerba',
      'kávové kapsle', 'kapsle', 'nescafé', 'nescafe', 'dolce gusto', 'nespresso', 'matcha', 'caffe', ' latte',
    ],
    // Tea drinks, syrups and kombucha are drinks; a bar or biscuit "with espresso" is a sweet;
    // dishwasher capsules are no coffee.
    exclude: ['sirup', 'kombucha', 'extrakt', 'tyčink', 'myčk', 'jogurt', 'energy', 'drink', 'lívance', 'snídaňová', 'směs na', 'čokolád', 'mochi', 'zmrzlin', 'limonád'],
    excludeBefore: [...FOOD_HEADS.filter((head) => head !== 'pralin'), 'krém', 'nápoj'],
  },
  {
    subcategory: 'Nápoje',
    keywords: [
      'voda', 'napoj', 'nápoj', 'limonada', 'limonáda', 'cola', 'sok', 'šťáva', 'stava', 'džus', 'dzus', 'sirup',
      'drink', 'energetick', 'tonic', 'nektar', 'kombucha', ' mošt', 'ice tea', 'ledový čaj', 'monster', 'red bull', 'smoothie', 'isoton', 'ginger ale',
    ],
    exclude: ['tyčink', 'bonbon', 'bonbón', ' želé '],
  },
  {
    subcategory: 'Sladkosti',
    keywords: [
      'čokolád', 'pralink', 'tyčinka', 'bonbon', 'bonbón', 'sušenk', 'susenk', 'oplatk', 'zmrzlin', 'dort', 'keks', 'perník',
      'žvýkačk', 'orbit', 'wrigley', 'haribo', 'kinder', 'piškot', 'lízátk', 'chupa chups', 'marshmallow', 'gumov', ' dezert', 'puding', 'pudink', 'trubičk',
    ],
    // Gingerbread spice and baking powder are for baking, and muesli with chocolate is breakfast.
    exclude: [' koření ', 'kypřic', 'kypříc', 'prášek do', 'müsli', 'musli', 'cereálie'],
  },
  {
    subcategory: 'Omáčky a dochucovadla',
    keywords: [
      'kečup', 'kecup', 'hořčice', 'horcice', 'majonéz', 'majonez', 'omáčk', 'omack', 'dochucovad', ' ocet', 'sójová omáčka',
      'pesto', 'protlak', 'passata', 'dresink', 'dressing', 'bujón', 'bujon', 'salsa', 'sriracha', 'worcester', 'tabasco', 'teriyaki',
    ],
    // "Nudle s příchutí Teriyaki" are noodles.
    exclude: ['nudle', 'příchu', 'prichu', 'chips', 'lupínk'],
  },
  {
    subcategory: 'Džemy, med a pomazánky',
    keywords: ['džem', 'dzem', 'marmelád', 'lekvár', 'povidl', ' med ', ' medu ', 'nutella', 'pomazánk', 'pomazank', 'hummus', 'arašídové máslo', 'ořechové máslo', 'mandlové máslo'],
    // "Perník s povidly", "Tyčinky ořechy a med" are sweets.
    excludeBefore: FOOD_HEADS,
  },
  {
    subcategory: 'Konzervy',
    keywords: [
      'konzerv', 'kompot', 'olivy', 'olivami', 'sterilovan', 'v nálevu', 'kysané zelí',
      // Pickled and tinned goods named by their brine or cut (2026-10-06).
      'sladkém nálevu', 'slaném nálevu', 'sladkokyselém nálevu', 'slanokyselém nálevu', 'kořeněném nálevu', 'loupaná rajčata', 'krájená rajčata', 'pasírovaná rajčata', 'rajčata pasírovaná', 'rajčata loupaná', 'rajčata krájená',
    ],
  },
  { subcategory: 'Cereálie a snídaně', keywords: ['cereál', 'cerealie', 'müsli', 'musli', 'ovesné vločky', 'ovesne vlocky', 'kaše '], exclude: [' koření ', 'krupice', 'cereální'] },
  {
    subcategory: 'Těstoviny a rýže',
    keywords: [
      'těstovin', 'testovin', 'rýže', 'ryze', 'špagety', 'spagety', 'nudle', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'pappardelle', 'lasagne', 'gnocchi', 'tortellini', 'ravioli',
      'vřetena', 'kolínka', 'farfalle', 'kuskus', 'bulgur', 'quinoa', 'kroupy',
    ],
  },
  {
    subcategory: 'Oleje a tuky',
    keywords: [' olej ', ' oleje ', 'sádlo', 'margarín', 'margarin', 'palmarín', 'palmarin', ' ghí', ' ghee', 'kokosový tuk', 'pokrmový tuk'],
  },
  {
    subcategory: 'Ořechy, semínka a sušené ovoce',
    keywords: [
      'ořech', 'orech', 'oříšk', 'orisk', 'mandl', 'kešu', 'kesu', 'pistáci', 'semínk', 'semink', ' chia', 'rozink', 'datle', 'sušené ovoce', 'sušené meruňky', 'sušené švestky', 'brusinky sušené',
      // Dried fruit named fruit-first (2026-10-06: "GRIZLY Švestky sušené", "Nice Bites Mango plátky").
      'švestky sušené', 'meruňky sušené', 'fíky sušené', 'sušené fíky', 'sušené mango', 'mango plátky', 'banán plátky', 'ananas plátky', 'jablečné plátky', 'lísková jádra', 'sezam loupan', 'sezam neloupan', 'černý sezam', 'bílý sezam',
    ],
    // Porridge, granola and bars with nuts are breakfast or sweets, not nuts; fruit in juice is tinned.
    exclude: ['tyčink', 'granol', 'kaše ', 'müsli', 'kořen', 'šťáv', 'nálev'],
    excludeBefore: [...FOOD_HEADS, 'krém', 'paštik'],
  },
  {
    subcategory: 'Koření a bylinky',
    keywords: [
      'koření', 'koreni', ' pepř ', ' pepře ', ' sůl ', ' sul ', 'mletá paprika', 'paprika mletá', 'paprika sladká', 'skořice', 'oregano', 'bazalka', 'majoránka', 'kmín', 'bobkov', 'muškátový ořech',
      'hřebíček', 'kurkum', ' kari ', 'drcené chilli', 'chilli mleté', 'sušené chilli', 'chilli koření', 'tymián', 'rozmarýn', 'koriandr', 'dobromysl', 'zázvor mletý', 'česnek granulovaný', 'česnek sušený', 'vanilkový lusk', 'vanilkové lusky',
    ],
    // "Perníkové koření" is a spice; "Ovesná kaše jablko a skořice" is not.
    excludeBefore: FOOD_HEADS.filter((head) => head !== 'perník'),
  },
  { subcategory: 'Dětská výživa', keywords: ['dětská výživa', 'detska vyziva', 'příkrm', 'prikrm', 'kojenecké mléko', 'kojenecke mleko', 'kapsičk'], exclude: ['kočk', ' psy', 'krmiv', 'protein'] },
  {
    subcategory: 'Mouka a pečení',
    keywords: [
      'mouka', 'mouky', ' droždí', 'kvasnice', 'prášek do pečiva', 'kypřic', 'krupice', 'strouhank', ' cukr ', 'cukr krupice', 'cukr krystal', 'cukr moučka', 'třtinový cukr', 'vanilkový cukr', 'vanilinový cukr',
      'kakaový prášek', 'kakao na pečení', 'holandské kakao', 'pudinkový prášek', 'želatina', 'krupičk',
    ],
    exclude: ['bez droždí'],
  },
  {
    subcategory: 'Vejce',
    keywords: [' vejce', ' vajíčka', ' vajíčko', ' vajec ', 'křepelčí vejce'],
    exclude: ['polévk', 'překvapení', 'čokolád', 'kulajda', 's vejcem', 'do kapsy', 'salát'],
  },
  { subcategory: 'Trvanlivé potraviny', keywords: ['trvanl'] },
]

// Drugstore goods (2026-10-04, checked against the catalog): the chains also sell tights, glasses and
// contact lenses here, which go to "Ostatní drogerie" before any cosmetics word in their name can
// claim them.
const DROGERIE_RULES: SubcategoryRule[] = [
  {
    subcategory: 'Praní',
    keywords: ['prášek na praní', 'prasek na prani', 'aviváž', 'avivaz', 'gel na praní', 'gel na prani', 'kapsle na praní', 'prací', 'praci', 'persil', 'ariel', 'lenor', 'perwoll', 'odstraňovač skvrn', 'vanish'],
  },
  { subcategory: 'Mytí nádobí', keywords: [' jar ', 'mytí nádobí', 'myti nadobi', 'tableta do myčky', 'tableta do mycky', 'myčk', 'somat'] },
  { subcategory: 'Čištění domácnosti', keywords: ['savo', 'čistič', 'cistic', 'úklid', 'uklid', 'wc gel', 'dezinfek', ' wc ', 'čisticí', 'odvápňov'] },
  {
    // Before Dětská hygiena, so a children's syrup or vitamin is health first (2026-10-06).
    subcategory: 'Zdraví a doplňky stravy',
    keywords: [
      'vitamín', 'vitamin', ' tablet', 'kapsle', 'kapslí', 'doplněk stravy', 'doplňky stravy', 'probiotik', 'hořčík', 'magnesium', 'zinek', ' selen', 'omega 3', 'kolagen', 'echinacea',
      'hlíva', 'ostropest', 'želatink', 'náplast', 'obvaz', 'obinadl', 'na kašel', 'proti kašli', 'bylinný sirup', 'pastilk', 'nosní sprej', 'sprej do nosu', 'kapky do nosu', 'oční kapky',
      'oční sprej', 'kontaktní čočky', 'kontaktních čoček', 'roztok na čočky', 'fyziologický roztok', 'kombinovaný roztok', 'brýle na čtení', 'dioptrick', 'dioprick', 'teploměr', 'paralen',
      'ibalgin', 'ibuprofen', 'nurofen', 'acylpyrin', 'aspirin', 'panadol', ' mast ', 'kloubní výživa', 'imunit', 'léčiv',
    ],
    // Cosmetics with a vitamin ("Balea sérum s vitamínem C"), lip balm and dishwasher tablets are no health products.
    exclude: ['na rty', 'myčk', 'krém', 'sérum', 'fluid', 'kondicionér', 'šampon', ' spf', 'tonikum', 'micelár', 'zubních náhrad', 'ústní voda', 'make up', 'máslo', 'kúra', 'balzám', 'maska', 'na nehty', 'odličov', 'na praní'],
    excludeBefore: ['krém', 'šampon', 'sérum', 'balzám', 'mléko', 'mýdlo', 'olej', 'pleťov', 'tělov', 'maska', 'sprchov', 'zubní pasta', 'kosmetick', 'pěna'],
  },
  { subcategory: 'Dětská hygiena', keywords: ['dětsk', 'detsk'] },
  {
    subcategory: 'Doplňky a oblečení',
    keywords: [
      'punčoch', 'ponožk', 'kalhotky', 'podkolenk', 'legín', 'tregín', 'podprsenk', 'spodní prádlo', 'bandeletk', 'brýle', 'pouzdro na brýle', 'gumičk', 'sponk', 'čelenk', 'hřeben',
      'kartáč na vlasy', 'žabky', 'pantofl', 'deštník',
    ],
    exclude: ['menstruač', 'plenkov', 'inkontin'],
  },
  {
    subcategory: 'Hygiena',
    keywords: [
      'zubní', 'zubni', 'sprchový', 'sprchovy', 'mýdlo', 'mydlo', 'toaletní papír', 'toaletni papir', 'vložky', 'vlozky', 'tampon',
      'ústní voda', 'ústní', 'holicí', 'holení', 'žiletk', 'strojek', 'kondom', 'durex', 'intimní', 'menstruač', 'vatové', 'vatov', 'tyčinky do uší', 'vlhčené ubrousky', 'sprchov',
    ],
  },
  {
    subcategory: 'Kosmetika',
    keywords: [
      'šampon', 'sampon', 'krém', 'krem', 'deodorant', 'kosmetik', 'rtěnka', 'rtenka',
      'na vlasy', 'vlasů', 'kondicionér', 'balzám', 'barva na vlasy', 'maska', 'sérum', 'řasenk', 'tužka na', 'oční linky', 'lak na nehty', 'nehty', 'nehtů', 'make up', 'makeup',
      'pudr', 'korektor', 'stíny', 'stínů', 'lesk na rty', 'na rty', 'obočí', 'tvářenk', 'parfém', ' edt', ' edp', 'toaletní voda', 'pleťov', 'tělov', 'opalování', ' spf', 'antiperspirant',
      'micelární', 'odličov', 'tonikum', 'peeling', 'styling', 'lak na vlasy',
    ],
  },
]

const DOMACNOST_RULES: SubcategoryRule[] = [
  {
    // First, so garden gloves and watering cans are garden goods (2026-10-06).
    subcategory: 'Zahrada',
    keywords: [
      'substrát', 'hnojiv', 'zemina', 'rašelin', 'květináč', 'truhlík', 'osivo', 'osiva', 'travní směs', 'trávník', 'zahradní', 'postřik', 'slimák', 'mšic', 'pokojové rostliny', 'konev', 'mulč',
    ],
  },
  { subcategory: 'Papír', keywords: ['toaletní papír', 'toaletni papir', 'kuchyňské utěrky', 'kuchynske uterky', 'ubrousk', 'papírov', 'papirov'] },
  { subcategory: 'Kuchyň', keywords: ['alobal', 'fólie', 'folie', 'sáčky', 'sacky', 'nádobí', 'nadobi', 'hrnec', 'pánev', 'panev'] },
  {
    // Cleaning, laundry and dishwasher products sold as household goods.
    subcategory: 'Úklid',
    keywords: [
      'úklid', 'uklid', 'houba na nádobí', 'houba na nadobi', 'hadr', 'mop', 'koště', 'koste',
      'prací', 'praci', 'aviváž', 'persil', 'ariel', 'lenor', 'perwoll', 'čistič', 'čisticí', ' wc ', 'myčk', 'somat', 'savo', 'dezinfek', 'odstraňovač', 'skvrn',
      'houbičk', 'prachovk', 'rukavice', 'pytle', 'odpadk', 'kolíčk', 'impregnac',
    ],
  },
  { subcategory: 'Ostatní', keywords: ['svíčk', 'svícen', 'osvěžovač', 'difuzér', 'air wick', 'glade', 'vonn', 'baterie', 'žárovk', 'deštník', 'proti hmyzu'] },
]

const DETI_RULES: SubcategoryRule[] = [
  { subcategory: 'Pleny', keywords: ['plen', 'pampers'] },
  // Children's food first, so a purée "s tvarohovým krémem" or "olej" in a ready meal never reads as
  // cosmetics; a purée with oat flakes is a purée, a milk "s kaší" is porridge.
  { subcategory: 'Příkrmy', keywords: ['příkrm', 'prikrm', 'přesnídávk', 'pyré', 'kašičk', 'polévka', 'vývar', 'bolognese', 'boloňsk', 'smoothie', 'těstovin', 'špagety'] },
  { subcategory: 'Kaše a cereálie', keywords: ['kaše', 'kaši', 'müsli', 'cereál', 'vločk'] },
  {
    subcategory: 'Kojenecké mléko',
    keywords: ['kojenecké mléko', 'kojenecká výživa', 'mléčná výživa', 'batolecí', 'počáteční mléko', 'pokračovací mléko', 'junior combiotik', 'beba', 'nutrilon', 'kendamil'],
    // A baby bottle ("kojenecká lahev") is no milk.
    exclude: ['lahev', 'láhev', 'dávkovač'],
  },
  {
    subcategory: 'Dětské svačinky',
    keywords: ['sušenk', 'křupk', 'krupk', 'tyčink', 'krekr', 'oplat', 'preclík', 'popcorn', 'snack', 'keksík', 'piškot', 'bonbónk', 'želé', 'lyofiliz', 'rybičky', 'taštičk', 'dezert', 'prstýnk', 'svačink'],
    exclude: ['mycí', 'sprej', 'tělov', 'krém na'],
  },
  {
    subcategory: 'Dětské nápoje',
    keywords: ['nápoj', 'napoj', ' čaj', 'šťáva', 'džus', ' voda'],
    // "tělová voda" and "toaletní voda" are cosmetics.
    exclude: ['tělov', 'toaletní', 'parfém', ' edt', 'mycí'],
  },
  {
    subcategory: 'Dětská kosmetika',
    keywords: [
      'dětský krém', 'detsky krem', 'dětský šampon', 'detsky sampon', 'dětský olej', 'detsky olej',
      'šampon', 'sprchov', ' krém', 'tělové mléko', 'pleťové mléko', 'olej', 'koupel', 'pěna do koupele', 'balzám', 'zubní', 'kartáček', 'vlhčené ubrousky', 'ubrousky',
      'mycí', 'na mytí', 'kondicionér', ' edt', 'tělová voda', 'tělová mlha', 'intimní',
    ],
    // Baby food and drinks are no cosmetics ("mléčná kaše", "olej" in a ready meal).
    exclude: ['příkrm', 'kaše', 'mléčn', 'nápoj', 'kojenecké mléko'],
  },
  { subcategory: 'Hračky', keywords: ['hračk', 'hracka', 'hračky', 'kniha', 'knihy', 'puzzle', 'figurk', 'omalovánk', 'plyš', 'chrastítk', 'kostky', 'bublifuk'] },
  {
    subcategory: 'Dětské potřeby',
    keywords: [
      'dudlík', 'dudlik', 'kojeneck', 'láhev', 'lahev', 'savičk', 'hrnek', 'hrneček', 'miska', 'lžičk', 'odsávačk', 'teploměr', 'plavky', 'kousátk', 'prsní vložky', 'bryndák', 'nočník',
      'přebalovací', 'podložk', 'nádobí', 'příbor', ' nůž', 'svačinový box', 'sada na pití', 'dávkovač', 'talíř',
    ],
  },
]

const OSTATNI_RULES: SubcategoryRule[] = [
  { subcategory: 'Tabák a e-cigarety', keywords: ['cigaret', 'tabák', 'tabak', 'vape', 'doutník', 'doutnik', 'marlboro', 'nic salt'] },
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
  rules.map((rule) => ({
    subcategory: rule.subcategory,
    keywords: rule.keywords.map(normalizeKeyword),
    exclude: rule.exclude?.map(normalizeKeyword),
    excludeBefore: rule.excludeBefore?.map(normalizeKeyword),
    headOnly: rule.headOnly,
    startOnly: rule.startOnly,
  }))

const NORMALIZED_LINKING_WORDS = LINKING_WORDS.map(normalizeKeyword)
// " bio ", " metro chef " — padded, as they are matched at the start of the padded name.
const NORMALIZED_PRODUCE_PREFIXES = PRODUCE_PREFIXES.map((prefix) => ` ${normalizeProductText(prefix)} `)

/** Whether `rule` places the padded, normalized `haystack`: a keyword matches and nothing vetoes it. */
function rulePlaces(rule: SubcategoryRule, haystack: string): boolean {
  let first = -1
  for (const keyword of rule.keywords) {
    const index = haystack.indexOf(keyword)
    if (index >= 0 && (first < 0 || index < first)) first = index
  }
  if (first < 0) return false
  if (rule.startOnly) {
    let rest = haystack
    for (let stripped = true; stripped; ) {
      stripped = false
      for (const prefix of NORMALIZED_PRODUCE_PREFIXES) {
        if (rest.startsWith(prefix)) {
          rest = rest.slice(prefix.length - 1)
          stripped = true
        }
      }
    }
    if (!rule.keywords.some((keyword) => rest.startsWith(` ${keyword.trim()}`))) return false
  }
  if (rule.headOnly) {
    const link = NORMALIZED_LINKING_WORDS.map((word) => haystack.indexOf(word)).filter((index) => index >= 0)
    if (link.length > 0 && Math.min(...link) < first) return false
  }
  if (rule.exclude?.some((keyword) => haystack.includes(keyword))) return false
  return !rule.excludeBefore?.some((keyword) => {
    const index = haystack.indexOf(keyword)
    return index >= 0 && index < first
  })
}

/** A keyword rule used outside this module (lib/product-types.ts): the same matching as a
 *  subcategory rule — word boundaries, `exclude`, `excludeBefore`, `headOnly`, `startOnly` — without
 *  the subcategory. Compile it once with `compileKeywordRule`, then test names with
 *  `matchesKeywordRule`. */
export type KeywordRule = Omit<SubcategoryRule, 'subcategory'>

export function compileKeywordRule(rule: KeywordRule): KeywordRule {
  const [compiled] = normalizeRules([{ subcategory: '', ...rule }])
  return compiled
}

/** Whether a compiled rule matches a name already normalized by `normalizeProductText`. */
export function matchesKeywordRule(rule: KeywordRule, normalizedName: string): boolean {
  return rulePlaces({ subcategory: '', ...rule }, ` ${normalizedName} `)
}

/** The food words a flavour or filling hides behind (see FOOD_HEADS above), for rules elsewhere. */
export const FOOD_HEAD_WORDS: readonly string[] = FOOD_HEADS

const RULES_BY_CATEGORY: Record<ItemCategory, SubcategoryRule[]> = {
  Potraviny: normalizeRules(POTRAVINY_RULES),
  Drogerie: normalizeRules(DROGERIE_RULES),
  Domácnost: normalizeRules(DOMACNOST_RULES),
  Děti: normalizeRules(DETI_RULES),
  Ostatní: normalizeRules(OSTATNI_RULES),
}

// A liter-volume marker ("0,5l", "1,5l", "2l" — normalized, the comma becomes a space so the digit
// run stays attached to "l") is a strong, unambiguous beverage signal for any *unbranded* case the
// list above misses: raw produce is never sold "1,5l" on a Czech receipt. Used only to suppress a
// false "Ovoce a zelenina" keyword match, never to force a positive Nápoje guess by itself — falling
// through to `null` (unresolved) is preferable to a confident wrong category (NEHÁDEJ).
const LITER_VOLUME_PATTERN = /(^|\s)\d+( \d+)? ?(l|ml)(\s|$)|\d 51(\s|$)/

/** Deterministic keyword classification of a normalized product name into one of its item
 *  category's fixed subcategories — `null` when nothing matches confidently (never a guess). The
 *  caller (lib/categorization.ts) treats this as one priority tier among several; a `null` here
 *  does not stop fuzzy or AI matching from being tried next. */
export function classifySubcategoryByKeyword(category: ItemCategory, normalizedName: string): string | null {
  // A brand that makes one kind of goods decides first ("Korunní Etera Jablko", "YESS Pomeranč" are
  // drinks — found by a production dry run of scripts/recategorize-products.ts, where the fruit word
  // had put them among produce); any other brand only places what the keyword rules leave unplaced
  // (lib/product-brands.ts).
  const brand = brandOf(normalizedName)
  const branded = brand ? brandSubcategoryIn(brand, category) : null
  if (brand?.decides && branded) return branded
  // Padded so a boundary keyword (" med ") also matches at the start or end of the name.
  const haystack = ` ${normalizedName} `
  // Product form has priority over ingredient/flavour words. A bread item such as
  // "Kaiserka cereální sypaná lněným semínkem" must remain Pečivo even though
  // "cereální" and "semínkem" also occur in lower-priority food rules.
  const breadRule = RULES_BY_CATEGORY[category].find((rule) => rule.subcategory === 'Pečivo')
  if (breadRule && rulePlaces(breadRule, haystack)) return 'Pečivo'
  let ruled: string | null = null
  for (const rule of RULES_BY_CATEGORY[category]) {
    // No brand in the dictionary sells raw produce, so a fruit word in a branded name is a flavour.
    if (rule.subcategory === 'Ovoce a zelenina' && (brand || LITER_VOLUME_PATTERN.test(normalizedName))) continue
    if (rulePlaces(rule, haystack)) {
      ruled = rule.subcategory
      break
    }
  }
  if (category === 'Potraviny' && isSpiceBlend(normalizedName, ruled)) return 'Koření a bylinky'
  return ruled ?? branded
}

// Vitana and Avokádo sell seasoning blends named after a dish ("Vitana Kuře pečené 25g", "Avokádo
// Krkovička 30g", "Vitana Americké brambory"), never raw meat, fish or vegetables: a name of theirs the
// rules read as one of those is a blend, and so is a small packet the rules do not place at all
// (owner, 2026-10-06: kořenicí směsi → Koření a bylinky). Their soups, dumplings, porridge and sauces
// are not blends.
const SPICE_BLEND_BRANDS = /^(vitana|avokado) /
const NOT_A_BLEND = ['polevk', 'knedl', 'nudl', 'testovin', 'ryze', 'kase', 'pyre', 'omack', 'dezert', 'pudink', 'kakao', 'cukr', 'bramborov', 'bistro', 'poctiva', 'kroket', 'smes na', 'hrnecku', 'houstick', 'instantni', 'chute sveta', 'rychla vecere', 'pytlik', 'pizza']
const BLEND_MISREAD_AS = new Set(['Maso a uzeniny', 'Ryby a mořské plody', 'Ovoce a zelenina'])

function isSpiceBlend(normalizedName: string, ruled: string | null): boolean {
  if (!SPICE_BLEND_BRANDS.test(normalizedName)) return false
  if (NOT_A_BLEND.some((word) => normalizedName.includes(word))) return false
  if (ruled !== null) return BLEND_MISREAD_AS.has(ruled)
  // The produce rules are skipped for a branded name; read as produce anyway, it is a blend too.
  const haystack = ` ${normalizedName} `
  if (RULES_BY_CATEGORY.Potraviny.some((rule) => rule.subcategory === 'Ovoce a zelenina' && rulePlaces(rule, haystack))) return true
  const grams = normalizedName.match(/(?:^|\s)(\d{1,3}) ?g(?:\s|$)/)
  return grams !== null && Number(grams[1]) <= 100
}

/** The item category whose keyword rules — and only whose — place a normalized name, with that
 *  subcategory; `null` when no category or more than one does (never a guess). */
export function placeByKeywordInOneCategory(normalizedName: string): { category: ItemCategory; subcategory: string } | null {
  const placed = (Object.keys(PRODUCT_SUBCATEGORIES) as ItemCategory[]).flatMap((category) => {
    const subcategory = classifySubcategoryByKeyword(category, normalizedName)
    return subcategory ? [{ category, subcategory }] : []
  })
  return placed.length === 1 ? placed[0] : null
}

/** Whether a name has one of `subcategory`'s keywords at all, vetoed or not — i.e. whether a
 *  keyword rule could have put it there. lib/db/new-subcategories.ts uses it to take back what an
 *  earlier, looser version of a rule placed, without touching a row a household put there itself. */
export function hasSubcategoryKeyword(category: ItemCategory, subcategory: string, normalizedName: string): boolean {
  const haystack = ` ${normalizedName} `
  return RULES_BY_CATEGORY[category].some((rule) => rule.subcategory === subcategory && rule.keywords.some((keyword) => haystack.includes(keyword)))
}

// --- Child-oriented tag ----------------------------------------------------------------------

/** Keywords that mark a product as aimed at children without changing its main category — e.g.
 *  "Kinder" stays Potraviny ▸ Sladkosti but is also flagged child-oriented for reporting (spec
 *  section 10); so is every product of a children's brand (lib/product-brands.ts). Deliberately small and specific to known children's brands/words; broader terms ("dětsk")
 *  are already handled by the Děti item category itself and would over-tag adult products that
 *  merely mention "pro děti" on packaging text picked up by OCR. */
const CHILD_ORIENTED_KEYWORDS = ['kubík', 'jupík', 'jupi ', 'fruko', 'kinder', 'haribo'].map(normalizeProductText)

export function isChildOrientedByKeyword(normalizedName: string): boolean {
  return CHILD_ORIENTED_KEYWORDS.some((keyword) => normalizedName.includes(keyword)) || brandOf(normalizedName)?.category === 'Děti'
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
