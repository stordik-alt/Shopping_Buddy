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
 *  the name falls through to a later rule or stays unplaced. `excludeBefore` keywords veto it only
 *  when they come before the first matching keyword: a name says what the product is first and what
 *  it tastes of or contains after — "Mléčná čokoláda plněná likérem" is chocolate, while
 *  "Bottega Liquore 17% čokoláda" is a liqueur. */
type SubcategoryRule = { subcategory: string; keywords: string[]; exclude?: string[]; excludeBefore?: string[]; headOnly?: boolean; startOnly?: boolean }

/** What may stand before a `startOnly` keyword: produce brands and plain qualifiers ("BIO", "Metro
 *  Chef", "Česká Farma", "cherry", a colour). Any other word in front ("Mirinda Mango", "ZON Malina",
 *  "Avokádo Jalovec") means the fruit is only a flavour or a brand, and the rule does not apply. */
const PRODUCE_PREFIXES = [
  'bio', 'metro chef', 'bon via', 'bonvia', 'premium', 'fine life', 'čerstvě utrženo', 'čerstvé', 'čerstvá', 'česká farma', 'farma', 'aro', 'bonduelle', 'gold', 'efko', 'clever', 'billa',
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
  'snack', 'taštičk', 'řízek', 'pomaz', 'gyoza', 'mysli',
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
      'výčepní', 'kozel', 'pilsner', 'gambrinus', 'radegast', 'staropramen', 'krušovic', 'budvar', 'svijan', 'božkov', 'chateau', 'château', ' brut', 'jägermeister', 'bacardi', 'captain morgan', 'meruňkovic', 'jelínek', 'žufánek', 'frisco',
    ],
    // Food flavoured with a drink: "zakysaná smetana vaječný likér", "Cheddar … sýr s whisky".
    exclude: ['zakysan', 'cheddar', ' sýr ', 'sýrov', 'krekr'],
    excludeBefore: [...FOOD_HEADS, 'mléko', 'paštik'],
  },
  {
    subcategory: 'Lahůdky a hotová jídla',
    keywords: [
      'bramborový salát', 'vlašský salát', 'těstovinový salát', 'pochoutkový salát', 'vajíčkový salát', 'salát vajíčkový', 'majonézový salát', 'hotové jídlo', 'hotová jídla',
      ' aspik ', ' aspiku ', 'utopenc', 'obložen', 'sendvič', ' wrap ',
      // A soup, ready or instant — "polévka" only, so "na polévku" and "polévková směs" stay out.
      'polévka',
      'pizza', 'kimchi',
    ],
    // Toast bread called "sendvič" and tortilla wraps are bread; pizza flour, sauce or spice is no pizza.
    exclude: [' toust ', 'tortil', 'mouka', 'omáčk', 'koření', 'kořen', 'směs na', 'tyčink', 'chips', 'lupínk', 'vroubk', 'krekr'],
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
  { subcategory: 'Slané pochutiny', keywords: ['brambůrk', 'bramburk', 'chipsy', ' chips', 'tyčink slan', 'arašíd', 'arasid', 'krekr', 'křupky', 'tyčinky pekařské', 'doritos', 'lupínk', 'popcorn', 'preclík', 'nachos', 'slané tyčinky', 'solené tyčinky'], exclude: ['strouhank'] },
  {
    subcategory: 'Pečivo',
    keywords: ['chleb', 'rohlík', 'rohliky', 'houska', 'bageta', 'croissant', 'peciv', 'bulka', 'veka', ' toust ', 'tortil', 'kaiserk', 'koláč', 'buchta', 'závin', 'vánočk', 'mazanec', 'ciabatt', 'focaccia'],
    // "Rohlik.cz" is a shop's name, not a roll; seasoning for tortillas is no bread.
    exclude: ['rohlik cz', ' koření ', 'kořenící'],
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
      'losos', 'tuňák', 'tunak', 'treska', ' sleď', ' sledě', 'makrel', 'krevet', 'pstruh', ' kapr', 'sardink', 'sardel', ' ryba ', ' ryby ', ' rybí ', ' rybích ', 'rybí filé',
      'chobotnic', 'kalamár', 'surimi', 'tilapie', 'pangasius', 'candát', ' štika', ' mušle', 'ančovič', 'hering', 'šprot',
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
      'krkovic', 'svíčková', 'roštěn', 'žebírk', 'bratwurst', 'frankfurt', 'játr', 'stehn', 'křídl',
    ],
    exclude: ['koření', 'kořen', 'příchu', 'prichu', 'krmiv', 'kočk', ' psy', 'pamlsk', 'veggie', 'vegetarián', 'rostlinn', 'sádlo', 'omáčk', 'nudle', 'těstovin', 'tortellin', 'ravioli'],
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
      'drink', 'energetick', 'tonic', 'nektar', 'kombucha', 'ice tea', 'ledový čaj', 'monster', 'red bull', 'smoothie', 'isoton', 'ginger ale',
    ],
    exclude: ['tyčink', 'bonbon', 'bonbón', ' želé '],
  },
  {
    subcategory: 'Sladkosti',
    keywords: [
      'čokolád', 'pralink', 'tyčinka', 'bonbon', 'bonbón', 'sušenk', 'susenk', 'oplatk', 'zmrzlin', 'dort', 'keks', 'perník',
      'žvýkačk', 'orbit', 'wrigley', 'haribo', 'kinder', 'piškot', 'lízátk', 'chupa chups', 'marshmallow', 'gumov', ' dezert', 'puding', 'pudink', 'trubičk',
    ],
    // Gingerbread spice and baking powder are for baking, not sweets.
    exclude: [' koření ', 'kypřic', 'kypříc', 'prášek do'],
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
  { subcategory: 'Konzervy', keywords: ['konzerv', 'kompot', 'olivy', 'olivami', 'sterilovan', 'v nálevu', 'kysané zelí'] },
  { subcategory: 'Cereálie a snídaně', keywords: ['cereál', 'cerealie', 'müsli', 'musli', 'ovesné vločky', 'ovesne vlocky', 'kaše '], exclude: [' koření ', 'krupice'] },
  {
    subcategory: 'Těstoviny a rýže',
    keywords: [
      'těstovin', 'testovin', 'rýže', 'ryze', 'špagety', 'spagety', 'nudle', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'pappardelle', 'lasagne', 'gnocchi', 'tortellini', 'ravioli',
      'vřetena', 'kolínka', 'farfalle', 'kuskus', 'bulgur', 'quinoa',
    ],
  },
  {
    subcategory: 'Oleje a tuky',
    keywords: [' olej ', ' oleje ', 'sádlo', 'margarín', 'margarin', 'palmarín', 'palmarin', ' ghí', ' ghee', 'kokosový tuk', 'pokrmový tuk'],
  },
  {
    subcategory: 'Ořechy, semínka a sušené ovoce',
    keywords: ['ořech', 'orech', 'oříšk', 'orisk', 'mandl', 'kešu', 'kesu', 'pistáci', 'semínk', 'semink', ' chia', 'rozink', 'datle', 'sušené ovoce', 'sušené meruňky', 'sušené švestky', 'brusinky sušené'],
    // Porridge, granola and bars with nuts are breakfast or sweets, not nuts.
    exclude: ['tyčink', 'granol', 'kaše ', 'müsli', 'kořen'],
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
      'kakaový prášek', 'kakao na pečení', 'holandské kakao', 'pudinkový prášek', 'želatina',
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
    keywords: ['prášek na praní', 'prasek na prani', 'aviváž', 'avivaz', 'gel na praní', 'gel na prani', 'prací', 'praci', 'persil', 'ariel', 'lenor', 'perwoll', 'odstraňovač skvrn', 'vanish'],
  },
  { subcategory: 'Mytí nádobí', keywords: [' jar ', 'mytí nádobí', 'myti nadobi', 'tableta do myčky', 'tableta do mycky', 'myčk', 'somat'] },
  { subcategory: 'Čištění domácnosti', keywords: ['savo', 'čistič', 'cistic', 'úklid', 'uklid', 'wc gel', 'dezinfek', ' wc ', 'čisticí', 'odvápňov'] },
  { subcategory: 'Dětská hygiena', keywords: ['dětsk', 'detsk'] },
  {
    subcategory: 'Ostatní drogerie',
    keywords: ['punčoch', 'ponožk', 'kalhotky', 'podkolenk', 'brýle', 'kontaktní čočky', 'oční kapky', 'roztok na čočky', 'pouzdro na brýle', 'gumičk', 'sponk', 'čelenk', 'hřeben', 'kartáč na vlasy'],
    exclude: ['menstruač'],
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
    keywords: ['sušenk', 'křupk', 'krupk', 'tyčink', 'krekr', 'oplat', 'preclík', 'popcorn', 'snack', 'keksík', 'piškot', 'bonbónk', 'želé', 'lyofiliz', 'rybičky', 'taštičk', 'dezert', 'prstýnk'],
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
const LITER_VOLUME_PATTERN = /(^|\s)\d+( \d+)? ?(l|ml)(\s|$)|\d 51(\s|$)/

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
    if (rulePlaces(rule, haystack)) return rule.subcategory
  }
  return null
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
