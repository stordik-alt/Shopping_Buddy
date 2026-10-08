import { describe, expect, it } from 'vitest'
import { classifyProductType, classifyReceiptLineType, describeItemTypes, isPlainProductVariantSuitableForRequest, listItemPhraseEntries, PRODUCT_TYPE_GROUPS, PRODUCT_TYPES, resolveListItemTypes, resolveReceiptLineType, stockTypeCanSatisfyRequestedType, validProductTypeKeys } from '@/lib/product-types'
import { isValidProductSubcategory } from '@/lib/product-subcategories'
import type { ItemCategory } from '@/lib/types'

// The golden set (docs/12_PRODUCT_TYPES.md section 5): real catalog names (local copy, 2026-10-04)
// with the type they are, or null for "no type" — products made from the thing, flavoured with it,
// cooked, or not telling which kind. Every rule change is measured on it.
const GOLDEN: [string, string | null][] = [
  // Mléčné výrobky
  ['Président Máslo jemné', 'maslo'],
  ['Pilos Máslo 250 g', 'maslo'],
  ['Jihočeské máslo nedělní 77% 250 g', 'maslo'],
  ['MÁSLO 250G', 'maslo'],
  ['Šufan Pistáciové máslo 100%', null],
  // Phase 5 additions
  ['ACTIVIA Kefír Bílý 280g', 'kefir'],
  ['Olma BIO Kefír', 'kefir'],
  ['Kefírové mléko', null],
  ['Srdce domova Kefírové mléko jahodové 450g', null],
  ['Cuketa zelená 1 ks', 'cuketa'],
  ['Marks & Spencer Rajčatová omáčka na těstoviny s cuketou', null],
  ['Celer bulvový 1ks', 'celer'],
  ['Česká Farma Celer řapík', 'celer'],
  ['Vital Celerový salát s jogurtem', null],
  ['Lagris Čočka 500g', 'cocka'],
  ['Čočka Beluga 400 g', 'cocka'],
  ['Čočkýna BIO smažená čočka - česnek', null],
  ['Vitana Poctivá Čočková polévka v pytlíku', null],
  ['Bohemia Chipsy čočkové mořská sůl 65g', null],
  ['Bzenecký ocet kvasný jablečný 5% 0,5L PET', 'ocet'],
  ['Hels Ocet 8% 1l', 'ocet'],
  ['Pringles Sůl a ocet 165g', null],
  ['Alnatura BIO Ocet balsamico krémový', null],
  ['Včelpo Květový med 500 g', 'med'],
  ['Medvědí med perník', null],
  ['Allnature Arašídové máslo jemné', null],
  ['Opavia Club s máslovou příchutí Sušenky Balení 140 g', null],
  ['Madeta Jihočeské trvanlivé mléko polotučné 1,5% 1l', 'mleko-polotucne'],
  ['Olma Čerstvé mléko polotučné 1,5% 1l', 'mleko-polotucne'],
  ['Tatra Swift plnotučné mléko 3,5% 1l', 'mleko-plnotucne'],
  ['Tatra Piknik zahuštené slazené plnotučné mléko', null],
  ['Bohemilk Zahuštěné neslazené plnotučné mléko', null],
  ['Pragolaktos Trvanlivé plnotučné mléko bez laktózy 3,5%', 'mleko-bez-laktozy'],
  ['Alpro Sójový nápoj s čokoládovou příchutí', null],
  ['Kunín Smetana na vaření 12% 200 g', 'smetana-na-vareni'],
  ['Olma Smetana ke šlehání 33% 200 g', 'smetana-ke-slehani'],
  ['Mlékárna Kunín Šlehačka de luxe (40%)', 'smetana-ke-slehani'],
  ['Meggle Zakysaná smetana 14%', 'zakysana-smetana'],
  ['Krajanka Nugátová zakysaná smetana', null],
  ['Krajanka Vaječný likér zakysaná smetana', null],
  ['Olma Klasik bílý jogurt (73707)', 'jogurt-bily'],
  ['Milko Řecký jogurt 0 % bílý', 'jogurt-bily'],
  ['Olma GREEK Řecký jogurt malina', null],
  ['Olma Olomoucký tvaroh polotučný 4%', 'tvaroh'],
  ['Milko Svačinka zeleninový tvaroh paprika', null],
  ['Madeta Jihočeský Eidam 100 g', 'eidam'],
  ['Eidam plátky 40%', 'eidam'],
  ['Pilos Gouda 250 g', 'gouda'],
  ['Apetito Plátky Gouda', 'taveny-syr'],
  ['Italat Mozzarella 100 g', 'mozzarella'],
  ['Srdce domova Balkánský sýr 200g', 'balkansky-syr'],
  ['Dodoni Feta sýr', 'balkansky-syr'],
  ['Sedlčanský Hermelín 100 g (vybrané druhy)', 'hermelin'],
  ['Président Camembert sýr', 'hermelin'],
  ['Ambrosi Grana Padano strouhaný', 'parmazan'],
  ['Veselá Kráva Lahodná 120g', 'taveny-syr'],
  ['Madeta Jihočeská niva 45%', 'niva'],
  ['Madeta Jihočeský Cottage natur', 'cottage'],
  ['Billa Gnocchi s Parmigiano Reggiano 500 g', null],
  ['Snowdonia Cheddar amber mist sýr s whisky', null],
  ['Čerstvá vejce M 30 ks', 'vejce'],
  ['VEJCE Z PODEST. M30', 'vejce'],
  ['Kinder Surprise čokoládové vajíčko s překvapením', null],
  ['Maggi Přidej vejce Formanská polévka', null],
  ['Gastro Menu Salát vajíčkový', null],
  // Pečivo
  ['Rohlík jemný tukový', 'rohlik'],
  ['ROHLÍK43GR', 'rohlik'],
  ['Šunka na rohlík', null],
  ['Klasa Linecké rohlíčky v jogurtové polevě s višňovou náplní', null],
  ['Rohlíkův tradiční bramborový chléb', 'chleb'],
  ['Chléb vícezrnný', 'chleb'],
  ['Babiččina Volba Pšeničná mouka hladká chlebová 1kg', 'mouka-hladka'],
  ['Penam Chléb toustový světlý (661418)', 'toustovy-chleb'],
  ['*ALB TOUST. CHLEB SV', 'toustovy-chleb'],
  ['Eska Houska', 'houska'],
  ['Kaiserka cereální sypaná lněným semínkem', 'houska'],
  ['Bageta francouzská', 'bageta'],
  ['Simply Fresh Bageta s kuřecími nugety a pikantním dresinkem', null],
  ['BILLA Ready Bageta caesar 240g', null],
  // Ovoce a zelenina
  ['Jablka Gala, karton', 'jablka'],
  ['Jablka zelená, taška', 'jablka'],
  ['Granátové jablko', null],
  ['Banány', 'banany'],
  ['ORION Banány želé v čokoládě', null],
  ['Pomeranče 1 kg', 'pomerance'],
  ['Fine Life Pomeranč 100% (810228)', null],
  ['Mandarinky 1 kg', 'mandarinky'],
  ['clever Mandarinky ve sladkém nálevu 312g', null],
  ['Citrony, síť', 'citrony'],
  ['Hrušky Lucasova 1 kg', 'hrusky'],
  ['Hrozny bílé bezsemenné, balení', 'hrozny'],
  ['Česká Farma Jahody 250 g', 'jahody'],
  ['Don Peppe Jahodové knedlíky 600g', null],
  ['BORŮVKY 250G', 'boruvky'],
  ['Maliny 200 g', 'maliny'],
  ['Avokádo Hass "ready to eat", 1 ks', 'avokado'],
  ['Avokádo Kmín celý 30g', null],
  ['Cherry rajčata Sweetele, vanička', 'rajcata'],
  ['Mutti Rajčatový protlak v tubě zahuštěný', null],
  ['Okurka hadovka 1 ks', 'okurky'],
  ['ARO Okurky 6 - 9 cm', null],
  ['BIO Paprika červená, balení', 'paprika'],
  ['Kotányi Paprika lahůdková mletá', null],
  ['Premium Paprikáš 100 g', null],
  ['Brambory konzumní pozdní prané 40+, varný typ B, síť', 'brambory'],
  ['McCain 123 hranolky vlnky 750g', null],
  ['Cibule žlutá, síť', 'cibule'],
  ['Cibule Bistro Butter chicken s jasmínovou rýží 400g', null],
  ['Česnek český XXL, síť', 'cesnek'],
  ['Metro Chef Česnek práškový', null],
  ['Mrkev 1 kg', 'mrkev'],
  ['Ledový salát 1 ks', 'salat'],
  ['Salát á la krab 150g PAPEI', null],
  ['Česká Farma Zelí bílé', 'zeli'],
  ['Tuřanské bílé kysané zelí, sáček', null],
  ['Žampiony bílé, vanička (735922)', 'zampiony'],
  ['Brokolice 1 ks', 'brokolice'],
  ['Čerstvé houby hlíva 250 g', 'houby'],
  ['Sušené houby směs 20 g', null],
  ['Prací gel Ariel 2 l', 'praci-gel'],
  ['Prací prášek Persil 2,5 kg', 'praci-prasek'],
  ['Aviváž Lenor 1,2 l', 'avivaz'],
  ['Kapsle na praní Ariel 20 ks', null],
  ['Mirinda Mango Tangerine', null],
  // Kuřecí maso (owner: every raw part, marinated, minced and offal included; no products)
  ['Kuřecí prsní řízky', 'kureci-prsa'],
  ['Kuř.prsní řízky', 'kureci-prsa'],
  ['Chlazená kuřecí prsa s kostí a s kůží supreme 2 ks v balení', 'kureci-prsa'],
  ['GymBeam Kuřecí prsa ve slunečnicovém oleji', null],
  ['Vodňanské Kuře Kuřecí prsní šunka výběrová (90% masa)', 'sunka'],
  ['Kuřecí šunka prsní', 'sunka'],
  ['Kuřecí stehenní řízky od českého výrobce', 'kureci-stehna'],
  ['VOCÍLKA Kuřecí čtvrtky', 'kureci-stehna'],
  ['Nowaco Kuřecí křídla marinovaná', 'kureci-kridla'],
  ['EXPRES MENU Kuřecí křídla na medu a chilli, 1 porce', null],
  ['Kuře bez drobů', 'kure-cele'],
  ['KUŘE CHLAZENÉ', 'kure-cele'],
  ['Avokádo Kuře gril 34g', null],
  ['VIT.KUŘE PEČEN.BS18G', null],
  ['Kuřecí steak mletý 500 g', 'kureci-mlete'],
  ['Kuřecí játra 500g', 'kureci-vnitrnosti'],
  ['Kuřecí žaludky', 'kureci-vnitrnosti'],
  ['Kuřecí hřbety na polévku', 'kureci-na-polevku'],
  ['Kuřecí nugetky', null],
  ['Vodňanské Kuře Kuřecí párky se sýrem 290g', 'parky'],
  ['Friskies Granule pro kočky s kuřecím 4 kg (vybrané druhy)', null],
  // Vepřové, hovězí, krůtí
  ['Vepřová krkovice bez kosti plátky 375g', 'veprova-krkovice'],
  ['MASO! Vepřová kotleta v celku', 'veprova-pecene'],
  ['BILLA Premium Vepřová panenka', 'veprova-panenka'],
  ['Vepřová svíčková', 'veprova-panenka'],
  ['VOCÍLKA Vepřová kýta bez kosti', 'veprova-kyta'],
  ['Vepřová plec bez kosti 1 kg', 'veprova-plec'],
  ['Vepřová žebra s kostí', 'veprova-zebra'],
  ['Vepřové mleté maso', 'veprove-mlete'],
  ['Jav Mleté vepřové škvarky', null],
  ['Qualivo Vepřové kostky na guláš', 'veprove-na-gulas'],
  ['Simply Fresh Vepřová líčka s kořenovou zeleninou a bramborovou kaší', null],
  ['Hovězí svíčková', 'hovezi-svickova'],
  ['Svíčková na smetaně s hovězím masem a houskovými knedlíky 150 g', null],
  ['Metro Chef Hovězí zadní bez kosti z býka', 'hovezi-zadni'],
  ['Hovězí přední bez kosti – krk', 'hovezi-predni'],
  ['Pirinat BIO Hovězí vysoký roštěnec - rib eye steak', 'hovezi-steak'],
  ['Authentic Hovězí mleté maso 15% tuk', 'hovezi-mlete'],
  ['MASO! Hovězí kližka', 'hovezi-na-gulas'],
  ['Podravka Bujón hovězí kostky', null],
  ['Krůtí prsní řízky 1 kg', 'kruti-prsa'],
  ['Krůtí spodní stehno', 'kruti-stehna'],
  ['Prominent Krůtí mleté maso', 'kruti-mlete'],
  ['Mleté maso mix, 7 % tuku', 'mlete-smesne'],
  ['Chodura Pražská šunka nejvyšší jakosti (96% masa)', 'sunka'],
  ['Párky frankfurtské', 'parky'],
  ['VÁŠ VÝBĚR Anglická slanina 100 g', 'slanina'],
  ['Chio Big Pep smažený pšeničný snack s příchutí uzená slanina 65g', null],
  // Ryby
  ['Norský losos filet s kůží', 'losos'],
  ['Nowaco Treska à la losos filet', null],
  ['Rio Mare Tuňák ve vlastní šťávě 3 x 80g', 'tunak-konzerva'],
  ['Rio Mare Paté Tuňákový krém', null],
  // Trvanlivé
  ['Lagris Jasmínová rýže 500g', 'ryze'],
  ['Dr.Oetker Rýžová kaše jahody a chia bez lepku', null],
  ['Radegast Ryze hořká 12 0,5 l (8594404010328)', 'pivo'],
  ['Barilla Penne Rigate rodinné balení', 'testoviny'],
  ['Maggi Dobrý Hostinec Guláš Těstoviny s omáčkou', null],
  ['Mouka hladká', 'mouka-hladka'],
  ['PROBIO kukuřičná mouka hladká, 450 g', null],
  ['Fine Life Mouka polohrubá', 'mouka-polohruba'],
  ['Zátkova mouka hrubá 1kg', 'mouka-hruba'],
  ['CUKR BÍLÝ KRUP.1KG', 'cukr-krupice'],
  ['Birchsugar Březový Cukr krystal', null],
  ['Cukr moučka 1kg', 'cukr-moucka'],
  ['Slunečnicový olej', 'olej-slunecnicovy'],
  ['SOLMINO SL. OLEJ', 'olej-slunecnicovy'],
  ['Rapso Řepkový olej 750 ml', 'olej-repkovy'],
  ['Borges Original Extra panenský olivový olej 500 ml', 'olej-olivovy'],
  ['ARO Olej olivový z pokrutin', null],
  ['SŮL JEMNÁ KAMEN. 1KG', 'sul'],
  ['Bohemia Vroubky mořská sůl', null],
  ['UNIF.PEK.DROŽDÍ 42G', 'drozdi'],
  ['Jihlavanka Standard original pražená mletá káva 250g', 'kava-mleta'],
  ['illy Classico zrnková pražená káva 250g', 'kava-zrnkova'],
  ['illy Káva mletá, zrnková 250 g', null],
  // Nápoje
  ['Mattoni Neperlivá 1l', 'voda-neperliva'],
  ['Mattoni Jemně perlivá přírodní minerální voda 1,5l', 'voda-perliva'],
  ['Evian Přírodní minerální voda nesycená 500ml', 'voda-neperliva'],
  ['Mattoni Mojito nealko jemně perlivá 0,33l', null],
  ['Budvar 33 Světlý ležák 4×0,5 l', 'pivo'],
  ['Krušovice HOŘKÉ NEALKO nealkoholické pivo 0,5 l', null],
  ['Biopekárna Zemanka Pivovarské krekry sýrové', null],
]

const NON_FOOD: [ItemCategory, string, string | null][] = [
  ['Drogerie', 'Sanft&Sicher toaletní papír 4vrstvý Premium, 10x200, 10 ks', 'toaletni-papir'],
  ['Drogerie', 'Soft&Sicher papírové kapesníky 4vrstvé 30x10 ks, 30 ks', null],
  ['Domácnost', 'TENTO KU FAM 2VR 1R', 'kuchynske-uterky'],
  ['Drogerie', 'meridol zubní pasta Fast Action, 75 ml', 'zubni-pasta'],
  ['Drogerie', 'Balea sprchový gel Soft Roses, 300 ml', 'sprchovy-gel'],
  ['Drogerie', 'Balea med sprchový gel & šampon 2v1 Urea, 300 ml', null],
  ['Drogerie', 'GARNIER FRUCTIS šampon na vlasy Strength & Shine, 1 000 ml', 'sampon'],
  ['Drogerie', 'Persil prací gel Expert Sensitive XXL, 60 PD', 'praci-gel'],
  ['Drogerie', 'Finish Ultimate Plus Tablety do myčky 51 ks', 'tablety-do-mycky'],
  ['Drogerie', 'Jar prostředek na nádobí s vůní citronu, 900 ml', 'jar'],
  ['Děti', 'Pampers Premium Care plenkové kalhotky, velikost 4, 124 ks', 'pleny'],
]

describe('product types — golden set (real catalog names)', () => {
  it.each(GOLDEN)('Potraviny: %s → %s', (name, type) => {
    expect(classifyProductType('Potraviny', name)).toBe(type)
  })

  it.each(NON_FOOD)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

describe('product type definitions', () => {
  it('have unique keys and valid subcategories', () => {
    const keys = PRODUCT_TYPES.map((type) => type.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const type of PRODUCT_TYPES) expect(isValidProductSubcategory(type.categories[0], type.subcategory)).toBe(true)
  })

  it('build groups only from defined types', () => {
    const keys = new Set(PRODUCT_TYPES.map((type) => type.key))
    for (const group of PRODUCT_TYPE_GROUPS) for (const type of group.types) expect(keys.has(type)).toBe(true)
  })


  it('includes the owner-approved expanded manual shopping types', () => {
    const keys = new Set(PRODUCT_TYPES.map((type) => type.key))
    for (const key of [
      'pomazanky', 'mrazena-zelenina', 'cerealie', 'ovesne-vlocky', 'kecup', 'horcice', 'majoneza',
      'dzem', 'kakao', 'orechy', 'seminka', 'klobasy', 'pastika', 'mrazene-ovoce', 'hranolky', 'pizza-mrazena',
      'sul-do-mycky', 'lestidlo-do-mycky', 'cistic-wc', 'cistic-koupelny', 'cistic-kuchyne', 'univerzalni-cistic',
      'cistic-oken', 'odstranovac-skvrn', 'dezinfekce', 'houbicky-na-nadobi', 'uterky', 'pytle-na-odpadky',
      'alobal', 'potravinova-folie', 'pecici-papir', 'papir-tasky', 'vlhcene-ubrousky-detske',
      'detsky-sampon', 'detsky-sprchovy-gel', 'detske-mydlo', 'detska-kosmetika', 'detske-prikrmy',
      'detske-kapsicky', 'detske-napoje',
    ]) expect(keys.has(key)).toBe(true)
  })

  it.each([
    ['Pomazánky', 'pomazanky'],
    ['Mražená zelenina', 'mrazena-zelenina'],
    ['Cereálie', 'cerealie'],
    ['Ovesné vločky', 'ovesne-vlocky'],
    ['Kečup', 'kecup'],
    ['Hořčice', 'horcice'],
    ['Majonéza', 'majoneza'],
    ['Džem', 'dzem'],
    ['Kakao', 'kakao'],
    ['Ořechy', 'orechy'],
    ['Semínka', 'seminka'],
    ['Klobásy', 'klobasy'],
    ['Paštika', 'pastika'],
    ['Mražené ovoce', 'mrazene-ovoce'],
    ['Hranolky', 'hranolky'],
    ['Pizza mražená', 'pizza-mrazena'],
    ['Sůl do myčky', 'sul-do-mycky'],
    ['Leštidlo do myčky', 'lestidlo-do-mycky'],
    ['Čistič WC', 'cistic-wc'],
    ['Čistič koupelny', 'cistic-koupelny'],
    ['Čistič kuchyně', 'cistic-kuchyne'],
    ['Univerzální čistič', 'univerzalni-cistic'],
    ['Čistič oken', 'cistic-oken'],
    ['Odstraňovač skvrn', 'odstranovac-skvrn'],
    ['Dezinfekce', 'dezinfekce'],
    ['Houbičky na nádobí', 'houbicky-na-nadobi'],
    ['Utěrky', 'uterky'],
    ['Pytle na odpadky', 'pytle-na-odpadky'],
    ['Alobal', 'alobal'],
    ['Potravinová fólie', 'potravinova-folie'],
    ['Pečicí papír', 'pecici-papir'],
    ['Papírové kapesníky', 'papir-tasky'],
    ['Dětské vlhčené ubrousky', 'vlhcene-ubrousky-detske'],
    ['Dětský šampon', 'detsky-sampon'],
    ['Dětský sprchový gel', 'detsky-sprchovy-gel'],
    ['Dětské mýdlo', 'detske-mydlo'],
    ['Dětská kosmetika', 'detska-kosmetika'],
    ['Dětské příkrmy', 'detske-prikrmy'],
    ['Dětské kapsičky', 'detske-kapsicky'],
    ['Dětské nápoje', 'detske-napoje'],
  ] as const)('resolves %s → %s', (name, key) => {
    expect(resolveListItemTypes(name)).toMatchObject({ kind: 'type', key })
  })

  it('make "Kuřecí maso" the chicken meat itself — no offal or soup parts (owner decision)', () => {
    const chicken = PRODUCT_TYPE_GROUPS.find((group) => group.key === 'kureci-maso')
    expect(chicken?.types).toEqual(['kureci-prsa', 'kureci-stehna', 'kureci-kridla', 'kure-cele', 'kureci-mlete'])
  })
})

describe('shopping-list items → product types (phase 2)', () => {
  it.each([
    ['Kuřecí maso', 'group', 'kureci-maso'],
    ['kuřecí maso 1 kg', 'group', 'kureci-maso'],
    ['maso kuřecí', 'group', 'kureci-maso'],
    ['Máslo', 'type', 'maslo'],
    ['máslo 250g', 'type', 'maslo'],
    ['vajíčka', 'type', 'vejce'],
    ['Vejce 10 ks', 'type', 'vejce'],
    ['Mléko', 'group', 'mleko'],
    ['mléko polotučné', 'type', 'mleko-polotucne'],
    ['Kuřecí prsa', 'type', 'kureci-prsa'],
    ['kuřecí řízky', 'type', 'kureci-prsa'],
    ['Kuře', 'type', 'kure-cele'],
    ['Vepřové maso', 'group', 'veprove-maso'],
    ['Mleté maso', 'group', 'mlete-maso'],
    ['Sýr', 'group', 'syr'],
    ['BIO jablka', 'type', 'jablka'],
    ['rohlíky', 'type', 'rohlik'],
    ['Toaletní papír', 'type', 'toaletni-papir'],
  ] as const)('%s → %s %s', (name, kind, key) => {
    expect(resolveListItemTypes(name)).toMatchObject({ kind, key })
  })

  it('leaves anything else to the text search', () => {
    for (const name of ['Kuřecí šunka', 'Máslové sušenky', 'Jogurt jahodový', 'Kinder vajíčko', 'Pizza', 'Hermelínky', '']) {
      expect(resolveListItemTypes(name)).toBeNull()
    }
  })

  it('gives every phrase one meaning', () => {
    const meaning = new Map<string, string>()
    for (const { phrase, key } of listItemPhraseEntries()) {
      expect(meaning.get(phrase) ?? key, `"${phrase}" means both ${meaning.get(phrase)} and ${key}`).toBe(key)
      meaning.set(phrase, key)
    }
  })

  it('has groups that accept every one of their types', () => {
    const chicken = resolveListItemTypes('Kuřecí maso')
    expect(chicken?.types).toEqual(PRODUCT_TYPE_GROUPS.find((group) => group.key === 'kureci-maso')!.types)
  })
})

describe('stock and recipe product compatibility', () => {
  it('allows a whole chicken to satisfy one chicken-breast request, but nothing broader by accident', () => {
    expect(stockTypeCanSatisfyRequestedType('kure-cele', 'kureci-prsa')).toBe(true)
    expect(stockTypeCanSatisfyRequestedType('sunka', 'kureci-prsa')).toBe(false)
    expect(stockTypeCanSatisfyRequestedType('kureci-prsa', 'kureci-prsa')).toBe(true)
  })

  it('keeps seasoned chicken out of an automatic plain-breast match', () => {
    expect(isPlainProductVariantSuitableForRequest('Kuřecí prsa', 'Just Meat Kuřecí prsa s pepřem a solí')).toBe(false)
    expect(isPlainProductVariantSuitableForRequest('Kuřecí prsa', 'Kuřecí prsní řízky 500 g')).toBe(true)
    expect(isPlainProductVariantSuitableForRequest('Kuřecí prsa s pepřem', 'Just Meat Kuřecí prsa s pepřem a solí')).toBe(true)
  })
})

describe('chosen types on a list item (phase 3)', () => {
  it('keeps only known keys, in the code order, and refuses anything else', () => {
    expect(validProductTypeKeys(['kureci-stehna', 'kureci-prsa', 'kureci-prsa'])).toEqual(['kureci-prsa', 'kureci-stehna'])
    expect(validProductTypeKeys([])).toBeUndefined()
    expect(validProductTypeKeys(['neexistuje'])).toBeUndefined()
    expect(validProductTypeKeys('maslo')).toBeUndefined()
  })

  it('describes an item by its name, by a whole group, by part of a group, and by a hand-picked type', () => {
    expect(describeItemTypes('Kuřecí maso', null)).toMatchObject({ source: 'name', label: 'Kuřecí maso', group: { key: 'kureci-maso' } })
    expect(describeItemTypes('Kuřecí maso', ['kureci-prsa', 'kureci-stehna'])).toMatchObject({ source: 'chosen', label: 'Kuřecí maso (2 z 5)', accepted: ['kureci-prsa', 'kureci-stehna'] })
    expect(describeItemTypes('Večeře', ['maslo'])).toMatchObject({ source: 'chosen', label: 'Máslo', group: null })
    expect(describeItemTypes('Večeře', null)).toEqual({ accepted: null, source: null, label: null, group: null })
  })
})

describe('receipt lines → product types (phase 4)', () => {
  // [receipt line as printed, category, expected type or null]
  const lines: Array<[string, ItemCategory | null, string | null]> = [
    ['KUR.PRSA 500G', 'Potraviny', 'kureci-prsa'],
    ['KUR.PRSNI RIZKY 0,6KG', 'Potraviny', 'kureci-prsa'],
    ['KURECI STEHNA CHLAZ.', 'Potraviny', 'kureci-stehna'],
    ['KRUT.STEHNA 1KG', 'Potraviny', 'kruti-stehna'],
    ['MLETE VEP.MASO 500G', 'Potraviny', 'veprove-mlete'],
    ['MLETE HOV. 400G', 'Potraviny', 'hovezi-mlete'],
    ['TOUST. CHLEB 250G', 'Potraviny', 'toustovy-chleb'],
    ['MASLO 250G', 'Potraviny', 'maslo'],
    ['MASLO 250G', null, 'maslo'],
    ['ROHLIK43GR', 'Potraviny', 'rohlik'],
    ['SMET.KE SLEH.33% 200ML', 'Potraviny', 'smetana-ke-slehani'],
    ['ZAK.SMETANA 180G', 'Potraviny', 'zakysana-smetana'],
    // Not a type, or not one the rules can name: never a guess.
    ['KURECI SUNKA 100G', 'Potraviny', 'sunka'],
    ['MASLOVE SUSENKY', 'Potraviny', null],
    ['SACEK 1KS', 'Potraviny', null],
  ]
  it.each(lines)('%s (%s) → %s', (name, category, expected) => {
    expect(classifyReceiptLineType(category, name)).toBe(expected)
  })

  it('keeps a type found in the line (not its own) over nothing', () => {
    expect(resolveReceiptLineType({ productTypeKey: 'maslo', category: 'Potraviny', name: 'XYZZY' })).toEqual({ key: 'maslo', fromProduct: true })
    expect(resolveReceiptLineType({ productTypeKey: null, category: 'Potraviny', name: 'MASLO 250G' })).toEqual({ key: 'maslo', fromProduct: false })
    expect(resolveReceiptLineType({ productTypeKey: null, category: 'Potraviny', name: 'XYZZY' })).toBeNull()
  })
})
