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
  { key: 'mleko-polotucne', name: 'Mléko polotučné', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' mléko polotučné', ' polotučné mléko'], ['kefír', 'kondenz', 'zahušt', 'karameliz', 'kokos', 'ovesn', 'sójov', 'mandlov', 'rýžov', 'kozí', 'čokolád', 'kakao', 'sušen', 'bez laktózy']) },
  { key: 'mleko-plnotucne', name: 'Mléko plnotučné', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' mléko plnotučné', ' plnotučné mléko'], ['kefír', 'kondenz', 'zahušt', 'karameliz', 'kokos', 'ovesn', 'sójov', 'mandlov', 'rýžov', 'kozí', 'čokolád', 'kakao', 'sušen', 'bez laktózy']) },
  { key: 'mleko-bez-laktozy', name: 'Mléko bez laktózy', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' mléko '], ['kefír', 'kondenz', 'zahušt', 'karameliz', 'kokos', 'ovesn', 'sójov', 'mandlov', 'rýžov', 'čokolád', 'kakao', 'sušen'], { headOnly: false }), requires: ['bez laktózy', 'laktózy prost'] },
  { key: 'smetana-na-vareni', name: 'Smetana na vaření', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' smetana na vaření', ' smetana 12', ' smetana 10', ' smetana uht 12', ' smetana k vaření'], ['zakysan', 'šlehá', 'pribin']) },
  { key: 'smetana-ke-slehani', name: 'Smetana ke šlehání', categories: [P], subcategory: 'Mléčné výrobky', unit: 'l', rule: food([' smetana ke šlehání', ' šlehačka', ' smetana 31', ' smetana 33', ' smetana 35', ' smetana 36', ' smetana uht 31', ' smetana uht 33', ' sm šleh', ' smet šleh', ' šlehačková smetana'], ['zakysan', 'sprej', 've spreji', 'rostlinn', 'na vaření']) },
  { key: 'zakysana-smetana', name: 'Zakysaná smetana', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' zakysaná smetana', ' smetana zakysaná', ' smet zak', ' zakysaná'], ['vaječný', 'likér', 'dip', 'nugát', 'jahod', 'vanilk', 'ovoc', 'čokol', 'karamel', 'stracciatell']) },
  { key: 'jogurt-bily', name: 'Bílý jogurt', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' bílý jogurt', ' jogurt bílý', ' jogurt natur', ' jogurt přírodní', ' přírodní jogurt', ' řecký jogurt', ' jogurt řecký', ' řecký typ'], ['jahod', 'vanilk', 'ovoc', 'čokolád', 'kokos', 'nápoj', 'pitn', 'rostlinn', 'malin', 'meruňk', 'borůvk', 'med ', 'tvaroh &'], {}, ['jogurt']) },
  { key: 'tvaroh', name: 'Tvaroh', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' tvaroh '], ['tvarohov', 'dezert', 'koláč', 'buchtičk', 'knedlík', 'nanuk', 'ochucen', 'vanilk', 'jahod', 'kakao', 'svačink', ' bar ', 'čoko', 'zeleninov', 'paprik', 'jogurt']) },
  { key: 'eidam', name: 'Eidam', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' eidam'], ['cihla', 'tyčink', 'křupk']) },
  { key: 'gouda', name: 'Gouda', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' gouda', ' goud '], ['violife', 'rostlinn', 'tyčink', 'křupk', 'chrum', 'tavený', 'apetito', ' eru ']) },
  { key: 'mozzarella', name: 'Mozzarella', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' mozzarell'], ['rostlinn', 'tyčink']) },
  { key: 'balkansky-syr', name: 'Balkánský sýr', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' balkánský sýr', ' balkán sýr', ' balkan ', ' balkánský', ' sýr balkánský', ' feta'], ['salát', 'rostlinn']) },
  { key: 'hermelin', name: 'Hermelín a camembert', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' hermelín', ' camembert', ' brie'], ['nakládan', 'v oleji', 'pečen', 'tavený']) },
  { key: 'parmazan', name: 'Parmazán', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' parmazán', ' parmigiano', ' grana padano', ' parmesan'], ['omáčk', 'pesto', 'chips', 'gnocchi']) },
  { key: 'taveny-syr', name: 'Tavený sýr', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' tavený sýr', ' tavený', ' veselá kráva', ' ves kráva', ' ves krava', ' apetito', ' tavený plátkový'], ['křup', 'snack']) },
  { key: 'niva', name: 'Niva', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' niva'], ['pomazánk', 'nivová']) },
  { key: 'cottage', name: 'Cottage', categories: [P], subcategory: 'Mléčné výrobky', unit: 'kg', rule: food([' cottage']) },
  { key: 'vejce', name: 'Vejce', categories: [P], subcategory: 'Vejce', unit: 'ks', rule: food([' vejce', ' vajíčka', ' vajec '], ['čokolád', 'překvapen', 'polévk', 'nudle', 'těstovin', 'salát', 'majonéz', 'pomazánk', 'kinder', 'perník', 'velikonoční dekor', 'barvy na', 'likér', 'koňak']) },

  // --- Pečivo ---------------------------------------------------------------------------------------
  { key: 'rohlik', name: 'Rohlík', categories: [P], subcategory: 'Pečivo', unit: 'ks', rule: food([' rohlík'], ['rohlik cz', 'rohlíkův', 'rohlíkova', 'šunka na rohlík', 'na rohlík', 'linecké', 'vanilkov', 'rohlíček', 'rohlíčk', 'tuňák', 'pizza', 'sýrov', 'chléb', 'chleba']) },
  { key: 'chleb', name: 'Chléb', categories: [P], subcategory: 'Pečivo', unit: 'kg', rule: food([' chléb', ' chleba', ' chleb '], ['toust', 'tous', 'křehk', 'knäcke', 'knacke', 'kváskový chléb mix', 'směs na', 'pečení chleba', 'koření', 'kořen', 'krutony', 'chlebíč', 'bezlepkov', 'mouka', 'mouky']) },
  { key: 'toustovy-chleb', name: 'Toustový chléb', categories: [P], subcategory: 'Pečivo', unit: 'kg', rule: food([' toustový chléb', ' chléb toustový', ' toust chléb', ' toust chleb', ' tous chl', ' toust ']) },
  { key: 'houska', name: 'Houska a kaiserka', categories: [P], subcategory: 'Pečivo', unit: 'ks', rule: food([' houska', ' housky', ' kaiserk', ' bulka', ' žemle'], ['knedlík', 'hamburger', 'burger', 'hot dog', 'čerstvě nakrájeno', 'losos', 'avokád', 'rajče', 'sýr ']) },
  { key: 'bageta', name: 'Bageta', categories: [P], subcategory: 'Pečivo', unit: 'ks', rule: food([' bageta', ' bagety', ' baguette'], ['sýrová bageta', 'šunkov', 'plněn', 'strips', 'nuget', 'dresink', 'camembert', 'bistro', 'kuřecí', ' s ', ' se ', 'caesar', 'caprese', 'trhané', 'vejce', 'delicates', 'ready', 'čerstvě nakrájeno']) },

  // --- Ovoce a zelenina -----------------------------------------------------------------------------
  { key: 'jablka', name: 'Jablka', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['jablka', 'jablko', 'jablk'], ['granátov', 'jablečn']) },
  { key: 'banany', name: 'Banány', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['banány', 'banán', 'banan'], ['plátky', 'chips']) },
  { key: 'pomerance', name: 'Pomeranče', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['pomeranče', 'pomeranč', 'pomeranc'], ['pomeranč 100', 'fine life pomeranč', 'aro pomeranč']) },
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
  { key: 'brokolice', name: 'Brokolice', categories: [P], subcategory: 'Ovoce a zelenina', unit: 'kg', rule: produce(['brokolice'], ['mražen', 'polévk', 'krém']) },

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
  { key: 'sunka', name: 'Šunka', categories: [P], subcategory: 'Maso a uzeniny', unit: 'kg', rule: { keywords: [' šunka', ' šunky', ' sunka'], exclude: ['šunkov', 'pizza', 'rohlík', 'těstovin', 'chléb', 'toust', 'bageta', 'sendvič', 'salát', 'omáčk', 'kráva', 'chips', 'příchu', 'krokety', 'pomazánk', 'tortellini', 'quiche', 'knedl', 'palačin'], headOnly: true } },
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
  { key: 'sul', name: 'Sůl', categories: [P], subcategory: 'Koření a bylinky', unit: 'kg', rule: food([' sůl jemná', ' sůl kamenná', ' jemná sůl', ' kamenná sůl', ' sůl jodidovaná', ' jedlá sůl', ' sůl mořská', ' mořská sůl', ' himálajská sůl', ' sůl '], ['s mořskou', 'se solí', 'chips', 'lupínk', 'křupky', 'tyčinky', 'preclík', 'karamel', 'do myčky', 'koupel', 'pepř', 'směs', 'na brambory', 'vroubk', 'rice', 'cakes', 'chlebíčk']) },
  { key: 'drozdi', name: 'Droždí', categories: [P], subcategory: 'Mouka a pečení', unit: 'kg', rule: food([' droždí', ' drožd'], ['bez droždí', 'pečivo']) },
  { key: 'kava-mleta', name: 'Káva mletá', categories: [P], subcategory: 'Káva a čaj', unit: 'kg', rule: food([' mletá káva', ' káva mletá', ' pražená mletá'], ['kapsl', 'instant', 'rozpustn', 'bonbon', 'čokolád', 'latte', 'cappuccino']) },
  { key: 'kava-zrnkova', name: 'Káva zrnková', categories: [P], subcategory: 'Káva a čaj', unit: 'kg', rule: food([' zrnková káva', ' káva zrnková', ' kávová zrna', ' zrnková', ' pražená zrnková'], ['kapsl', 'instant', 'rozpustn', 'čokolád']) },

  // --- Nápoje ---------------------------------------------------------------------------------------
  { key: 'voda-neperliva', name: 'Voda neperlivá', categories: [P], subcategory: 'Nápoje', unit: 'l', rule: { keywords: [' neperlivá', ' neperlivá voda', ' pramenitá voda', ' kojenecká voda', ' nesycen'], exclude: [' perliv', ' sycen', 'mojito', 'vitamín', 'příchu', 's příchutí', 'sirup', 'limonád', 'jahod', 'malin', 'citron', 'pomeranč', 'broskev', 'jablk', 'hrušk', 'lesní', 'ovocn', 'tělov', 'micelár'], headOnly: false } },
  { key: 'voda-perliva', name: 'Voda perlivá', categories: [P], subcategory: 'Nápoje', unit: 'l', rule: { keywords: [' perlivá', ' jemně perlivá', ' perliva', ' minerální voda'], exclude: ['neperliv', 'nesycen', 'příchu', 's příchutí', 'sirup', 'limonád', 'jahod', 'malin', 'citron', 'pomeranč', 'broskev', 'jablk', 'hrušk', 'lesní', 'ovocn', 'víno', 'sekt', 'mošt', 'mojito', 'rybíz', 'šípek', 'mango', 'vitamín', 'oshee', 'nealko'], headOnly: false } },
  { key: 'pivo', name: 'Pivo', categories: [P], subcategory: 'Alkoholické nápoje', unit: 'l', rule: { keywords: [' pivo', ' ležák', ' výčepní', ' kozel', ' pilsner', ' gambrinus', ' radegast', ' staropramen', ' krušovic', ' budvar', ' svijan', ' bernard', ' plzeň'], exclude: ['nealko', ' 0 0', 'radler', 'pivovarsk', 'sýr', 'krekr', 'chips', 'sklenice', 'korbel', 'pivní'], headOnly: false } },

  // --- Drogerie a domácnost -------------------------------------------------------------------------
  { key: 'toaletni-papir', name: 'Toaletní papír', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' toaletní papír', ' toal papír', ' toaletni papir'], exclude: ['vlhčen', 'držák', 'kuchyň', 'ubrous', 'box', 'kapesník'], headOnly: false } },
  { key: 'kuchynske-uterky', name: 'Kuchyňské utěrky', categories: ['Domácnost', 'Drogerie'], subcategory: null, unit: 'ks', rule: { keywords: [' kuchyňské utěrky', ' kuchyňská role', ' kuchyňské role', ' kuch role', ' papírové utěrky', ' utěrky papírové', ' tento ku'], exclude: ['textil', 'mikrovlák', 'bavln'], headOnly: false } },
  { key: 'zubni-pasta', name: 'Zubní pasta', categories: ['Drogerie', 'Děti'], subcategory: null, unit: 'ks', rule: { keywords: [' zubní pasta', ' zubni pasta', ' zp '], exclude: ['kartáč', 'nit'], headOnly: false } },
  { key: 'sprchovy-gel', name: 'Sprchový gel', categories: ['Drogerie', 'Děti'], subcategory: null, unit: 'l', rule: { keywords: [' sprchový gel', ' sprchový krém', ' sprch gel'], exclude: ['šampon a', 'pěna do koupele'], headOnly: false } },
  { key: 'sampon', name: 'Šampon', categories: ['Drogerie', 'Děti'], subcategory: null, unit: 'l', rule: { keywords: [' šampon'], exclude: ['suchý', 'pro psy', 'kondicionér a', 'sprchový gel a', 'tablety'], headOnly: false } },
  { key: 'praci-prostredek', name: 'Prací prostředek', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' prací gel', ' prací prášek', ' prací kapsle', ' prášek na praní', ' gel na praní', ' prací prostředek', ' prací tablety'], exclude: ['odstraňovač', 'aviváž', 'síťk'], headOnly: false } },
  { key: 'tablety-do-mycky', name: 'Tablety do myčky', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'ks', rule: { keywords: [' tablety do myčky', ' tablety do mycky', ' kapsle do myčky', ' tablety myčka'], exclude: ['čistič myčky', 'sůl do myčky', 'leštidlo'], headOnly: false } },
  { key: 'jar', name: 'Prostředek na nádobí', categories: ['Drogerie', 'Domácnost'], subcategory: null, unit: 'l', rule: { keywords: [' na nádobí', ' mytí nádobí', ' jar '], exclude: ['myčk', 'houb', 'kartáč', 'utěrk', 'rukavic', 'stojan', 'odkapávač', 'sada nádobí'], headOnly: false }, requires: ['prostředek', ' jar ', 'gel', 'mycí', ' ml', ' l '] },
  { key: 'pleny', name: 'Pleny', categories: ['Děti', 'Drogerie'], subcategory: 'Pleny', unit: 'ks', rule: { keywords: [' pleny', ' plenky', ' plenkové kalhotky', ' pl ka ', ' pampers', ' huggies'], exclude: ['ubrousk', 'krém', 'taška', 'přebalov', 'kyblík', 'látkov', 'pleny do vody', 'podložk'], headOnly: false } },
]

export const PRODUCT_TYPE_GROUPS: ProductTypeGroup[] = [
  { key: 'kureci-maso', name: 'Kuřecí maso', types: ['kureci-prsa', 'kureci-stehna', 'kureci-kridla', 'kure-cele', 'kureci-mlete', 'kureci-vnitrnosti', 'kureci-na-polevku'] },
  { key: 'veprove-maso', name: 'Vepřové maso', types: ['veprova-krkovice', 'veprova-pecene', 'veprova-panenka', 'veprova-kyta', 'veprova-plec', 'veprovy-bucek', 'veprova-zebra', 'veprove-mlete', 'veprove-na-gulas'] },
  { key: 'hovezi-maso', name: 'Hovězí maso', types: ['hovezi-svickova', 'hovezi-zadni', 'hovezi-predni', 'hovezi-steak', 'hovezi-mlete', 'hovezi-na-gulas'] },
  { key: 'kruti-maso', name: 'Krůtí maso', types: ['kruti-prsa', 'kruti-stehna', 'kruti-mlete'] },
  { key: 'mlete-maso', name: 'Mleté maso', types: ['kureci-mlete', 'veprove-mlete', 'hovezi-mlete', 'kruti-mlete', 'mlete-smesne'] },
  { key: 'syr', name: 'Sýr', types: ['eidam', 'gouda', 'mozzarella', 'balkansky-syr', 'hermelin', 'parmazan', 'taveny-syr', 'niva', 'cottage'] },
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
  const normalized = normalizeProductText(name)
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

export function productTypeByKey(key: string): ProductTypeDefinition | undefined {
  return PRODUCT_TYPES.find((type) => type.key === key)
}
