// Product types (druhy zboží) — docs/12_PRODUCT_TYPES.md, phase 1.
//
// A type is one kind of goods a shopper treats as interchangeable apart from brand, size and price
// ("Máslo", "Kuřecí prsa"); a group is a set of types one list item can ask for at once ("Kuřecí
// maso" = every raw part of the chicken). A catalog product gets at most one type, assigned by the
// deterministic rules below — a product that matches no type, or more than one, gets none and is
// never offered automatically for a type (the concept's honesty rule).
//
// The list is code, like the subcategories: keys are stable identities stored in the database
// (`product_types.key`, migration 0062); names are what the household sees. Every rule was checked
// against the real catalog (local copy, 2026-10-04) and the golden set in the tests.

import { normalizeProductText } from '@/lib/product-normalize'
import { receiptTypeText } from '@/lib/receipt-product-match'
import { classifySubcategoryByKeyword, compileKeywordRule, FOOD_HEAD_WORDS, matchesKeywordRule, type KeywordRule } from '@/lib/product-subcategories'
import type { ItemCategory } from '@/lib/types'

export type ProductTypeUnit = 'kg' | 'l' | 'ks'

export type ProductTypeDefinition = {
  /** Stable identity (never renamed once in the database). */
  key: string
  /** What the household sees. */
  name: string
  /** The item categories a product of this type may be in (toilet paper is sold under Drogerie and
   *  Domácnost alike); the first one is the type's own. */
  categories: ItemCategory[]
  /** The type's subcategory under its first category. A product whose name the subcategory rules
   *  place in a *different* subcategory is no product of this type ("Máslové sušenky" are sweets). */
  subcategory: string | null
  /** The unit its unit price is compared in (CLAUDE.md section 17). */
  unit: ProductTypeUnit
  /** The words that name it, matched like subcategory keywords (lib/product-subcategories.ts). By
   *  default `headOnly`: the word must come before a linking word ("Gnocchi s Parmigiano" is no
   *  cheese). */
  rule: KeywordRule
  /** Words of which at least one must also be in the name ("kuřecí" for the chicken cuts). */
  requires?: string[]
}

export type ProductTypeGroup = { key: string; name: string; types: string[] }

// --- Shared exclusions --------------------------------------------------------------------------

/** A product made from, or flavoured with, the thing: ham and pâté are no meat cut, a soup or a
 *  ready meal no vegetable, pet food no food. Shared by every food type. */
const MADE_FROM = [
  ...FOOD_HEAD_WORDS, 'pomazán', 'paté', 'krém', 'vlastní šťáv', 'omáčce', 'bujón', 'knedl', 'kaší', 'porce', 'expres menu', 'šunk', 'salám', 'párk', 'klobás', 'paštik', 'pomazánk', 'příkrm', 'krmiv', ' psy', 'kočk', 'pamlsk', 'hotov', 'set k', 'příchu', 'sendvič',
  'salát', ' wrap', 'pizza', 'burger', 'kebab', 'gyros', 'nugget', 'konzerv', 'v aspiku', 'tlačenk', 'jerky', 'snack', 'smoothie', 'pyré', 'sirup', 'džus', 'nápoj', 'likér',
]

/** Meat that is no longer raw — the owner's "Kuřecí maso" excludes cooked parts (2026-10-04) and the
 *  other meat groups follow it — or that is a processed product. Marinated or seasoned raw parts
 *  stay (owner, 2026-10-04). */
const NOT_RAW_MEAT = [' oleji', 'škvar', 'na smetaně', 'uzen', 'vařen', 'grilovan', 'sous', 'obalov', 'trojobal', 'smažen', 'plněn', 'rolád', 'sušen', 'debrecín', 'vysočina', 'špekáč', 'jitrnic', 'jelito', 'konfit', 'confit', 'pečené', 'pečený', 'pečená']

/** `omit` drops shared exclusions that name the type itself ("jogurt" for white yoghurt). */
const food = (keywords: string[], exclude: string[] = [], extra: Partial<KeywordRule> = {}, omit: string[] = []): KeywordRule => ({
  keywords,
  exclude: [...MADE_FROM.filter((word) => !omit.includes(word)), ...exclude],
  headOnly: true,
  ...extra,
})
const meat = (keywords: string[], exclude: string[] = []): KeywordRule => food(keywords, [...NOT_RAW_MEAT, ...exclude])
/** Produce: the word must begin the name (after a produce brand or qualifier), so "Mirinda Mango"
 *  or "Jahodový jogurt" never qualify — the same rule the subcategories use. */
const produce = (keywords: string[], exclude: string[] = [], omit: string[] = []): KeywordRule =>
  food(keywords, ['šťáv', 'nálev', 'v oleji', ' pet', 'paté', 'bistro', ...exclude], { startOnly: true }, omit)

const CHICKEN = [' kuře', ' kuřec', ' kuř ', ' kuřete', ' kuřat']
const PORK = [' vepřov', ' vepř ', ' vep ']
const BEEF = [' hovězí', ' hov ', ' telecí']
const TURKEY = [' krůtí', ' krůt']

const P = 'Potraviny' as const

export const PRODUCT_TYPES: ProductTypeDefinition[] = [
  // --- Mléčné výrobky ---------------------------------------------------------------------------
  { key: 'maslo', name: 'Máslo', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' máslo '], ['arašíd', 'ořech', 'mandl', 'kakaov', 'bambuck', 'bylink', 'česnek', 'pomazánkov', 'přepuštěn', 'ghí', 'ghee', 'rostlinn', 'kokos', 'pistáci', 'kešu', 'sezam']) },
  { key: 'mleko-polotucne', name: 'Mléko polotučné', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' mléko polotučné', ' polotučné mléko'], ['acidofil', 'kefír', 'kondenz', 'zahušt', 'karameliz', 'kokos', 'ovesn', 'sójov', 'mandlov', 'rýžov', 'kozí', 'čokolád', 'kakao', 'sušen', 'bez laktózy']) },
  { key: 'mleko-plnotucne', name: 'Mléko plnotučné', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' mléko plnotučné', ' plnotučné mléko'], ['acidofil', 'kefír', 'kondenz', 'zahušt', 'karameliz', 'kokos', 'ovesn', 'sójov', 'mandlov', 'rýžov', 'kozí', 'čokolád', 'kakao', 'sušen', 'bez laktózy']) },
  { key: 'mleko-bez-laktozy', name: 'Mléko bez laktózy', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' mléko '], ['kefír', 'kondenz', 'zahušt', 'karameliz', 'kokos', 'ovesn', 'sójov', 'mandlov', 'rýžov', 'čokolád', 'kakao', 'sušen'], { headOnly: false }), requires: ['bez laktózy', 'laktózy prost'] },
  { key: 'smetana-na-vareni', name: 'Smetana na vaření', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' smetana na vaření', ' smetana 12', ' smetana 10', ' smetana uht 12', ' smetana k vaření'], ['zakysan', 'šlehá', 'pribin']) },
  { key: 'smetana-ke-slehani', name: 'Smetana ke šlehání', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' smetana ke šlehání', ' šlehačka', ' smetana 31', ' smetana 33', ' smetana 35', ' smetana 36', ' smetana uht 31', ' smetana uht 33', ' sm šleh', ' smet šleh', ' šlehačková smetana'], ['zakysan', 'sprej', 've spreji', 'rostlinn', 'na vaření']) },
  { key: 'zakysana-smetana', name: 'Zakysaná smetana', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' zakysaná smetana', ' smetana zakysaná', ' smet zak', ' zakysaná', ' kysaná smetana'], ['vaječný', 'likér', 'dip', 'nugát', 'jahod', 'vanilk', 'ovoc', 'čokol', 'karamel', 'stracciatell']) },
  { key: 'jogurt-bily', name: 'Bílý jogurt', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' bílý jogurt', ' jogurt bílý', ' jogurt natur', ' jogurt přírodní', ' přírodní jogurt', ' řecký jogurt', ' jogurt řecký', ' řecký typ'], ['jahod', 'vanilk', 'ovoc', 'čokolád', 'kokos', 'nápoj', 'pitn', 'rostlinn', 'malin', 'meruňk', 'borůvk', 'med ', 'tvaroh &'], {}, ['jogurt']) },
  { key: 'tvaroh', name: 'Tvaroh', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' tvaroh '], ['tvarohov', 'dezert', 'koláč', 'buchtičk', 'knedlík', 'nanuk', 'ochucen', 'vanilk', 'jahod', 'kakao', 'svačink', ' bar ', 'čoko', 'zeleninov', 'paprik', 'jogurt']) },
  { key: 'eidam', name: 'Eidam', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' eidam'], ['cihla', 'tyčink', 'křupk']) },
  { key: 'gouda', name: 'Gouda', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' gouda', ' goud '], ['violife', 'rostlinn', 'tyčink', 'křupk', 'chrum', 'tavený', 'apetito', ' eru ']) },
  { key: 'mozzarella', name: 'Mozzarella', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' mozzarell'], ['gnocchi', 'rostlinn', 'tyčink', 'těstovin', 'knorr']) },
  { key: 'balkansky-syr', name: 'Balkánský sýr', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' balkánský sýr', ' balkán sýr', ' balkan ', ' balkánský', ' sýr balkánský', ' feta'], ['salát', 'rostlinn']) },
  { key: 'hermelin', name: 'Hermelín a camembert', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' hermelín', ' camembert', ' brie'], ['nakládan', 'v oleji', 'pečen', 'tavený']) },
  { key: 'parmazan', name: 'Parmazán', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' parmazán', ' parmigiano', ' grana padano', ' parmesan'], ['omáčk', 'pesto', 'chips', 'gnocchi']) },
  { key: 'taveny-syr', name: 'Tavený sýr', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' tavený sýr', ' tavený', ' veselá kráva', ' ves kráva', ' ves krava', ' apetito', ' tavený plátkový'], ['křup', 'snack']) },
  { key: 'niva', name: 'Niva', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' niva'], ['pomazánk', 'nivová']) },
  { key: 'cottage', name: 'Cottage', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' cottage']) },
  { key: 'kefir', name: 'Kefír', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' kefír', ' kefir'], ['ovocn', 'jahod', 'borůvk', 'malin', 'broskv', 'kefírov']) },
  { key: 'vejce', name: 'Vejce', categories: [P], subcategory: 'Vejce', unit: 'ks', rule: food([' vejce', ' vajíčka', ' vajec '], ['čokolád', 'překvapen', 'polévk', 'nudle', 'těstovin', 'salát', 'majonéz', 'pomazánk', 'kinder', 'perník', 'velikonoční dekor', 'barvy na', 'likér', 'koňak']) },

  // --- Pečivo ---------------------------------------------------------------------------------------
  { key: 'rohlik', name: 'Rohlík', categories: [P], subcategory: 'Pečivo', unit: 'ks', rule: food([' rohlík'], ['rohlik cz', 'rohlíkův', 'rohlíkova', 'šunka na rohlík', 'na rohlík', 'linecké', 'vanilkov', 'rohlíček', 'rohlíčk', 'tuňák', 'pizza', 'sýrov', 'chléb', 'chleba']) },
  { key: 'chleb', name: 'Chléb', categories: [P], subcategory: 'Pečivo', unit: 'kg', rule: food([' chléb', ' chleba', ' chleb '], ['toust', 'tous', 'křehk', 'knäcke', 'knacke', 'kváskový chléb mix', 'směs na', 'pečení chleba', 'koření', 'kořen', 'krutony', 'chlebíč', 'bezlepkov', 'mouka', 'mouky']) },
  { key: 'toustovy-chleb', name: 'Toustový chléb', categories: [P], subcategory: 'Pečivo', unit: 'kg', rule: food([' toustový chléb', ' chléb toustový', ' toust chléb', ' toust chleb', ' tous chl', ' toust ']) },
  { key: 'houska', name: 'Houska a kaiserka', categories: [P], subcategory: 'Pečivo', unit: 'ks', rule: food([' houska', ' housky', ' kaiserk', ' kaiserka', ' bulka', ' žemle', ' eska houska'], ['knedlík', 'hamburger', 'burger', 'hot dog', 'čerstvě nakrájeno', 'losos', 'avokád', 'rajče', 'sýr ']) },
  { key: 'bageta', name: 'Bageta', categories: [P], subcategory: 'Pečivo', unit: 'ks', rule: food([' bageta', ' bagety', ' baguette'], ['sýrová bageta', 'šunkov', 'plněn', 'strips', 'nuget', 'dresink', 'camembert', 'bistro', 'kuřecí', ' s ', ' se ', 'caesar', 'caprese', 'trhané', 'vejce', 'delicates', 'ready', 'čerstvě nakrájeno']) },

  // --- Ovoce a zelenina -----------------------------------------------------------------------------
  { key: 'jablka', name: 'Jablka', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['jablka', 'jablko', 'jablk'], ['granátov', 'jablečn']) },
  { key: 'banany', name: 'Banány', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['banány', 'banán', 'banan'], ['plátky', 'chips']) },
  { key: 'mandarinky', name: 'Mandarinky a klementinky', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['mandarink', 'klementink']) },
  { key: 'citrony', name: 'Citrony', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['citrony', 'citron '], ['tráva', 'šťáva', 'kůra']) },
  { key: 'hrusky', name: 'Hrušky', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['hrušky', 'hruška']) },
  { key: 'hrozny', name: 'Hrozny', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['hrozny', 'hroznové víno']) },
  { key: 'jahody', name: 'Jahody', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['jahody']) },
  { key: 'boruvky', name: 'Borůvky', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['borůvky']) },
  { key: 'maliny', name: 'Maliny', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['maliny']) },
  { key: 'avokado', name: 'Avokádo', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'ks', rule: produce(['avokádo', 'avokáda']), requires: [' ks', ' 1 ks', 'hass', 'zralé', 'balení', 'síťk', 'vanič', 'velké', 'bio'] },
  { key: 'rajcata', name: 'Rajčata', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['rajčata', 'rajče'], ['loupan', 'pasírovan', 'drcen', 'krájen v', 'sušen', 'protlak', 'v plechovce', 'v nálevu']) },
  { key: 'okurky', name: 'Okurky salátové', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'ks', rule: produce(['okurka', 'okurky'], ['sterilovan', 'kyselé', 'nakládan', 'kvašen', 'v nálevu', 'ster ', ' cm', 'delikates', 'aro okurky']) },
  { key: 'paprika', name: 'Paprika', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['paprika', 'papriky'], ['mlet', 'sladká 2', 'lahůdkov', 'uzen', 'pálivá mletá', 'koření', 'pasta', 'paprikáš', 'náplní', 'sýr']) },
  { key: 'brambory', name: 'Brambory', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['brambory'], ['hranolk', 'kaše', 'krokety', 'knedl', 'plack', 'chips', 'lupínk', 'salát', 'šťouchan', 'americké', 'pečené', 'opékan']) },
  { key: 'cibule', name: 'Cibule', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['cibule'], ['sušen', 'smažen', 'granul', 'chutney', 'marmeláda', 'cibulka']) },
  { key: 'cesnek', name: 'Česnek', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['česnek'], ['sušen', 'granul', 'mlet', 'pasta', 'medvědí', 'černý', 'opečen', 'krém', 'sekan', 'prášk', 'chilli', 'marinov', 'pomaz', 'efko']) },
  { key: 'mrkev', name: 'Mrkev', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['mrkev'], ['sterilovan', 'v nálevu']) },
  { key: 'salat', name: 'Salát hlávkový a ledový', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'ks', rule: produce(['ledový salát', 'salát ledový', 'salát hlávkový', 'hlávkový salát', 'salát římský', 'římský salát', 'salát little gem', 'salát l gem', 'salat l gem', 'salát lollo', 'salat ledovy'], [], ['salát']) },
  { key: 'zeli', name: 'Zelí', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['zelí bílé', 'zelí červené', 'bílé zelí', 'červené zelí', 'zelí hlávkové', 'zelí'], ['kysan', 'kvašen', 'sterilovan', 'dušen', 'polévk']) },
  { key: 'zampiony', name: 'Žampiony', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['žampiony', 'žampióny'], ['krájené ve', 'sterilovan', 'v nálevu', 'konzerv']) },
  { key: 'cuketa', name: 'Cuketa', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['cuketa', 'cukety', 'cuket']) },
  { key: 'celer', name: 'Celer', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['celer', 'celeru'], ['salát', 'nať', 'koření', 'sůl']) },
  { key: 'brokolice', name: 'Brokolice', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['brokolice'], ['mražen', 'polévk', 'krém']) },
  { key: 'houby', name: 'Houby', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['houby', 'houba'], ['sušen', 'nakládan', 'sterilovan', 'v nálevu', 'polévk', 'omáčk', 'krém', 'extrakt', 'pasta', 'křenov']) },

  // --- Owner-approved everyday additions (2026-10-08) ------------------------------------------------
  { key: 'pomerance', name: 'Pomeranče', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['pomeranče', 'pomeranč'], [' 100%']) },
  { key: 'pomazanky', name: 'Pomazánky', categories: [P], subcategory: 'Džemy, med a pomazánky', unit: 'kg', rule: food([' pomazánk'], ['dubajsk', 'pistáci', 'nutella', 'lískooříšk', 'oříšk', 'arašíd', 'nugát', 'kakao', 'čokolád', 'karamel', 'ovocn', 'meruňkov', 'jahodov', 'malinov', 'borůvkov', 'z fíků', 'sušenek'], {}, ['pomazánk', 'pomazán']) },
  { key: 'mrazena-zelenina', name: 'Mražená zelenina', categories: [P], subcategory: null, unit: 'kg', rule: food([' mražená zelenina', ' mraženou zeleninu', ' mražená zelenina ']) },
  { key: 'cerealie', name: 'Cereálie', categories: [P], subcategory: null, unit: 'kg', rule: food([' cereál', ' musli', ' müsli', ' cornflakes', ' corn flakes'], ['cereální']) },
  { key: 'ovesne-vlocky', name: 'Ovesné vločky', categories: [P], subcategory: null, unit: 'kg', rule: food([' ovesné vločk', ' ovesn vločk']) },
  { key: 'kecup', name: 'Kečup', categories: [P], subcategory: 'Omáčky a dochucovadla', unit: 'l', rule: food([' kečup', ' kecup']) },
  { key: 'horcice', name: 'Hořčice', categories: [P], subcategory: 'Omáčky a dochucovadla', unit: 'kg', rule: food([' hořčic', ' horcic'], ['topink', 'dresing', 'dressing', 'pickles', 'burrito', 'gravlax', 'medovo', 'med/', 'chips', 'snack']) },
  { key: 'majoneza', name: 'Majonéza', categories: [P], subcategory: 'Omáčky a dochucovadla', unit: 'kg', rule: food([' majonéz', ' majonez']) },
  { key: 'dzem', name: 'Džem a marmeláda', categories: [P], subcategory: 'Džemy, med a pomazánky', unit: 'kg', rule: food([' džem', ' marmelád', ' marmelada', ' džemový']) },
  { key: 'kakao', name: 'Kakao', categories: [P], subcategory: null, unit: 'kg', rule: food([' kakao'], ['srdíčk', 'kuličk', 'myslík', 'mini club', 'termix', 'kakaov', 'pribináč', 'kapsík', 'mixík', 'protein', 'energy balls', 'oatmeal'], {}, []) },
  { key: 'orechy', name: 'Ořechy', categories: [P], subcategory: null, unit: 'kg', rule: food([' ořechy', ' ořech ', ' ořechů', ' orechy', ' orech '], ['flapjack', 'muškát', 'sýr', 'moučk', 'karamel', 'čokolád', 'kakao', 'pomazánk', 'máslo', 'hovězí', 'telecí', 'vepřov', 'kýta', 'nápoj']) },
  { key: 'seminka', name: 'Semínka', categories: [P], subcategory: null, unit: 'kg', rule: food([' semínk', ' semink'], ['rice cakes', 'chlebíč', 'semínkem', 'seminkem', 'semínky', 'seminky', 'odkolek', 'krájený', 'klíčení']) },
  { key: 'klobasy', name: 'Klobásy', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: food([' klobás', ' klobas', ' špekáč', ' spekac'], [], {}, ['klobás']) },
  { key: 'pastika', name: 'Paštika', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: food([' paštik', ' pastik'], [], {}, ['paštik']) },
  { key: 'mrazene-ovoce', name: 'Mražené ovoce', categories: [P], subcategory: null, unit: 'kg', rule: food([' mražené ovoce', ' mrazene ovoce']) },
  { key: 'hranolky', name: 'Hranolky', categories: [P], subcategory: null, unit: 'kg', rule: food([' hranolk']) },
  { key: 'pizza-mrazena', name: 'Pizza mražená', categories: [P], subcategory: null, unit: 'ks', rule: food([' mražená pizza', ' mrazena pizza']) },

  // --- Kuřecí maso (owner: every raw part, marinated, minced and offal included; never a product) --
  { key: 'kureci-prsa', name: 'Kuřecí prsa a prsní řízky', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' prsa', ' prsní', ' prsíčk', ' filety z prs', ' supreme'], ['stehen', 'stehn', 'křídl', 'mlet', 'játr']), requires: CHICKEN },
  { key: 'kureci-stehna', name: 'Kuřecí stehna a čtvrtky', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' stehna', ' stehno', ' stehen', ' horní stehn', ' spodní stehn', ' paličk', ' čtvrtk', ' čtvrtky'], ['prsní', 'prsa', 'křídl', 'mlet']), requires: CHICKEN },
  { key: 'kureci-kridla', name: 'Kuřecí křídla', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' křídla', ' křídl'], ['prsa', 'stehn']), requires: CHICKEN },
  { key: 'kure-cele', name: 'Kuře celé a půlky', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' kuře ', ' kuře chlazené', ' kuře celé', ' celé kuře', ' kuřecí půlk', ' půlka kuřete', ' kuře bez drobů', ' kuře s droby'], ['prsa', 'prsní', 'stehn', 'křídl', 'čtvrtk', 'mlet', 'játr', 'srdc', 'žaludk', 'kuře na', 'kuřecí', 'pečené', 'grilov', 'koření', ' gril', 'křupav', 'maggi', 'avokádo', 'pečen', ' vit ', 'vitana']) },
  { key: 'kureci-mlete', name: 'Kuřecí mleté maso', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' mleté', ' mletá', ' mletý', ' mleté maso']), requires: CHICKEN },
  { key: 'kureci-vnitrnosti', name: 'Kuřecí vnitřnosti', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' játra', ' srdce', ' srdíčka', ' žaludky', ' žaludk'], ['paštik']), requires: CHICKEN },
  { key: 'kureci-na-polevku', name: 'Kuřecí díly na polévku', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' hřbety', ' hřbet', ' skelet', ' krky', ' na polévku']), requires: CHICKEN },

  // --- Vepřové maso ---------------------------------------------------------------------------------
  { key: 'veprova-krkovice', name: 'Vepřová krkovice', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' krkovice', ' krkovička', ' krkovic']), requires: PORK },
  { key: 'veprova-pecene', name: 'Vepřová pečeně a kotlety', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' pečeně', ' kotlet', ' karé', ' veprova pecene'], ['krkovic', 'panenk']), requires: PORK },
  { key: 'veprova-panenka', name: 'Vepřová panenka', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' panenka', ' panenky', ' svíčková'], []), requires: PORK },
  { key: 'veprova-kyta', name: 'Vepřová kýta', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' kýta', ' kýty', ' ořech', ' šál', ' frikandó'], ['panenk']), requires: PORK },
  { key: 'veprova-plec', name: 'Vepřová plec', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' plec ', ' plece'], []), requires: PORK },
  { key: 'veprovy-bucek', name: 'Vepřový bůček', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' bůček', ' bůčku'], []), requires: PORK },
  { key: 'veprova-zebra', name: 'Vepřová žebra', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' žebra', ' žebírka', ' žebírko', ' žebro'], []), requires: PORK },
  { key: 'veprove-mlete', name: 'Vepřové mleté maso', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' mleté', ' mletá'], ['hovězí', 'smíšen']), requires: PORK },
  { key: 'veprove-na-gulas', name: 'Vepřové na guláš', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' na guláš', ' kostky', ' líčka', ' líčko'], []), requires: PORK },

  // --- Hovězí maso ----------------------------------------------------------------------------------
  { key: 'hovezi-svickova', name: 'Hovězí svíčková', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' svíčková', ' svíčkové', ' tenderloin'], ['omáčk', 'falešná', 'knedl', 'na smetaně']), requires: BEEF },
  { key: 'hovezi-zadni', name: 'Hovězí zadní', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' zadní', ' roštěn', ' kýta', ' falešná svíčková', ' květová špička', ' ořech', ' váleček'], ['přední', 'steak', ' rump', 'striploin', 'rib eye', 'mlet']), requires: BEEF },
  { key: 'hovezi-predni', name: 'Hovězí přední', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' přední', ' plec', ' hrudí', ' hrudník', ' podplečí', ' krk'], ['zadní', 'kližk', 'steak']), requires: BEEF },
  { key: 'hovezi-steak', name: 'Hovězí steak', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' steak', ' rib eye', ' ribeye', ' entrecote', ' flank', ' striploin', ' rump'], ['svíčková']), requires: BEEF },
  { key: 'hovezi-mlete', name: 'Hovězí mleté maso', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' mleté', ' mletá'], ['vepřov', 'smíšen']), requires: BEEF },
  { key: 'hovezi-na-gulas', name: 'Hovězí na guláš', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' na guláš', ' kostky', ' kližka', ' líčka', ' líčko', ' oháňka'], ['bujón']), requires: BEEF },

  // --- Krůtí a mleté --------------------------------------------------------------------------------
  { key: 'kruti-prsa', name: 'Krůtí prsa a řízky', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' prsa', ' prsní', ' řízk', ' plátky'], ['stehn', 'mlet']), requires: TURKEY },
  { key: 'kruti-stehna', name: 'Krůtí stehna', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' stehn', ' paličk', ' horní stehn'], ['prsa', 'prsní']), requires: TURKEY },
  { key: 'kruti-mlete', name: 'Krůtí mleté maso', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' mleté', ' mletá']), requires: TURKEY },
  { key: 'mlete-smesne', name: 'Mleté maso vepřovo-hovězí', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: meat([' mleté maso', ' mleté', ' mletá'], []), requires: ['vepřovo hovězí', 'hovězí a vepřov', 'vepřové a hovězí', 'smíšen', 'mix'] },

  // --- Uzeniny (what a list says as a whole) ---------------------------------------------------------
  { key: 'sunka', name: 'Šunka', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: { keywords: [' šunka', ' šunky', ' sunka', ' prosciutto', ' crudo', ' pršut ', ' serrano', ' jamón'], exclude: ['ristorante', 'piccolissima', 'duopack','šunkov', 'pizza', 'rohlík', 'těstovin', 'chléb', 'toust', 'bageta', 'sendvič', 'salát', 'omáčk', 'kráva', 'chips', 'příchu', 'krokety', 'pomazánk', 'tortellini', 'quiche', 'knedl', 'palačin'], headOnly: true } },
  { key: 'parky', name: 'Párky', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: { keywords: [' párky', ' párek', ' parky', ' párečky', ' párečk'], exclude: ['rohlík', 'těsto', 'hot dog', 'taštičk', 'v těstě', 'polévk', 'vegan', 'veggie', 'rostlinn', 'koření', 'pro psy', 'krmiv'], headOnly: true } },
  { key: 'slanina', name: 'Slanina', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: { keywords: [' slanina', ' slaniny'], exclude: ['příchu', 'chips', 'brambůrk', 'lupínk', 'snack', 'omáčk', 'párky', 'se slaninou', 'obalen', 'knedl', 'jerky'], headOnly: true } },

  // --- Ryby -----------------------------------------------------------------------------------------
  { key: 'losos', name: 'Losos', categories: [P], subcategory: 'Ryby a mořské plody', unit: 'kg', rule: food([' losos'], ['uzen', 'sushi', 'konzerv', 'krmiv', 'marinov', 'játra', 'lososov', ' a la', ' à la', 'ala losos', 'olivy', 'pastou', 'těstovin', 'matjes', 'treska']) },
  { key: 'tunak-konzerva', name: 'Tuňák v konzervě', categories: [P], subcategory: 'Ryby a mořské plody', unit: 'kg', rule: { keywords: [' tuňák', ' tunak'], exclude: ['salát', 'pomazán', 'omáčk', 'pizza', 'sendvič', 'těstovin', 'krmiv', 'kočk', 'steak', 'čerstv', 'filet', 'sashimi', 'paté', 'krém', 'tubě', 's vejci'], headOnly: true } },

  // --- Trvanlivé ------------------------------------------------------------------------------------
  { key: 'ryze', name: 'Rýže', categories: [P], subcategory: 'Těstoviny a rýže', unit: 'kg', rule: food([' rýže', ' rýž '], ['rýžové', 'rýžový', 'rýžová', 'mléko', 'nápoj', 'kaše', 'nudle', 'chlebíč', 'oplat', 'krekr', 'ocet', 'mouka', 'dezert', 'pudink', 'salát', 'směs se', 'se zeleninou', 's kuřecím', 'rizoto', 'pivo', 'ryze hořká', 'těstovin']) },
  { key: 'testoviny', name: 'Těstoviny', categories: [P], subcategory: 'Těstoviny a rýže', unit: 'kg', rule: food([' těstoviny', ' spaghetti', ' špagety', ' penne', ' fusilli', ' vřetena', ' kolínka', ' farfalle', ' tagliatelle', ' makaróny', ' makarony', ' mušličky', ' kolínka', ' rigatoni', ' linguine', ' fusi'], ['salát', 's omáčkou', 'boloňsk', 'hotov', 'carbonara', 'se sýrem', 's kuřecím', 'zapečen', 'tortellini', 'ravioli', 'gnocchi', 'polévk', 'směs na', ' s ', ' se ']) },
  { key: 'mouka-hladka', name: 'Mouka hladká', categories: [P], subcategory: 'Mouka a pečení', unit: 'kg', rule: food([' mouka hladká', ' hladká mouka', ' mouka hladk', ' mouka pšeničná hladká', ' pšeničná mouka hladká', ' hladka mouka'], ['kukuřičn', 'čirok', 'špald', 'rýžov', 'žitn', 'pohank', 'mandl', 'kokos', 'celozrn', 'bezlepk', 'pizz']) },
  { key: 'mouka-polohruba', name: 'Mouka polohrubá', categories: [P], subcategory: 'Mouka a pečení', unit: 'kg', rule: food([' mouka polohrubá', ' polohrubá mouka', ' pšeničná mouka polohrubá', ' mouka pšeničná polohrubá'], ['kukuřičn', 'čirok', 'špald', 'rýžov', 'žitn', 'pohank', 'mandl', 'kokos', 'celozrn', 'bezlepk', 'pizz']) },
  { key: 'mouka-hruba', name: 'Mouka hrubá', categories: [P], subcategory: 'Mouka a pečení', unit: 'kg', rule: food([' mouka hrubá', ' hrubá mouka', ' pšeničná mouka hrubá', ' mouka pšeničná hrubá'], ['kukuřičn', 'čirok', 'špald', 'rýžov', 'žitn', 'pohank', 'mandl', 'kokos', 'celozrn', 'bezlepk', 'pizz']) },
  { key: 'cukr-krupice', name: 'Cukr krupice a krystal', categories: [P], subcategory: 'Mouka a pečení', unit: 'kg', rule: food([' cukr krupice', ' cukr krystal', ' krystalový cukr', ' cukr bílý', ' bílý cukr', ' cukr bílý krup', ' krupice cukr'], ['třtin', 'moučk', 'vanilk', 'kostk', 'hroznov', 'březov', 'xylit']) },
  { key: 'cukr-moucka', name: 'Cukr moučka', categories: [P], subcategory: 'Mouka a pečení', unit: 'kg', rule: food([' cukr moučka', ' moučkový cukr', ' moučka cukr']) },
  { key: 'olej-slunecnicovy', name: 'Slunečnicový olej', categories: [P], subcategory: 'Oleje a tuky', unit: 'l', rule: food([' slunečnicový olej', ' olej slunečnicový', ' sl olej', ' slunečn olej'], ['v slunečnicovém', 've slunečnicovém', 'sardink', 'tuňák', 'chips']) },
  { key: 'olej-repkovy', name: 'Řepkový olej', categories: [P], subcategory: 'Oleje a tuky', unit: 'l', rule: food([' řepkový olej', ' olej řepkový'], ['v řepkovém', 've řepkovém', 'sardink', 'tuňák', 'chips', 'olivy']) },
  { key: 'olej-olivovy', name: 'Olivový olej', categories: [P], subcategory: 'Oleje a tuky', unit: 'l', rule: food([' olivový olej', ' olej olivový', ' extra panenský olivový', ' olive oil'], ['v olivovém', 've olivovém', 's olivovým', 'sardink', 'tuňák', 'chips', 'olivy', 'pokrutin', 'sprej', 'aroma', 'chilli', 'provoněn']) },
  { key: 'cocka', name: 'Čočka', categories: [P], subcategory: 'Luštěniny', unit: 'kg', rule: food([' čočka', ' čočky', ' cocka'], ['salát', 'polévk', 'konzerv', 'chips', 'křupky', 'těstovin', 'nudle', 'sendvič', 'se zeleninou', 'na kyselo', 'pomazánk', 'puffed', 'smažen', 'chipsy', 'hrnec', 'plátek', 'bowl', 'karamel']) },
  { key: 'med', name: 'Med', categories: [P], subcategory: 'Džemy, med a pomazánky', unit: 'kg', rule: food([' květový med', ' lesní med', ' akátový med', ' luční med', ' medovicový med', ' včelí med', ' med květový', ' med lesní', ' med akátový', ' med luční', ' med pastovaný', ' med krémový', ' med tekutý'], ['medov', 'medvěd', 'perník', 'lupínk', 'křupky', 'hořčic', 'ocet', 'sušenk', 'cereál', 'müsli', 'tyčink', 'sirup', 'pivo', 'medovin', 'kapsle', 'sprej']) },
  { key: 'ocet', name: 'Ocet', categories: [P], subcategory: 'Omáčky a dochucovadla', unit: 'l', rule: food([' ocet', ' octa', ' octový'], ['okurk', 'nakládan', 'čistič', 'odvápň', 'dresink', 'balsamic krém', 'glazur', 'zelenin', 'cibulk', 'česnek', 'sůl a ocet', 'pringles', 'chipsy', 'omáčk']) },
  { key: 'sul', name: 'Sůl', categories: [P], subcategory: 'Koření a bylinky', unit: 'kg', rule: food([' sůl jemná', ' sůl kamenná', ' jemná sůl', ' kamenná sůl', ' sůl jodidovaná', ' jedlá sůl', ' sůl mořská', ' mořská sůl', ' himálajská sůl', ' sůl '], ['s mořskou', 'se solí', 'chips', 'lupínk', 'křupky', 'tyčinky', 'preclík', 'karamel', 'do myčky', 'koupel', 'pepř', 'směs', 'na brambory', 'vroubk', 'rice', 'cakes', 'chlebíčk']) },
  { key: 'drozdi', name: 'Droždí', categories: [P], subcategory: 'Mouka a pečení', unit: 'kg', rule: food([' droždí', ' drožd'], ['bez droždí', 'pečivo']) },
  { key: 'kava-mleta', name: 'Káva mletá', categories: [P], subcategory: 'Káva a čaj', unit: 'kg', rule: food([' mletá káva', ' káva mletá', ' pražená mletá'], ['kapsl', 'instant', 'rozpustn', 'bonbon', 'čokolád', 'latte', 'cappuccino']) },
  { key: 'kava-zrnkova', name: 'Káva zrnková', categories: [P], subcategory: 'Káva a čaj', unit: 'kg', rule: food([' zrnková káva', ' káva zrnková', ' kávová zrna', ' zrnková', ' pražená zrnková'], ['kapsl', 'instant', 'rozpustn', 'čokolád']) },

  // --- Nápoje ---------------------------------------------------------------------------------------
  { key: 'voda-neperliva', name: 'Voda neperlivá', categories: [P], subcategory: 'Nápoje', unit: 'l', rule: { keywords: [' neperlivá', ' neperlivá voda', ' pramenitá voda', ' kojenecká voda', ' nesycen'], exclude: ['aloe', 'okurk', 'zázvor', 'meduň', 'marakuj', 'višn', 'kokos', 'grep', 'ananas', 'meloun', 'ochucen', 'limet', 'yuzu', 'esence', ' perliv', ' sycen', 'mojito', 'vitamín', 'příchu', 's příchutí', 'sirup', 'limonád', 'jahod', 'malin', 'citron', 'pomeranč', 'broskev', 'jablk', 'hrušk', 'lesní', 'ovocn', 'tělov', 'micelár'], headOnly: false } },
  { key: 'voda-perliva', name: 'Voda perlivá', categories: [P], subcategory: 'Nápoje', unit: 'l', rule: { keywords: [' perlivá', ' jemně perlivá', ' perliva', ' minerální voda'], exclude: ['aloe', 'okurk', 'zázvor', 'meduň', 'marakuj', 'višn', 'kokos', 'grep', 'ananas', 'meloun', 'ochucen', 'limet', 'yuzu', 'esence', 'neperliv', 'nesycen', 'příchu', 's příchutí', 'sirup', 'limonád', 'jahod', 'malin', 'citron', 'pomeranč', 'broskev', 'jablk', 'hrušk', 'lesní', 'ovocn', 'víno', 'sekt', 'mošt', 'mojito', 'rybíz', 'šípek', 'mango', 'vitamín', 'oshee', 'nealko'], headOnly: false } },
  { key: 'pivo', name: 'Pivo', categories: [P], subcategory: 'Alkoholické nápoje', unit: 'l', rule: { keywords: [' pivo', ' ležák', ' výčepní', ' kozel', ' pilsner', ' gambrinus', ' radegast', ' staropramen', ' krušovic', ' budvar', ' svijan', ' bernard', ' plzeň'], exclude: ['nealko', ' 0 0', 'radler', 'pivovarsk', 'sýr', 'krekr', 'chips', 'sklenice', 'korbel', 'pivní'], headOnly: false } },
  // Tea: the word must name the product ("Čaj Earl Grey"), so iced tea, kombucha, tea-flavoured sweets
  // and tea ware are out. Seed proposal 2026-10-seed-v1 (docs/12); unmeasured on the real catalog.
  { key: 'caj', name: 'Čaj', categories: [P], subcategory: 'Káva a čaj', unit: 'kg', rule: food([' čaj ', ' čaje ', ' čaji ', ' čajů '], ['ledov', 'fuzetea', 'cajthaml', 'ice tea', 'icetea', 'nestea', 'kombuch', 'limonád', 'čajov', 'konvic', 'sítko', 'hrnek', 'sada', 'dárkov', 'matcha latte', 'chai latte', 'sušenk', ' želé ', 'koření', ' rum ', 'likér']) },
  // Wine and sparkling wine named as such. Wines named only by grape ("Frankovka 0,75 l") are left
  // without a type rather than guessed. Grapes ("hroznové víno") are produce.
  { key: 'vino', name: 'Víno', categories: [P], subcategory: 'Alkoholické nápoje', unit: 'l', rule: food([' víno', ' vína', ' sekt', ' prosecco', ' šampaňsk', ' cava ', ' sauvignon', ' chardonnay', ' rulandské', ' ryzlink', ' cabernet', ' merlot', ' pinot', ' primitivo', ' tramín', ' veltlínské', ' frankovka', ' svatovavřinecké', ' zweigeltrebe', ' riesling', ' pálava', ' müller thurgau', ' chianti', ' shiraz', ' syrah', ' montepulciano', ' muškát moravský', ' pozdní sběr', ' výběr z hroznů', ' vinařství', ' frizzante', ' spumante', ' champagne', ' brut ', ' demi sec', ' extra dry'], ['liqueur', 'likér', 'víno bylinn','kapkou vína', 'perlivá voda', 'nealko', 'bezalko', 'vinar', 'vinohrad', 'svařen', 'sangri', 'omáčk', 'na víně', 'vínov', 'hroznov', 'ocet', 'koření', 'sklenic', 'vývar', 'dort', ' želé ', 'bonbon', 'pralin', 'sýr', 'klobás', 'párky', 'sada', 'dárkov'], { headOnly: false }) },
  // Spirits by the plain name of the spirit; liqueur is left to the household, flavourings and
  // confectionery with the name are not spirits.
  { key: 'lihoviny', name: 'Lihoviny', categories: [P], subcategory: 'Alkoholické nápoje', unit: 'l', rule: { keywords: [' vodka', ' whisky', ' whiskey', ' rum ', ' gin ', ' tequila', ' brandy', ' koňak', ' slivovice', ' becherovka', ' fernet', ' tuzemák', ' tuzemsk', ' božkov'], exclude: ['vaječný', 'na pečení', 'liqueur', 'likér', 'tonic', 'cocktail', 'koktejl', ' mix ', ' rtd', 'nealko', 'příchu', 'aroma', 'omáčk', 'dort', 'bonbon', 'pralin', 'čokolád', 'koření', 'ocet', 'sklenic', 'sada', 'dárkov', 'džus', 'kečup', 'sýr', 'sušenk', 'pivo', 'pivní'], headOnly: false } },
  // Bar chocolate: the word names the product ("Mléčná čokoláda"), not what it flavours; baking and
  // drinking chocolate, spreads and figurines are other products.
  { key: 'cokolada-tabulkova', name: 'Čokoláda tabulková', categories: [P], subcategory: 'Sladkosti', unit: 'kg', rule: food([' čokoláda', ' čokolády'], ['ferrero rocher original', 'raffaello', 'mon chéri', 'müllermilch', 'mléčný nápoj','na vaření', 'křupk', 'kukuřičn', 'topping', 'kousky hořk', 'kousky čokol', 'pecičk', 'lindor', 'cornetto', 'kornout', 'corny', 'protein', 'cookie', 'mousse', 'milkshake', ' bar ', ' bar', 'flapjack', 'roláda', ' mix ', 'kuvertur', 'kapky', 'kapičk', 'instant', 'k pití', 'pitná', 'nápoj', 'pomazánk', 'nátěr', 'figurk', 'mikuláš', 'adventní', 'kalendář', 'bonboniér', 'posyp', 'zmrzlin', 'dezert', 'dort', 'cereál', 'lupínk', 'sušenk', 'oplat', 'tyčink', 'vaječn', 'kinder', 'fontán'], {}, ['čokolád']) },
  // Crisps by their name; tortilla/vegetable/lentil snacks and dips are not "chips" here.
  { key: 'chipsy-snacky', name: 'Chipsy', categories: [P], subcategory: 'Slané pochutiny', unit: 'kg', rule: food([' chipsy', ' chips', ' brambůrky', ' bramborové lupínky', ' lays ', ' lay s ', ' pringles', ' doritos', ' ruffles', ' monster munch', ' crisps'], ['preclík', 'mccain', 'protein', 'cookie', 'chocolate', ' bar', 'nori', 'řas', 'hummus', 'kokosov', 'quinoa', 'čočk', 'cizrn', 'jablečn', 'ovocn', 'dip', 'omáčk', 'koření', 'pro psy', 'sada', 'dárkov', 'čokolád', 'tortil', 'nachos'], {}, ['chips', 'lupínk', 'snack', 'tortil']) },

  // --- Seed proposal 2026-10-seed-v1, batches 2–7 (docs/12): drinks, dairy, sweets, ice cream, sauces,
  // spices, plant drinks, cured meats, seafood, sweet pastry. Every rule was measured with a read-only
  // dry run on the production catalog (see the changelog); a name that fits two types gets none.
  { key: 'limonady', name: 'Limonády a nealko nápoje', categories: [P], subcategory: 'Nápoje', unit: 'l', rule: { keywords: [' limonád', ' cola ', ' coca cola', ' pepsi', ' kofola', ' sprite', ' fanta ', ' mirinda', ' tonic', ' energy', ' energetick', ' red bull', ' monster ', ' ginger ale', ' bitter lemon'], exclude: ['birell', 'pudink', 'puding', 'pudding', 'kombuch', 'malibu', 'likér', 'minerální', 'gin', 'vodka', ' rum ', 'whisky', 'víno', 'sirup', 'prášek', 'kapsl', 'želé', 'bonbon', 'gumov', 'lízát', 'žvýk', 'zmrzlin', 'sušenk', 'tyčink', 'protein', 'čaj', 'jogurt', 'tablet', 'gel', 'cocktail', 'pivo', 'sůl', 'koření'], headOnly: false } },
  { key: 'dzusy', name: 'Džusy a ovocné šťávy', categories: [P], subcategory: 'Nápoje', unit: 'l', rule: { keywords: [' džus', ' nektar', ' smoothie'], exclude: ['džusové', 'dřeň', 'corny', 'polárka', 'skittles', 'nektarink', 'agáv', 'javor', 'sirup', 'želé', 'bonbon', 'jogurt', 'ledov', 'ice tea', 'zmrzlin', 'tyčink', 'gumov', 'psy', 'kočk'], headOnly: false } },
  { key: 'sirupy', name: 'Sirupy', categories: [P], subcategory: 'Nápoje', unit: 'l', rule: { keywords: [' sirup'], exclude: ['čekank', 'javor', 'agáv', 'datlov', 'rýžov', 'kašl', 'proti', 'cukrov', 'karamel', 'čokolád', 'topping', 'palačink', 'pancake', 'bez cukru', 'zero', 'zdravotn', 'dětsk', 'vitamín', 'zázvor shot'], headOnly: false } },
  { key: 'jogurt-ochuceny', name: 'Ochucený jogurt', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' jogurt'], ['jogurtové mléko', 'jogurtový nápoj', 'zakysaný nápoj', 'zmrzk', 'bílý', 'natur', 'přírodní', 'řeck', 'pitný', 'pitn', 'k pití', 'drink', 'kefír', 'zmrzlin', 'dip', 'dresink', 'omáčk', 'sušenk', 'tyčink', 'psy', 'kočk', 'skyr', 'rostlinn', 'sójov', 'kokosov', 'ovesn'], {}, ['jogurt']), requires: ['jahod', 'malin', 'borůvk', 'broskv', 'meruňk', 'vanilk', 'čokolád', 'banán', 'višn', 'lesní', 'ovoc', 'karamel', 'mango', 'ananas', 'jablk', 'hrušk', 'třešn', 'cereál', 'müsli', 'ostružin', 'kiwi', 'slivk', 'oříšk', 'kousky'] },
  { key: 'jogurt-pitny', name: 'Pitný jogurt', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' jogurt', ' jogurty'], ['rostlinn', 'sójov', 'kokosov', 'ovesn', 'kefír', 'skyr', 'psy', 'kočk', 'dresink'], {}, ['jogurt']), requires: ['pitný', 'pitn', 'k pití', ' drink'] },
  { key: 'skyr', name: 'Skyr', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' skyr'], ['rostlinn', 'sójov', 'kokosov', 'ovesn', 'psy', 'kočk', 'sušenk', 'tyčink', 'koláč'], {}, []) },
  { key: 'susenky-oplatky', name: 'Sušenky a oplatky', categories: [P], subcategory: 'Sladkosti', unit: 'kg', rule: food([' sušenk', ' oplatk', ' oplatky', ' piškot', ' perníč'], ['směs na', 'slané', 'těsto', 'strouhan', 'psy', 'kočk', 'zmrzlin', 'dort', 'tyčink', 'protein', 'bar ', 'cookie', 'mix na', 'sada', 'dárkov', 'pro děti'], {}, ['sušenk', 'oplat', 'perník']) },
  { key: 'tycinky-sladke', name: 'Sladké tyčinky', categories: [P], subcategory: 'Sladkosti', unit: 'kg', rule: food([' tyčink', ' tyčinka'], ['hnojiv', 'grissin', 'seitan', 'zeleninov', 'grilov', 'sýrem', 'pekařsk', 'natur', 'slan', 'preclík', 'chlebov', 'krabí', 'rybí', 'sýrov', 'psy', 'kočk', 'zmrzlin', 'cukrov', 'skořic', 'vanilk', 'salám', 'masov', 'pizza', 'cereální k'], {}, ['tyčink']) },
  { key: 'bonbony-zvykaci', name: 'Bonbóny a žvýkačky', categories: [P], subcategory: 'Sladkosti', unit: 'kg', rule: food([' bonbon', ' bonbón', ' žvýkačk', ' lízátk', ' gumov', ' dražé', ' pastilk', ' želé '], ['cukrářsk', 'rybízov', 'energetick', 'prášek', 'želírov', 'dezert', 'ovoce', 'sušenk', 'tyčink', 'kašl', 'v krku', 'vitamín', 'nikotin', 'zubní', 'bylinn', 'sirup', 'nápoj', 'psy', 'kočk', 'zmrzlin', 'koláč', 'kalendář', 'čokolád', 'boniér', 'dort', 'forma', 'máčen'], {}, ['bonbon', 'pralin']) },
  { key: 'zmrzliny', name: 'Zmrzliny', categories: [P], subcategory: 'Mražené potraviny', unit: 'l', rule: food([' zmrzlin', ' nanuk', ' sorbet', ' kornout'], ['příchu', 'tyčink', 'sušenk', 'pudink', 'psy', 'kočk', 'dort', 'poleva', 'sirup', 'koření', 'forma', 'strojek', 'lžíce', 'kelímk', 'prášek'], {}, ['zmrzlin', 'nanuk']) },
  { key: 'omacky-hotove', name: 'Hotové omáčky', categories: [P], subcategory: 'Omáčky a dochucovadla', unit: 'kg', rule: food([' omáčka', ' omáčky', ' pesto', ' dresink', ' zálivk'], ['kečup', 'hořčic', 'majonéz', 'směs', 'prášek', 'instantní', 'kostky', 'koření', 'psy', 'kočk', 'těstovin', 'nudle', 'čips', 'sušenk', 'sada', 'chuť', 'příchu'], {}, ['omáčk']) },
  { key: 'nahrazky-mleka-rostlinne', name: 'Rostlinné nápoje', categories: [P], subcategory: 'Rostlinné alternativy', unit: 'l', rule: food([' ovesný nápoj', ' sójový nápoj', ' mandlový nápoj', ' rýžový nápoj', ' kokosový nápoj', ' hrachový nápoj', ' ovesné mléko', ' sójové mléko', ' mandlové mléko', ' rýžové mléko', ' lískooříškový nápoj'], ['jogurt', 'zmrzlin', 'dezert', 'pudink', 'smetan', 'kakao', 'psy', 'kočk', 'těstovin', 'sýr'], {}, ['nápoj']) },
  { key: 'koreni', name: 'Koření', categories: [P], subcategory: 'Koření a bylinky', unit: 'kg', rule: food([' koření', ' pepř ', ' pepře ', ' majoránka', ' oregano', ' kmín ', ' kmínu ', ' skořice ', ' bobkový list', ' tymián ', ' rozmarýn ', ' kurkuma ', ' kari ', ' hřebíček ', ' badyán '], ['grissin', 'pasta', 'čerstv', 'kelímek', 'shot', 'kroužk', 'crack', 'protein', 'cereál', 'mlýnek', 'drcen', 'omáčk', 'salám', 'sýr', 'klobás', 'chips', 'sůl', 'čaj', 'sušenk', 'perník', 'džem', 'psy', 'kočk', 'pesto', 'hotov', 'kečup', 'nudle', 'polévk', 'těstovin', 'zmrzlin', 'cukr', 'olej', 'víno', 'rýže', 'pivo', 'zelenin', 'maso'], {}, []) },
  { key: 'salam', name: 'Salám', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: food([' salám', ' salámy', ' salámek'], ['pizza', 'salame', 'oetker', 'ristorante', 'sýr', 'sendvič', 'chips', 'psy', 'kočk', 'tyčink', 'těstovin', 'bagetk', 'hotov', 'pomazánk'], {}, ['salám']) },
  { key: 'morske-plody', name: 'Mořské plody', categories: [P], subcategory: 'Ryby a mořské plody', unit: 'kg', rule: food([' krevet', ' kalamár', ' chobotnic', ' mušle', ' slávk', ' hřebenatk', ' humr', ' langust'], ['závitk', 'sushi', 'sashimi', 'chips', 'křupk', 'salát', 'pomazánk', 'nudle', 'polévk', 'pizza', 'těstovin', 'paštik', 'psy', 'kočk', 'příchu', 'instant', 'rýže', 'dresink'], {}, []) },
  { key: 'pecivo-sladke', name: 'Sladké pečivo', categories: [P], subcategory: 'Pečivo', unit: 'ks', rule: food([' croissant', ' koláč ', ' koláče ', ' koláčky ', ' koláček ', ' buchta', ' donut', ' kobliha', ' muffin', ' vánočka', ' mazanec', ' štrúdl', ' bábovk'], ['toast', 'makovec', 'koláčkova', 'mražen', 'těsto', 'směs', 'příchu', 'psy', 'kočk', 'sušenk', 'zmrzlin', 'jogurt', 'tyčink', 'bonbon', 'pudink', 'kapsl', 'forma', 'mix na'], {}, ['závin']) },

  // --- Seed proposal batches 8–15 (docs/12, 2026-10-10): drinks, alcohol, dairy, sweets, meat, snacks,
  // ready meals, produce, baking, hair/body care, hosiery, supplements, baby goods. Measured read-only
  // on the production catalog and reviewed on samples before use; names that fit two types get none.
  { key: 'kombucha', name: 'Kombucha', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' kombuch'], exclude: ['sirup'], headOnly: false } },
  { key: 'nealko-pivo', name: 'Nealkoholické pivo', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' birell', ' nealkoholické pivo', ' nealko pivo', ' nealkoholický ležák', ' bezalkoholické pivo', ' pivo nealko'], exclude: [], headOnly: false } },
  { key: 'ledove-caje', name: 'Ledové čaje', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' ledový čaj', ' ledovy caj', ' ice tea', ' icetea', ' nestea', ' fuzetea'], exclude: ['sirup'], headOnly: false } },
  { key: 'voda-ochucena', name: 'Ochucená voda', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' mattoni', ' magnesia', ' korunní', ' rajec', ' poděbradka', ' ondrášovka', ' dobrá voda', ' bonaqua', ' aquila', ' evian', ' volvic', ' vincentka', ' ochucená voda', ' voda ochucená', ' perlivá voda', ' jemně perlivá', ' pramenitá voda ochucená', ' ochucená minerální', ' voda s příchutí', ' vody s příchutí'], exclude: ['sirup', 'koncentrát', 'víno', 'vína', 'jogurt', 'čaj', 'pivo', 'bonbon', 'žvýk', 'sušenk', 'tyčink', 'chips', 'krém', 'zmrzl', 'dezert', 'kaše', 'džus', 'limonád', 'energy', 'cola', 'smoothie', 'tablet', 'kojenec', 'neperlivá voda'], headOnly: false }, requires: ['příchut', 'ovoc', 'citron', 'pomeran', 'jahod', 'malin', 'broskv', 'mango', 'meloun', 'limet', 'grep', 'ananas', 'kokos', 'maracuj', 'meduň', 'zázvor', 'višn', 'jablk', 'hrušk', 'aloe', 'okurk', 'mojito', 'imuno', 'vitamin', 'marakuj', 'ochucen'] },
  { key: 'mlecne-napoje', name: 'Mléčné nápoje', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' mléčný nápoj', ' müllermilch', ' mléčné pití', ' kakaový nápoj', ' mléčný koktejl'], exclude: ['instantní', 'zmrzlin', 'rostlinn', 'sójov', 'ovesn', 'mandlov', 'kokosov', 'rýžov'], headOnly: false } },
  { key: 'kysane-napoje', name: 'Kysané mléčné nápoje', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' zakysaný nápoj', ' jogurtový nápoj', ' probiotický nápoj', ' kysaný nápoj', ' actimel', ' kefírový nápoj', ' acidofil', ' jogurtové mléko'], exclude: ['rostlinn', 'sójov'], headOnly: false } },
  { key: 'likery', name: 'Likéry', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' likér', ' liker', ' liqueur', ' vaječný', ' jägermeister', ' jagermeister', ' amaretto', ' baileys', ' aperol', ' malibu', ' campari', ' absinth'], exclude: ['trubičk', 'čokolád', 'bonbon', 'pralin', 'dort', 'zmrzl', 'sýr', 'sušenk', 'tyčink', 'příchu', 'aroma', 'džus'], headOnly: false } },
  { key: 'cidery', name: 'Cidery', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' cider', ' cidre', ' strongbow', ' kopparberg', ' somersby'], exclude: ['ocet', 'jablečný ocet'], headOnly: false } },
  { key: 'cerstvy-syr', name: 'Čerstvý a smetanový sýr', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' lučina', ' gervais', ' žervé', ' zerve', ' mascarpone', ' ricotta', ' cream cheese', ' smetanový sýr', ' philadelphia', ' apérifrais'], ['pesto', 'tortelloni', 'tortellini', 'ravioli', 'cannelloni', 'tavený', 'skyr', 'dort', 'sušenk', 'tyčink', 'cheesecake', 'koláč', 'dezert', 'zmrzl', 'těstovin', 'sendvič', 'chips', 'dip'], {}, ['krém', 'pomazán']) },
  { key: 'syr-tvrdy', name: 'Sýr tvrdý a polotvrdý', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' cheddar', ' ementál', ' emmental', ' maasdam', ' gruyère', ' gruyere', ' comté', ' mimolette', ' gran moravia', ' trapist', ' uzený sýr', ' uzeny syr', ' tvarůžk', ' tvrdý sýr', ' ovčí sýr', ' kozí sýr'], ['křupav', 'gouda', 'eidam', 'máslo', 'tavený', 'tyčink', 'křupk', 'chips', 'sendvič', 'pizza', 'toast', 'mozzarella', 'salát', 'krekr', 'svačink', 'dip', 'omáčk', 'jogurt', 'sýrová svačinka'], {}, []) },
  { key: 'mlecne-dezerty', name: 'Mléčné dezerty a pudinky', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' pudink', ' puding', ' pudding', ' mléčný dezert', ' mléčná rýže', ' tvarohový dezert', ' krémový dezert', ' dezert ', ' tiramisu', ' panna cotta'], exclude: ['puding příchuť', 'pudink příchuť', 'naturamyl', 'lavazza', 'prášek', 'v prášku', 'směs', 'instantní', 'dort', 'zmrzlin', 'sušenk', 'tyčink', 'psy', 'kočk', 'na pečení', 'forma', 'rostlinn', 'sójov'], headOnly: false } },
  { key: 'mleko-kozi-ovci', name: 'Kozí a ovčí mléko', categories: [P], subcategory: null, unit: 'l', rule: { keywords: [' kozí mléko', ' ovčí mléko'], exclude: ['jogurt', 'sýr', 'mýdlo', 'kosmet', 'pleť', 'krém', 'šampon'], headOnly: false } },
  { key: 'bonboniery', name: 'Bonboniéry a pralinky', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' bonboniéra', ' bonboniér', ' pralinky', ' pralinek', ' pralinka', ' lindor', ' ferrero rocher original', ' raffaello', ' mon chéri'], exclude: ['tabulk', 'zmrzl', 'dort', 'nanuk'], headOnly: false } },
  { key: 'dorty-zakusky', name: 'Dorty a zákusky', categories: [P], subcategory: null, unit: 'ks', rule: { keywords: [' dort', ' dortík', ' zákusek', ' zákusky', ' cheesecake', ' roláda'], exclude: ['polárk', 'häagen', 'koláč', 'forma', 'svíčk', 'ozdob', 'na dort', 'korpus', 'sada', 'zmrzl', 'poleva', 'pudink', 'prášek', 'směs', 'tyčink', 'sušenk', 'figurk', 'jogurt', 'palačink'], headOnly: false } },
  { key: 'kachna', name: 'Kachní maso', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: food([' kachní', ' kachna', ' kachny', ' kachnu'], ['foie gras', 'párečk', 'párk', 'paštik', 'uzen', 'klobás', 'salám', 'polévk', 'vývar', 'krmiv', 'psy', 'kočk', 'konfit', 'confit', 'rillette'], {}, ['paštik', 'klobás', 'šunk']) },
  { key: 'susene-maso', name: 'Sušené maso', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' jerky', ' biltong', ' sušené maso', ' sušená vepřová', ' sušená panenka'], exclude: ['psy', 'kočk', 'pro psy'], headOnly: false } },
  { key: 'vyvary-bujony', name: 'Vývary a bujóny', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' vývar', ' bujón', ' bujon'], exclude: ['skelet', 'ležák', 'pivo', 'pivní', 'psy', 'kočk', 'expres menu'], headOnly: false } },
  { key: 'tlacenky-jitrnice', name: 'Tlačenka, jitrnice a jelito', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: { keywords: [' tlačenk', ' jitrnic', ' jelito', ' játrovka'], exclude: ['paštik', 'psy', 'kočk'], headOnly: false } },
  { key: 'arasidy', name: 'Arašídy', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' arašíd'], exclude: ['oplatk', 'nugeta', 'koule', 'sedita', 'trubičk', 'rýžov', 'ořech', 'orech', 'cereál', 'corn flakes', 'máslo', 'krém', 'čokolád', 'karamel', 'tyčink', 'olej', 'pomazánk', 'sušenk', 'křupk', 'kokos', 'bonbon', 'dort', 'zmrzl', 'müsli', 'proteinov', 'pralin', 'granola', 'mouka', 'datle', 'ovoce'], headOnly: false } },
  { key: 'popcorn', name: 'Popcorn', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' popcorn'], exclude: ['ovesn', 'nápoj', 'donut', 'posyp', 'sirup', 'koření', 'tyčink', 'čokolád'], headOnly: false } },
  { key: 'krekry', name: 'Krekry', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' krekr', ' cracker', ' crackers', ' tuc ', ' tuc bake'], exclude: ['psy', 'kočk'], headOnly: false } },
  { key: 'slane-tycinky-preclik', name: 'Preclíky a slané tyčinky', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' preclík', ' preclíč', ' salinis', ' tyčinky solené', ' slané tyčinky', ' grissini', ' grissin'], exclude: ['čokolád', 'hnojiv'], headOnly: false } },
  { key: 'tortilla-chipsy', name: 'Tortilla chipsy a nachos', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' tortilla chips', ' tortilla chipsy', ' nachos', ' tortilla lupínky', ' totopos'], exclude: ['guacamole', 'dip', 'omáčk', 'salsa'], headOnly: false } },
  { key: 'krupky-snacky', name: 'Křupky', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' křupky', ' křupka', ' pufované'], exclude: ['oplatk', 'psy', 'kočk', 'tyčink', 'krekr', 'cereál', 'müsli', 'snídaň'], headOnly: false } },
  { key: 'polevky', name: 'Polévky', categories: [P], subcategory: null, unit: 'kg', rule: food([' polévka', ' polévky', ' polévk'], ['polévkový', 'polévková', 'koření', 'kostky', 'bujón', 'těstoviny do', 'nudle do', 'zelenina do', 'na polévku', 'ochucovadlo', 'vývar', 'zahušťovadlo', 'instantní nudle', 'hrnek na', 'miska na'], {}, ['polévka']) },
  { key: 'pizza-hotova', name: 'Pizza hotová', categories: [P], subcategory: null, unit: 'ks', rule: food([' pizza', ' pizzu'], ['korpus', 'tyčk', 'těsto', 'omáčk', 'koření', 'mražen', 'mrazen', 'mouka', 'směs', 'kámen', 'kořen', 'pečení', 'pizzu na', 'sýr na', 'strouhan', 'sendvič', 'šneci'], {}, ['pizza']) },
  { key: 'salaty-hotove', name: 'Hotové saláty', categories: [P], subcategory: 'Lahůdky a hotová jídla', unit: 'kg', rule: food([' salát'], ['little gem', 'lollo', 'rosso', 'biondo', 'eskariol', 'endivi', 'čekank', 'kadeřav', 'dresink', 'zálivk', 'koření', 'ledový', 'římský', 'hlávkový', 'rukola', 'polníč', 'okurk', 'mražen'], {}, ['salát']), requires: ['bramborov', 'vajíčk', 'krab', 'coleslaw', 'mexick', 'zelný', 'těstovin', 'tuňák', 'kuřec', 'šunk', 'sýr', 'majonéz', 'jogurt', 'řahol', 'pochoutk', 'retro', 'vlašsk', 'francouzsk', 'míchan', 'ovocn', 'čočk', 'cizrn', 'bulgur', 'kuskus', 'quinoa', 'rýž', 'fazol', 'hovězí', 'vepřov', 'losos', 'caesar', 'cézar', 'kapustov', 'mrkvov', 'řepa', 'šopsk', 'řeck', 'nicoise', 'vitamín', 'pikant', 'kimchi', 'zeleninov', 'rybí', 'mořsk', 'sleď', 'tvaroh', 'párek', 'uzen'] },
  { key: 'sendvice-wrapy', name: 'Sendviče a wrapy', categories: [P], subcategory: null, unit: 'ks', rule: { keywords: [' sendvič', ' sendvic', ' wrap', ' wrapy', ' panini', ' tramezzino'], exclude: ['toust', 'super sendvič', 'světlý', 'tmavý', 'vícezrnný', 'baskeeto', 'housk', 'chléb', 'bulk', 'rohlík', 'semínk', 'sýr na', 'chléb na', 'příchu', 'šunka na', 'psy', 'kočk', 'dárkov', 'toustov', 'maker', 'sendvičov'], headOnly: false } },
  { key: 'kvasena-zelenina', name: 'Kvašená zelenina', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' kimchi', ' sauerkraut', ' kysané zelí', ' kvašené', ' kvašená zelenina', ' kvašený'], exclude: ['nápoj', 'zálivk', 'gyoza', 'tofu', 'omáčk', 'koření', 'nudle', 'polévk', 'pivo'], headOnly: false } },
  { key: 'instantni-nudle', name: 'Instantní nudle', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' instantní nudle', ' nudle v kelímku', ' yum yum', ' yumyum', ' ramen', ' cup noodles', ' instantní soba', ' nudle z pánve', ' instantní smažené nudle'], exclude: ['psy', 'kočk'], headOnly: false } },
  { key: 'ovoce-exoticke', name: 'Exotické ovoce', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['ananas', 'mango', 'kiwi', 'papája', 'liči', 'granátové jablko', 'maracuja', 'meloun', 'kaki', 'fíky', 'pitahaya'], ['sušen', 'smoothie', 'sirup', 'džus', 'nektar', 'jogurt', 'zmrzl', 'tyčink', 'bonbon', 'chips', 'kompot']) },
  { key: 'kukurice', name: 'Kukuřice', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['kukuřice', 'kukuřičné klasy'], ['konzerv', 'sterilovan', 'mražen', 'křupk', 'lupínk', 'popcorn', 'mouka', 'krupic', 'škrob', 'chips', 'snack', 'tortil', 'vločky']) },
  { key: 'dyne', name: 'Dýně', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['dýně', 'dýni'], ['semínk', 'olej', 'polévk', 'pyré', 'koření']) },
  { key: 'spenat', name: 'Špenát', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['špenát'], ['sekan', 'porcovan', 'mražen', 'krém', 'knedl', 'listový', 'omáčk', 'polévk', 'lasagne', 'ravioli', 'gnocchi', 'pyré']) },
  { key: 'cervena-repa', name: 'Červená řepa', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['červená řepa', 'řepa červená'], ['sterilovan', 'cukrov', 'nálev', 'salát', 'pomazánk', 'džus', 'šťáv', 'chips', 'křen']) },
  { key: 'kvetak', name: 'Květák', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['květák'], ['mražen', 'rýže', 'pyré', 'polévk', 'krém', 'sterilovan']) },
  { key: 'knedliky', name: 'Knedlíky a noky', categories: [P], subcategory: null, unit: 'kg', rule: food([' knedlík', ' knedlíky', ' knedlicky', ' noky', ' halušky', ' gnocchi'], ['směs', 'prášek', 'v prášku', 'těsto', 'na knedlíky', 'psy', 'kočk'], {}, ['knedl']) },
  { key: 'testo', name: 'Těsto', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' těsto ', ' těsto na', ' listové těsto', ' křehké těsto', ' kynuté těsto'], exclude: ['váleček', 'quiche', 'mouk', 'směs', 'prášek', 'na těstoviny', 'nádobí', 'modelín', 'plastelín', 'hrnec', 'psy', 'kočk'], headOnly: false } },
  { key: 'smesi-na-peceni', name: 'Směsi na pečení', categories: [P], subcategory: null, unit: 'kg', rule: { keywords: [' směs na bábovku', ' směs na koláč', ' směs na dort', ' směs na palačinky', ' směs na lívance', ' směs na pečení', ' směs na chléb', ' směs na těsto ', ' směs na muffiny', ' směs na brownies', ' směs na pizzu', ' směs na pečivo', ' směs na bisk'], exclude: [], headOnly: false } },

  // --- Drogerie, domácnost a děti (batches 8–15) ----------------------------------------------------
  { key: 'barvy-na-vlasy', name: 'Barvy na vlasy', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' barva na vlasy', ' barvy na vlasy', ' barva na vlas', ' tónovací barva', ' koloráce'], exclude: ['pro psy'], headOnly: false } },
  { key: 'vlasova-pece', name: 'Vlasová péče', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' kondicionér', ' kondicioner', ' balzám na vlasy', ' maska na vlasy', ' krém na vlasy', ' olej na vlasy', ' sérum na vlasy', ' vlasová kúra', ' vlasová maska', ' elixír na vlasy', ' mlha na vlasy'], exclude: [' šampon', 'sprchov', 'pro psy', 'prádla', 'aviváž', 'na prádlo', '2v1', '3v1', 'dětsk'], headOnly: false } },
  { key: 'styling-vlasy', name: 'Stylingové přípravky na vlasy', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' lak na vlasy', ' gel na vlasy', ' tužidlo', ' vosk na vlasy', ' stylingov', ' pěna na vlasy', ' sprej na vlasy', ' pasta na vlasy', ' fixační sprej', ' hair spray'], exclude: ['corega', 'protéz', 'pro psy', 'na obočí', 'make'], headOnly: false } },
  { key: 'telova-pece', name: 'Tělová péče', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' tělové mléko', ' tělový krém', ' tělové máslo', ' tělový balzám', ' tělový olej', ' tělové sérum', ' tělový peeling', ' tělový jogurt', ' body lotion'], exclude: ['pro psy', 'dětsk', 'baby', 'opalov', 'po opalování'], headOnly: false } },
  { key: 'krem-na-ruce', name: 'Krém na ruce', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' krém na ruce', ' krem na ruce', ' balzám na ruce', ' hand cream', ' mléko na ruce'], exclude: ['dětsk'], headOnly: false } },
  { key: 'balzam-na-rty', name: 'Balzám na rty', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' balzám na rty', ' balzam na rty', ' tyčinka na rty', ' lip balm'], headOnly: false } },
  { key: 'opalovaci-pripravky', name: 'Opalovací přípravky', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' opalovací', ' po opalování', ' proti slunci', ' samoopalovací', ' opalování'], headOnly: false } },
  { key: 'odlicovaci-pripravky', name: 'Odličovací přípravky', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' odličovač', ' odličovací', ' micelární'], exclude: ['štětec'], headOnly: false } },
  { key: 'parfemy', name: 'Parfémy a vůně', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' parfémová voda', ' parfémovaná voda', ' toaletní voda', ' parfum ', ' edt ', ' edp ', ' eau de ', ' tělový sprej', ' tělová mlha'], exclude: ['osvěžovač', 'prádla', 'auto', 'svíčk', 'difuz', 'vonná', 'vonný', 'čistič'], headOnly: false } },
  { key: 'pece-o-nehty', name: 'Péče o nehty', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' odlakovač', ' pilník', ' nůžky na nehty', ' olej na nehty', ' kondicionér na nehty', ' kleštičky na nehty'], exclude: ['pro psy'], headOnly: false } },
  { key: 'kondomy', name: 'Kondomy', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' kondom'], headOnly: false } },
  { key: 'puncochy', name: 'Punčochové kalhoty', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' punčochové kalhoty', ' punčochy', ' punčocháče', ' stay up', ' stay-up'], headOnly: false } },
  { key: 'ponozky', name: 'Ponožky', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' ponožky', ' ponožka', ' ponožek'], exclude: ['maska', 'do bot'], headOnly: false } },
  { key: 'bryle', name: 'Brýle', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' dioptrické brýle', ' brýle na čtení', ' sluneční brýle'], headOnly: false } },
  { key: 'kontaktni-cocky', name: 'Kontaktní čočky', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' kontaktní čočky', ' kontaktní čočka', ' roztok na čočky'], headOnly: false } },
  { key: 'vitaminy-doplnky', name: 'Vitamíny a doplňky stravy', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' vitamín', ' vitamin ', ' vitaminy', ' doplněk stravy', ' magnesium', ' hořčík', ' multivitamín', ' omega 3', ' probiotik', ' kolagen', ' zinek', ' melatonin', ' šumivé tablety', ' tobolky'], exclude: ['make-up', 'make -up', 'sirup', 'šampon', 'krém', 'sprchov', 'tělov', 'pleť', 'vlas', 'maska', 'balzám', 'mýdl', 'deodor', 'zubní', 'ústní', 'mléko', ' gel', 'pasta', 'sérum', 'ovocn', 'džus', 'nápoj', 'čaj', 'jogurt', 'sušenk', 'psy', 'kočk', 'prací', 'aviváž'], headOnly: false } },
  { key: 'praci-kapsle', name: 'Prací kapsle', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' prací kapsle', ' kapsle na praní', ' prací kapsl'], headOnly: false } },
  { key: 'wc-bloky', name: 'WC bloky a závěsy', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' wc blok', ' wc závěs', ' wc kostk', ' wc tablet'], headOnly: false } },
  { key: 'rukavice-uklid', name: 'Rukavice na úklid', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' rukavice'], exclude: ['zahradní', 'mycí', 'lyžařsk', 'zimní', 'pracovní', 'kosmetick', 'bavlněn', 'hřejiv', 'motocykl', 'dětsk'], headOnly: false } },
  { key: 'osvezovace', name: 'Osvěžovače', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' osvěžovač'], exclude: ['dezinf', 'do myčky', 'do pračky', 'dechu', 'ústní', 'prádla', 'bot', 'myčky'], headOnly: false } },
  { key: 'dudliky', name: 'Dudlíky', categories: ['Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' dudlík', ' dudlíky', ' dudlik'], exclude: ['box', 'stužka', 'klip', 'řetízek', 'pouzdro', 'sterilizátor'], headOnly: false } },
  { key: 'detske-lahve', name: 'Kojenecké lahve', categories: ['Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' lahev'], exclude: ['nerezov', 'termo'], headOnly: false }, requires: ['canpol', 'lovi', 'avent', 'anti-colic', 'kojenecká', ' mam '] },
  { key: 'detske-kase', name: 'Dětské kaše', categories: ['Děti'], subcategory: null, unit: 'kg', rule: { keywords: [' kaše', ' kaši'], exclude: ['kašičk', 'savičk', 'tyčink', 'teat'], headOnly: false } },
  { key: 'kojenecke-mleko', name: 'Kojenecké mléko', categories: ['Děti'], subcategory: null, unit: 'kg', rule: { keywords: [' kojenecké mléko', ' počáteční mléko', ' pokračovací mléko', ' batolecí mléko', ' mléčná výživa', ' combiotik', ' nutrilon', ' kojenecká výživa', ' mléko pro kojence'], headOnly: false } },

  // --- Drogerie a domácnost -------------------------------------------------------------------------
  { key: 'mydlo', name: 'Mýdlo', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' mýdlo', ' mýdla', ' mydlo'], exclude: ['na skvrny', 'držák', 'sáček', 'dóza', 'na obočí', 'na vousy', 'dětsk', 'pro děti', 'baby', 'na nádobí', 'na prádlo', 'žlučov', 'šampon', 'sprchov', 'odstraň', 'dávkovač', 'mýdlenk', 'mýdlový ořech', 'pěna', 'koupel', 'holení', 'na podlahy'], headOnly: false } },
  { key: 'deodoranty', name: 'Deodorant', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' deodorant', ' deodoranty', ' deo ', ' antiperspirant', ' roll-on', ' roll on'], exclude: ['na nehty','ubrousk', 'do prádla', 'do bot', 'na boty', 'do auta', ' wc', 'bytov', 'osvěžovač', 'textil', 'dětsk', 'pro děti', 'vagin', 'intimní'], headOnly: false } },
  { key: 'damska-hygiena', name: 'Dámská hygiena', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' vložky', ' vložka', ' tampon', ' menstruační', ' slipové', ' hygienické ubrousky'], exclude: ['micelární', 'odličov', 'odlak', 'prsní', 'do bot', 'ortoped', 'pod patu', 'podprsenk', 'pro psy', 'inkontinen'], headOnly: false } },
  { key: 'ustni-hygiena', name: 'Ústní hygiena', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' zubní kartáček', ' zubní kartáčky', ' kartáček na zuby', ' zubní nit', ' ústní voda', ' ústní sprej', ' mezizubní', ' ústní vody'], exclude: ['pouzdro', ' pasta', 'pasty', 'dětsk', 'pro děti', 'náhradní hlavice'], headOnly: false } },
  { key: 'vlhcene-ubrousky', name: 'Vlhčené ubrousky', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' vlhčené ubrousky', ' vlhčený ubrousek', ' ubrousky vlhčené'], exclude: ['brýl', 'dětsk', 'baby', 'dezinf', 'toalet', 'deo', 'pro psy'], headOnly: false } },
  { key: 'holeni', name: 'Holení', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' holicí', ' pěna na holení', ' gel na holení', ' po holení', ' na holení'], exclude: ['depil'], headOnly: false } },
  { key: 'dekorativni-kosmetika', name: 'Dekorativní kosmetika', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' řasenka', ' rtěnka', ' lak na nehty', ' make-up', ' makeup', ' make up', ' oční stíny', ' tužka na oči', ' oční linky', ' korektor', ' tvářenka', ' rozjasňovač', ' lesk na rty', ' tužka na rty', ' oční linka', ' tužka na obočí', ' na obočí', ' kompaktní pudr', ' bronzer', ' paletka', ' podkladová báze', ' primer', ' fluid na rty', ' řasy', ' umělé řasy'], exclude: ['odlakovač', 'opalování', 'balzám na rty', 'dětský pudr', 'pudr na nohy', 'prací', 'leštěnk', 'nádobí', 'myčk', 'odličov', 'odstraňovač', 'štětec', 'houbičk', 'taška', 'kosmetická taš', 'kartáč', 'sada pro', 'čistič'], headOnly: false } },
  { key: 'pece-o-plet', name: 'Péče o pleť', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' pleťový krém', ' pleťové sérum', ' pleťová maska', ' pleťové mléko', ' denní krém', ' noční krém', ' oční krém', ' pleťová voda'], exclude: ['po opalování', 'opalován', 'micelární', 'opalovací', 'proti slunci', 'dětsk', 'baby', 'pro psy', 'tělov', 'na ruce', 'odličov'], headOnly: false } },
  { key: 'toaletni-papir', name: 'Toaletní papír', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' toaletní papír', ' toal papír', ' toaletni papir'], exclude: ['vlhčen', 'držák', 'kuchyň', 'ubrous', 'box', 'kapesník'], headOnly: false } },
  { key: 'kuchynske-uterky', name: 'Kuchyňské utěrky', categories: ['Domácnost', 'Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' kuchyňské utěrky', ' kuchyňská role', ' kuchyňské role', ' kuch role', ' papírové utěrky', ' utěrky papírové', ' tento ku'], exclude: ['textil', 'mikrovlák', 'bavln'], headOnly: false } },
  { key: 'zubni-pasta', name: 'Zubní pasta', categories: ['Drogerie', 'Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' zubní pasta', ' zubni pasta', ' zp '], exclude: ['kartáč', 'nit'], headOnly: false } },
  { key: 'sprchovy-gel', name: 'Sprchový gel', categories: ['Drogerie', 'Děti'], subcategory: null, unit: 'l', rule: { keywords: [' sprchový gel', ' sprchový krém', ' sprch gel'], exclude: ['šampon a', 'pěna do koupele'], headOnly: false } },
  { key: 'sampon', name: 'Šampon', categories: ['Drogerie', 'Děti'], subcategory: null, unit: 'l', rule: { keywords: [' šampon'], exclude: ['suchý', 'pro psy', 'kondicionér a', 'sprchový gel a', 'tablety'], headOnly: false } },
  { key: 'praci-gel', name: 'Prací gel', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' prací gel', ' gel na praní'], exclude: ['odstraňovač', 'aviváž', 'kapsle', 'tablety'], headOnly: false } },
  { key: 'praci-prasek', name: 'Prací prášek', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'kg', rule: { keywords: [' prací prášek', ' prášek na praní'], exclude: ['odstraňovač', 'aviváž', 'kapsle', 'tablety'], headOnly: false } },
  { key: 'avivaz', name: 'Aviváž', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' aviváž'], exclude: ['odstraňovač'], headOnly: false } },
  { key: 'tablety-do-mycky', name: 'Tablety do myčky', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' tablety do myčky', ' tablety do mycky', ' kapsle do myčky', ' tablety myčka'], exclude: ['čistič myčky', 'sůl do myčky', 'leštidlo'], headOnly: false } },
  { key: 'jar', name: 'Prostředek na nádobí', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' na nádobí', ' mytí nádobí', ' jar '], exclude: ['beauty', 'myčk', 'houb', 'kartáč', 'utěrk', 'rukavic', 'stojan', 'odkapávač', 'sada nádobí'], headOnly: false }, requires: ['prostředek', ' jar ', 'gel', 'mycí', ' ml', ' l '] },
  { key: 'pleny', name: 'Pleny', categories: ['Děti', 'Drogerie'], subcategory: 'Pleny', unit: 'ks', rule: { keywords: [' pleny', ' plenky', ' plenkové kalhotky', ' pl ka ', ' pampers', ' huggies'], exclude: ['ubrousk', 'krém', 'taška', 'přebalov', 'kyblík', 'látkov', 'pleny do vody', 'podložk'], headOnly: false } },
  { key: 'sul-do-mycky', name: 'Sůl do myčky', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'kg', rule: { keywords: [' sůl do myčky', ' sul do mycky', ' sůl do myčky '], headOnly: false } },
  { key: 'lestidlo-do-mycky', name: 'Leštidlo do myčky', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' leštidlo do myčky', ' lestidlo do mycky', ' leštidlo myčka'], headOnly: false } },
  { key: 'cistic-wc', name: 'Čistič WC', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' čistič wc', ' cistic wc', ' wc čistič'], headOnly: false } },
  { key: 'cistic-koupelny', name: 'Čistič koupelny', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' čistič koupelny', ' cistic koupelny'], headOnly: false } },
  { key: 'cistic-kuchyne', name: 'Čistič kuchyně', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' čistič kuchyně', ' cistic kuchyne'], headOnly: false } },
  { key: 'univerzalni-cistic', name: 'Univerzální čistič', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' univerzální čistič', ' univerzalni cistic'], headOnly: false } },
  { key: 'cistic-oken', name: 'Čistič oken', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' čistič oken', ' cistic oken'], headOnly: false } },
  { key: 'odstranovac-skvrn', name: 'Odstraňovač skvrn', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' odstraňovač skvrn', ' odstranovac skvrn'], headOnly: false } },
  { key: 'dezinfekce', name: 'Dezinfekce', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' dezinfekce', ' dezinfekční', ' dezinfekcni'], headOnly: false } },
  { key: 'houbicky-na-nadobi', name: 'Houbičky na nádobí', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' houbičky na nádobí', ' houbičky na nadobi', ' houbička na nádobí', ' houby na nádobí'], headOnly: false } },
  { key: 'uterky', name: 'Utěrky', categories: ['Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' utěrky', ' uterky', ' utěrka', ' uterka'], exclude: ['kuchyňsk', 'papírov'], headOnly: false } },
  { key: 'pytle-na-odpadky', name: 'Pytle na odpadky', categories: ['Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' pytle na odpadky', ' pytel na odpadky', ' pytle do koše', ' pytle na odpad', ' odpadkové pytle', ' pytle odpadkové'], headOnly: false } },
  { key: 'alobal', name: 'Alobal', categories: ['Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' alobal'], headOnly: false } },
  { key: 'potravinova-folie', name: 'Potravinová fólie', categories: ['Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' potravinová fólie', ' potravinova folie', ' potravinová fólie'], headOnly: false } },
  { key: 'pecici-papir', name: 'Pečicí papír', categories: ['Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' pečicí papír', ' pecici papir', ' pečící papír'], headOnly: false } },
  { key: 'papir-tasky', name: 'Papírové kapesníky', categories: ['Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' papírové kapesníky', ' papirove kapesniky', ' kapesníky', ' kapesniky'], headOnly: false } },
  { key: 'vlhcene-ubrousky-detske', name: 'Dětské vlhčené ubrousky', categories: ['Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' dětské vlhčené ubrousky', ' detske vlhcene ubrousky'], headOnly: false } },
  { key: 'detsky-sampon', name: 'Dětský šampon', categories: ['Děti'], subcategory: null, unit: 'l', rule: { keywords: [' dětský šampon', ' detsky sampon'], headOnly: false } },
  { key: 'detsky-sprchovy-gel', name: 'Dětský sprchový gel', categories: ['Děti'], subcategory: null, unit: 'l', rule: { keywords: [' dětský sprchový gel', ' detsky sprchovy gel'], headOnly: false } },
  { key: 'detske-mydlo', name: 'Dětské mýdlo', categories: ['Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' dětské mýdlo', ' detske mydlo'], headOnly: false } },
  { key: 'detska-kosmetika', name: 'Dětská kosmetika', categories: ['Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' dětská kosmetika', ' detska kosmetika'], headOnly: false } },
  { key: 'detske-prikrmy', name: 'Dětské příkrmy', categories: ['Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' dětské příkrmy', ' detske prikrmy', ' příkrm', ' prikrm'], headOnly: false } },
  { key: 'detske-kapsicky', name: 'Dětské kapsičky', categories: ['Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' dětské kapsičky', ' detske kapsicky'], headOnly: false } },
  { key: 'detske-napoje', name: 'Dětské nápoje', categories: ['Děti'], subcategory: 'Dětské nápoje', unit: 'l', rule: { keywords: [' dětské nápoje', ' detske napoje', ' minerální voda', ' pramenitá voda', ' neperliv', ' perliv', ' džus', ' šťáva', ' nektar'], exclude: ['mama', 'sirup', 'pro maminky', 'sušen', 'prášek', 'kašička', 'příkrm'], headOnly: false } },
]

export const PRODUCT_TYPE_GROUPS: ProductTypeGroup[] = [
  // Owner, 2026-10-04: the meat itself; offal and soup parts only when an item names them.
  { key: 'kureci-maso', name: 'Kuřecí maso', types: ['kureci-prsa', 'kureci-stehna', 'kureci-kridla', 'kure-cele', 'kureci-mlete'] },
  { key: 'veprove-maso', name: 'Vepřové maso', types: ['veprova-krkovice', 'veprova-pecene', 'veprova-panenka', 'veprova-kyta', 'veprova-plec', 'veprovy-bucek', 'veprova-zebra', 'veprove-mlete', 'veprove-na-gulas'] },
  { key: 'hovezi-maso', name: 'Hovězí maso', types: ['hovezi-svickova', 'hovezi-zadni', 'hovezi-predni', 'hovezi-steak', 'hovezi-mlete', 'hovezi-na-gulas'] },
  { key: 'kruti-maso', name: 'Krůtí maso', types: ['kruti-prsa', 'kruti-stehna', 'kruti-mlete'] },
  { key: 'mlete-maso', name: 'Mleté maso', types: ['kureci-mlete', 'veprove-mlete', 'hovezi-mlete', 'kruti-mlete', 'mlete-smesne'] },
  // Owner, 2026-10-04: everyday cheese; the others only when an item names them.
  { key: 'syr', name: 'Sýr', types: ['eidam', 'gouda', 'mozzarella', 'balkansky-syr'] },
  { key: 'mleko', name: 'Mléko', types: ['mleko-polotucne', 'mleko-plnotucne', 'mleko-bez-laktozy'] },
  { key: 'smetana', name: 'Smetana', types: ['smetana-na-vareni', 'smetana-ke-slehani', 'zakysana-smetana'] },
  { key: 'mouka', name: 'Mouka', types: ['mouka-hladka', 'mouka-polohruba', 'mouka-hruba'] },
  { key: 'cukr', name: 'Cukr', types: ['cukr-krupice', 'cukr-moucka'] },
  { key: 'olej', name: 'Olej', types: ['olej-slunecnicovy', 'olej-repkovy', 'olej-olivovy'] },
  { key: 'voda', name: 'Voda', types: ['voda-neperliva', 'voda-perliva'] },
  { key: 'kava', name: 'Káva', types: ['kava-mleta', 'kava-zrnkova'] },
]

// --- Classification -------------------------------------------------------------------------------

type CompiledType = ProductTypeDefinition & { compiled: KeywordRule; compiledRequires: string[] | null }

const COMPILED: CompiledType[] = PRODUCT_TYPES.map((type) => ({
  ...type,
  compiled: compileKeywordRule({ headOnly: true, ...type.rule }),
  compiledRequires: type.requires ? type.requires.map((word) => compileKeywordRule({ keywords: [word] }).keywords[0]) : null,
}))

/** The types a product named `name` in `category` matches — usually none or one; more than one
 *  means the rules cannot tell, and the product gets none (`classifyProductType`). */
export function matchingProductTypes(category: ItemCategory, name: string): string[] {
  // A retailer's product code in brackets ("BIO Pomeranče (1000764180)") is no text of the name: its
  // digits would otherwise match number-like words such as the "100" of a "100 %" juice exclusion.
  const normalized = normalizeProductText(name.replace(/\(\s*\d{5,}\s*\)/g, ' '))
  const haystack = ` ${normalized} `
  const keys: string[] = []
  for (const type of COMPILED) {
    if (!type.categories.includes(category)) continue
    if (type.compiledRequires && !type.compiledRequires.some((word) => haystack.includes(word))) continue
    if (!matchesKeywordRule(type.compiled, normalized)) continue
    // A name the subcategory rules put in another subcategory is another kind of product.
    if (type.subcategory && category === type.categories[0]) {
      const subcategory = classifySubcategoryByKeyword(category, normalized)
      if (subcategory && subcategory !== type.subcategory) continue
    }
    keys.push(type.key)
  }
  return keys
}

/** The one type a product is, or null when it matches none or more than one (never a guess). */
export function classifyProductType(category: ItemCategory, name: string): string | null {
  const keys = matchingProductTypes(category, name)
  return keys.length === 1 ? keys[0] : null
}

/** The type of a receipt line (phase 4), from its printed text with abbreviations spelled out
 *  ("KUR.PRSA 500G" → kureci-prsa). Same honesty rule: none, or more than one, gives null. A line
 *  without a category is tried in every category and counts only when exactly one type fits. */
export function classifyReceiptLineType(category: ItemCategory | null, name: string): string | null {
  const text = receiptTypeText(name)
  if (category) return classifyProductType(category, text)
  const categories = new Set(PRODUCT_TYPES.flatMap((type) => type.categories))
  const keys = new Set([...categories].flatMap((candidate) => matchingProductTypes(candidate, text)))
  return keys.size === 1 ? [...keys][0] : null
}

/** A receipt line's type and where it came from: its catalog product's own type (`fromProduct`, the
 *  household or an import already settled what it is) or the rules read off the line's text. */
export function resolveReceiptLineType(line: { productTypeKey: string | null; category: ItemCategory | null; name: string }): { key: string; fromProduct: boolean } | null {
  if (line.productTypeKey) return { key: line.productTypeKey, fromProduct: true }
  const key = classifyReceiptLineType(line.category, line.name)
  return key ? { key, fromProduct: false } : null
}

export function productTypeByKey(key: string): ProductTypeDefinition | undefined {
  return PRODUCT_TYPES.find((type) => type.key === key)
}

// --- From a shopping-list item to types (phase 2) ---------------------------------------------------
//
// What a household writes on its list ("Máslo", "Kuřecí maso", "vajíčka 10") is matched against a
// fixed set of phrases per type and group. Only a whole-item match counts — the item's words, without
// sizes, quantities and plain qualifiers, must be one of the phrases in any word order. "Kuřecí maso"
// is the group; "Kuřecí prsa" the type; "kuřecí šunka" is neither, so it stays on the text search, as
// does anything else not listed.

/** Further ways a household writes a type or group, beyond its own name. */
const ITEM_PHRASES: Record<string, string[]> = {
  // Groups
  'kureci-maso': ['kuřecí maso', 'maso kuřecí', 'kuřecí', 'kuřecí maso chlazené'],
  'veprove-maso': ['vepřové maso', 'maso vepřové', 'vepřové'],
  'hovezi-maso': ['hovězí maso', 'maso hovězí', 'hovězí'],
  'kruti-maso': ['krůtí maso', 'maso krůtí', 'krůtí'],
  'mlete-maso': ['mleté maso', 'mleté', 'maso mleté'],
  syr: ['sýr', 'sýry', 'sýr plátky', 'plátkový sýr', 'sýr na chleba'],
  mleko: ['mléko', 'mlíko', 'mléka'],
  smetana: ['smetana'],
  mouka: ['mouka', 'mouku'],
  cukr: ['cukr'],
  olej: ['olej'],
  voda: ['voda', 'minerálka', 'minerálky', 'vody'],
  kava: ['káva', 'kafe', 'kávu'],
  // Types
  maslo: ['máslo', 'másla'],
  'mleko-polotucne': ['polotučné mléko', 'mléko polotučné'],
  'mleko-plnotucne': ['plnotučné mléko', 'mléko plnotučné'],
  'mleko-bez-laktozy': ['mléko bez laktózy', 'bezlaktózové mléko'],
  'smetana-na-vareni': ['smetana na vaření'],
  'smetana-ke-slehani': ['smetana ke šlehání', 'šlehačka', 'smetana na šlehání'],
  'zakysana-smetana': ['zakysaná smetana', 'zakysanka'],
  'jogurt-bily': ['bílý jogurt', 'jogurt bílý', 'jogurt', 'jogurty', 'řecký jogurt'],
  tvaroh: ['tvaroh', 'tvarohy'],
  kefir: ['kefír', 'kefíry'],
  cuketa: ['cuketa', 'cukety'],
  celer: ['celer', 'celer bulva'],
  cocka: ['čočka', 'čočku'],
  med: ['med', 'květový med', 'lesní med', 'akátový med', 'včelí med'],
  ocet: ['ocet', 'jablečný ocet', 'vinný ocet'],
  eidam: ['eidam'],
  gouda: ['gouda'],
  mozzarella: ['mozzarella', 'mozarella'],
  'balkansky-syr': ['balkánský sýr', 'balkán', 'feta'],
  hermelin: ['hermelín', 'camembert'],
  parmazan: ['parmazán', 'parmezán', 'grana padano'],
  'taveny-syr': ['tavený sýr', 'tavené sýry'],
  niva: ['niva'],
  cottage: ['cottage', 'cottage sýr'],
  vejce: ['vejce', 'vajíčka', 'vajíčko'],
  rohlik: ['rohlík', 'rohlíky'],
  chleb: ['chléb', 'chleba', 'chleby'],
  'toustovy-chleb': ['toustový chléb', 'toustový chleba', 'toust', 'tousty'],
  houska: ['houska', 'housky', 'kaiserka', 'kaiserky', 'žemle', 'bulky'],
  bageta: ['bageta', 'bagety'],
  jablka: ['jablka', 'jablko'],
  banany: ['banány', 'banán'],
  pomerance: ['pomeranče', 'pomeranč'],
  mandarinky: ['mandarinky', 'mandarinka', 'klementinky'],
  citrony: ['citrony', 'citron', 'citrón', 'citróny'],
  hrusky: ['hrušky', 'hruška'],
  hrozny: ['hrozny', 'hroznové víno'],
  jahody: ['jahody'],
  boruvky: ['borůvky'],
  maliny: ['maliny'],
  avokado: ['avokádo', 'avokáda'],
  rajcata: ['rajčata', 'rajče', 'cherry rajčata', 'rajčátka'],
  okurky: ['okurka', 'okurky', 'salátová okurka', 'hadovka'],
  paprika: ['paprika', 'papriky'],
  brambory: ['brambory', 'brambor'],
  cibule: ['cibule', 'červená cibule'],
  cesnek: ['česnek'],
  mrkev: ['mrkev'],
  salat: ['salát', 'ledový salát', 'hlávkový salát'],
  zeli: ['zelí', 'bílé zelí', 'červené zelí'],
  zampiony: ['žampiony', 'žampióny'],
  brokolice: ['brokolice'],
  houby: ['houby', 'houba'],
  'kureci-prsa': ['kuřecí prsa', 'kuřecí prsní řízky', 'kuřecí řízky', 'kuřecí prsní řízek', 'kuřecí filety', 'kuřecí prsíčka', 'prsní řízky'],
  'kureci-stehna': ['kuřecí stehna', 'kuřecí stehno', 'kuřecí čtvrtky', 'kuřecí stehenní řízky', 'kuřecí paličky'],
  'kureci-kridla': ['kuřecí křídla', 'kuřecí křidýlka', 'křidýlka'],
  'kure-cele': ['kuře', 'celé kuře', 'kuře celé'],
  'kureci-mlete': ['kuřecí mleté', 'mleté kuřecí', 'mleté kuřecí maso'],
  'kureci-vnitrnosti': ['kuřecí játra', 'kuřecí srdíčka', 'kuřecí žaludky', 'kuřecí vnitřnosti'],
  'kureci-na-polevku': ['kuřecí na polévku', 'kuřecí hřbety', 'kuřecí skelet'],
  'veprova-krkovice': ['vepřová krkovice', 'krkovice', 'krkovička'],
  'veprova-pecene': ['vepřová pečeně', 'vepřové kotlety', 'vepřová kotleta', 'kotlety'],
  'veprova-panenka': ['vepřová panenka', 'panenka', 'vepřová svíčková'],
  'veprova-kyta': ['vepřová kýta', 'vepřové plátky', 'vepřový řízek', 'vepřové řízky'],
  'veprova-plec': ['vepřová plec'],
  'veprovy-bucek': ['bůček', 'vepřový bůček'],
  'veprova-zebra': ['vepřová žebra', 'žebra', 'žebírka'],
  'veprove-mlete': ['vepřové mleté', 'mleté vepřové', 'mleté vepřové maso'],
  'veprove-na-gulas': ['vepřové na guláš', 'vepřové kostky'],
  'hovezi-svickova': ['hovězí svíčková', 'svíčková'],
  'hovezi-zadni': ['hovězí zadní', 'zadní hovězí', 'hovězí roštěná'],
  'hovezi-predni': ['hovězí přední', 'přední hovězí'],
  'hovezi-steak': ['hovězí steak', 'steak', 'steaky'],
  'hovezi-mlete': ['hovězí mleté', 'mleté hovězí', 'mleté hovězí maso'],
  'hovezi-na-gulas': ['hovězí na guláš', 'maso na guláš', 'hovězí kližka', 'kližka'],
  'kruti-prsa': ['krůtí prsa', 'krůtí řízky', 'krůtí prsní řízky'],
  'kruti-stehna': ['krůtí stehna', 'krůtí stehno'],
  'kruti-mlete': ['krůtí mleté', 'mleté krůtí'],
  'mlete-smesne': ['mleté maso mix', 'mleté vepřovo hovězí', 'mleté mix'],
  sunka: ['šunka', 'šunky'],
  parky: ['párky', 'párek', 'párečky', 'vídeňské párky'],
  slanina: ['slanina', 'anglická slanina'],
  losos: ['losos', 'losos filet'],
  'tunak-konzerva': ['tuňák', 'tuňák v konzervě'],
  ryze: ['rýže'],
  testoviny: ['těstoviny', 'špagety', 'spaghetti', 'penne', 'kolínka', 'vřetena', 'fusilli', 'makarony'],
  'mouka-hladka': ['hladká mouka', 'mouka hladká'],
  'mouka-polohruba': ['polohrubá mouka', 'mouka polohrubá'],
  'mouka-hruba': ['hrubá mouka', 'mouka hrubá'],
  'cukr-krupice': ['cukr krupice', 'krupice cukr', 'cukr krystal', 'krystal', 'bílý cukr'],
  'cukr-moucka': ['cukr moučka', 'moučkový cukr'],
  'olej-slunecnicovy': ['slunečnicový olej', 'olej slunečnicový'],
  'olej-repkovy': ['řepkový olej', 'olej řepkový'],
  'olej-olivovy': ['olivový olej', 'olej olivový'],
  sul: ['sůl'],
  drozdi: ['droždí'],
  'kava-mleta': ['mletá káva', 'káva mletá'],
  'kava-zrnkova': ['zrnková káva', 'káva zrnková', 'kávová zrna'],
  'voda-neperliva': ['neperlivá voda', 'voda neperlivá', 'neperlivá'],
  'voda-perliva': ['perlivá voda', 'voda perlivá', 'perlivá'],
  pivo: ['pivo', 'piva', 'pivko'],
  'toaletni-papir': ['toaletní papír', 'toaleťák'],
  'kuchynske-uterky': ['kuchyňské utěrky', 'papírové utěrky', 'kuchyňská role'],
  'zubni-pasta': ['zubní pasta'],
  'sprchovy-gel': ['sprchový gel'],
  sampon: ['šampon', 'šampón'],
  'praci-gel': ['prací gel', 'gel na praní'],
  'praci-prasek': ['prací prášek', 'prášek na praní'],
  avivaz: ['aviváž', 'aviváže'],
  'tablety-do-mycky': ['tablety do myčky', 'kapsle do myčky'],
  jar: ['jar', 'prostředek na nádobí', 'saponát'],
  pleny: ['pleny', 'plenky'],
  'pomazanky': ['pomazánky', 'pomazánka'],
  'mrazena-zelenina': ['mražená zelenina'],
  'cerealie': ['cereálie', 'cereál', 'müsli', 'musli', 'cornflakes'],
  'ovesne-vlocky': ['ovesné vločky'],
  kecup: ['kečup', 'kecup'],
  'horcice': ['hořčice', 'hořčici'],
  'majoneza': ['majonéza', 'majoneza'],
  'dzem': ['džem', 'marmeláda'],
  'kakao': ['kakao'],
  'orechy': ['ořechy', 'ořech'],
  'seminka': ['semínka', 'semínko'],
  'klobasy': ['klobásy', 'klobása'],
  'pastika': ['paštika', 'paštiky'],
  'mrazene-ovoce': ['mražené ovoce'],
  'hranolky': ['hranolky', 'hranolka'],
  'pizza-mrazena': ['mražená pizza'],
  'sul-do-mycky': ['sůl do myčky'],
  'lestidlo-do-mycky': ['leštidlo do myčky'],
  'cistic-wc': ['čistič wc', 'čistič WC'],
  'cistic-koupelny': ['čistič koupelny'],
  'cistic-kuchyne': ['čistič kuchyně'],
  'univerzalni-cistic': ['univerzální čistič'],
  'cistic-oken': ['čistič oken'],
  'odstranovac-skvrn': ['odstraňovač skvrn'],
  'dezinfekce': ['dezinfekce'],
  'houbicky-na-nadobi': ['houbičky na nádobí', 'houbička na nádobí'],
  'uterky': ['utěrky', 'utěrka'],
  'pytle-na-odpadky': ['pytle na odpadky', 'pytel na odpadky'],
  'alobal': ['alobal'],
  'potravinova-folie': ['potravinová fólie'],
  'pecici-papir': ['pečicí papír'],
  'papir-tasky': ['papírové kapesníky', 'kapesníky'],
  'vlhcene-ubrousky-detske': ['dětské vlhčené ubrousky'],
  'detsky-sampon': ['dětský šampon'],
  'detsky-sprchovy-gel': ['dětský sprchový gel'],
  'detske-mydlo': ['dětské mýdlo'],
  'detska-kosmetika': ['dětská kosmetika'],
  'detske-prikrmy': ['dětské příkrmy'],
  'detske-kapsicky': ['dětské kapsičky'],
  'detske-napoje': ['dětské nápoje'],
}

export type ListItemTypes = {
  kind: 'type' | 'group'
  key: string
  name: string
  /** The type keys the item accepts: the one type, or every type of the group. */
  types: string[]
}

/** Words that say nothing about which kind of product an item is: a qualifier or a unit. */
const FILLER = new Set(['bio', 'cerstve', 'cerstva', 'cerstvy', 'chlazene', 'chlazena', 'chlazeny', 'ks', 'kus', 'kusy', 'kg', 'g', 'dkg', 'l', 'ml', 'baleni', 'x'])

/** An item name or phrase reduced to its words, sorted: numbers, sizes and fillers left out. */
function phraseKey(text: string): string {
  return normalizeProductText(text)
    .split(' ')
    .filter((word) => word && !/^\d+$/.test(word) && !/^\d+(g|kg|l|ml|ks|x)$/.test(word) && !FILLER.has(word))
    .sort()
    .join(' ')
}

type PhraseEntry = { phrase: string; value: ListItemTypes }

function phraseEntries(): PhraseEntry[] {
  const entries: PhraseEntry[] = []
  for (const group of PRODUCT_TYPE_GROUPS) {
    const value: ListItemTypes = { kind: 'group', key: group.key, name: group.name, types: group.types }
    for (const phrase of [group.name, ...(ITEM_PHRASES[group.key] ?? [])]) entries.push({ phrase: phraseKey(phrase), value })
  }
  for (const type of PRODUCT_TYPES) {
    const value: ListItemTypes = { kind: 'type', key: type.key, name: type.name, types: [type.key] }
    for (const phrase of [type.name, ...(ITEM_PHRASES[type.key] ?? [])]) entries.push({ phrase: phraseKey(phrase), value })
  }
  return entries.filter((entry) => entry.phrase)
}

// Built once. Two different types or groups never share a phrase (the tests check), so the order of
// insertion does not matter.
const ITEM_PHRASE_INDEX = new Map(phraseEntries().map((entry) => [entry.phrase, entry.value]))

/** The type or group a shopping-list item asks for, or null when its text is not one of the known
 *  phrases (the planner then searches by text, as before). */
export function resolveListItemTypes(name: string): ListItemTypes | null {
  const key = phraseKey(name)
  return key ? ITEM_PHRASE_INDEX.get(key) ?? null : null
}


/** Whether existing stock of one catalog type can satisfy a recipe/list request for another type.
 *  This is deliberately a small domain substitution table, not fuzzy matching: a whole chicken can
 *  supply one requested chicken-breast piece, while unrelated chicken products (e.g. chicken ham)
 *  never satisfy a chicken-meat request. */
export function stockTypeCanSatisfyRequestedType(stockTypeKey: string, requestedTypeKey: string): boolean {
  if (stockTypeKey === requestedTypeKey) return true
  if (stockTypeKey === 'kure-cele' && ['kureci-prsa', 'kureci-stehna', 'kureci-kridla'].includes(requestedTypeKey)) return true
  return false
}

const NON_PLAIN_MEAT_VARIANTS = ['marinov', 'koren', 's pepr', 's soli', 's bylink', 's cesnek', 'grilov', 'uzen']

/** Automatic recipe/list matching must not silently substitute a seasoned or otherwise prepared meat
 * variant for a plain specific meat cut. An explicitly pinned product remains an explicit user choice. */
export function isPlainProductVariantSuitableForRequest(requestName: string, productName: string): boolean {
  const requestType = resolveListItemTypes(requestName)
  if (!requestType || requestType.kind !== 'type') return true
  if (!requestType.key.startsWith('kureci-') && !requestType.key.startsWith('kure-') && !requestType.key.startsWith('vepro') && !requestType.key.startsWith('hovezi') && !requestType.key.startsWith('kruti')) return true
  const requestText = normalizeProductText(requestName)
  if (NON_PLAIN_MEAT_VARIANTS.some((variant) => requestText.includes(variant))) return true
  const productText = normalizeProductText(productName)
  return !NON_PLAIN_MEAT_VARIANTS.some((variant) => productText.includes(variant))
}

/** Every phrase and what it resolves to — for the tests' collision check. */
export function listItemPhraseEntries(): { phrase: string; key: string }[] {
  return phraseEntries().map((entry) => ({ phrase: entry.phrase, key: entry.value.key }))
}

// --- Chosen types on a shopping-list item (phase 3) -----------------------------------------------

/** `keys` as stored: known type keys only, at least one, deduplicated, in the code's order — or
 *  undefined when the input is not that (the server then refuses the change). */
export function validProductTypeKeys(keys: unknown): string[] | undefined {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > PRODUCT_TYPES.length) return undefined
  if (!keys.every((key) => typeof key === 'string' && PRODUCT_TYPES.some((type) => type.key === key))) return undefined
  const chosen = new Set(keys as string[])
  return PRODUCT_TYPES.filter((type) => chosen.has(type.key)).map((type) => type.key)
}

export type ItemTypeChoice = {
  /** The type keys the planner accepts for the item, or null: it searches by text. */
  accepted: string[] | null
  /** Where they come from: the household's own choice, or the item's name. */
  source: 'chosen' | 'name' | null
  /** What the item is shown as: a type or group name, "Kuřecí maso (2 z 5)" for part of a group. */
  label: string | null
  /** The group whose types can be ticked off for this item, if any. */
  group: ProductTypeGroup | null
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((key) => b.includes(key))

/** What a list item asks for: its chosen types when it has them, else what its name resolves to. */
export function describeItemTypes(name: string, productTypes: string[] | null | undefined): ItemTypeChoice {
  const byName = resolveListItemTypes(name)
  const nameGroup = byName?.kind === 'group' ? PRODUCT_TYPE_GROUPS.find((group) => group.key === byName.key) ?? null : null
  if (productTypes && productTypes.length > 0) {
    // The group to tick off in: the name's own group when the choice is part of it, else any group
    // the chosen types all belong to.
    const group =
      (nameGroup && productTypes.every((key) => nameGroup.types.includes(key)) ? nameGroup : null) ??
      PRODUCT_TYPE_GROUPS.find((candidate) => productTypes.every((key) => candidate.types.includes(key)) && productTypes.length > 1) ??
      null
    let label: string
    if (group && sameSet(group.types, productTypes)) label = group.name
    else if (group) label = `${group.name} (${productTypes.length} z ${group.types.length})`
    else label = productTypes.map((key) => productTypeByKey(key)?.name ?? key).join(', ')
    return { accepted: productTypes, source: 'chosen', label, group }
  }
  if (byName) return { accepted: byName.types, source: 'name', label: byName.name, group: nameGroup }
  return { accepted: null, source: null, label: null, group: null }
}

/** What the "Druh zboží" choice lists: the groups first, then the types, each with the keys it sets. */
export function productTypeOptions(): { value: string; label: string; types: string[] }[] {
  return [
    ...PRODUCT_TYPE_GROUPS.map((group) => ({ value: `group:${group.key}`, label: `${group.name} (skupina)`, types: group.types })),
    ...[...PRODUCT_TYPES].sort((a, b) => a.name.localeCompare(b.name, 'cs')).map((type) => ({ value: `type:${type.key}`, label: type.name, types: [type.key] })),
  ]
}

/** Names worth suggesting while typing a new item: every group and type name. */
export function productTypeSuggestionNames(): string[] {
  return [...PRODUCT_TYPE_GROUPS.map((group) => group.name), ...PRODUCT_TYPES.map((type) => type.name)]
}
