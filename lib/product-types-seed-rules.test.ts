import { describe, expect, it } from 'vitest'
import { classifyProductType } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'

// Rules for the seed-proposal types promoted to code (docs/12, 2026-10-seed-v1): caj, vino, lihoviny,
// cokolada-tabulkova, chipsy-snacky, mydlo, deodoranty. The names are written in the style of real
// receipt/catalog names but are NOT yet measured on the production catalog (it was unreachable when
// the rules were written); every miss found there should be added here first.
const CASES: [ItemCategory, string, string | null][] = [
  // Čaj
  ['Potraviny', 'Pickwick Černý čaj Earl Grey 20 sáčků', 'caj'],
  ['Potraviny', 'Teekanne Zelený čaj 20x1,75g', 'caj'],
  ['Potraviny', 'Čaj bylinný heřmánek 30 g', 'caj'],
  ['Potraviny', 'Nestea Ledový čaj broskev 1,5l', 'ledove-caje'],
  ['Potraviny', 'Ledový čaj citron 0,5l', 'ledove-caje'],
  ['Potraviny', 'Mattoni Kombucha zázvor', null],
  ['Potraviny', 'Čajové sušenky máslové 200g', null],
  ['Potraviny', 'Hrnek na čaj', null],
  // Víno
  ['Potraviny', 'Frankovka víno červené suché 0,75l', 'vino'],
  ['Potraviny', 'Bílé víno Müller Thurgau polosuché 0,75 l', 'vino'],
  ['Potraviny', 'Prosecco DOC Extra Dry 0,75l', 'vino'],
  ['Potraviny', 'Svařené víno 1l', null],
  ['Potraviny', 'Víno nealkoholické 0,75l', null],
  ['Potraviny', 'Hroznové víno bílé bezsemenné', null],
  ['Potraviny', 'Vinařství Znovín dárková taška', null],
  ['Potraviny', 'Ocet z vína červený 0,5l', null],
  // Lihoviny
  ['Potraviny', 'Finlandia Vodka 40% 0,7l', 'lihoviny'],
  ['Potraviny', 'Jameson Irish Whiskey 0,7l', 'lihoviny'],
  ['Potraviny', 'Božkov Tuzemský rum 37,5% 0,5l', 'lihoviny'],
  ['Potraviny', 'Rumové aroma 10 ml', null],
  ['Potraviny', 'Becherovka Original 38% 0,5l', 'lihoviny'],
  // Čokoláda tabulková
  ['Potraviny', 'Milka Mléčná čokoláda 100g', 'cokolada-tabulkova'],
  ['Potraviny', 'Orion Hořká čokoláda 70% 80 g', 'cokolada-tabulkova'],
  ['Potraviny', 'Čokoláda s lískovými ořechy 100g', 'cokolada-tabulkova'],
  ['Potraviny', 'Čokoláda na vaření 100g', null],
  ['Potraviny', 'Horká čokoláda instantní 150g', null],
  ['Potraviny', 'Čokoládová pomazánka 400g', null],
  ['Potraviny', 'Čokoládové kapky na pečení', null],
  // Chipsy
  ['Potraviny', 'Bohemia Chips bramborové solené 140g', 'chipsy-snacky'],
  ['Potraviny', 'Chipsy zeleninové z červené řepy 80g', 'chipsy-snacky'],
  ['Potraviny', 'Bohemia Chipsy čočkové mořská sůl 65g', null],
  ['Potraviny', 'Tortilla chips nachos 200g', 'tortilla-chipsy'],
  ['Potraviny', 'Dip na chipsy sýrový 200g', null],
  // Mýdlo
  ['Drogerie', 'Tuhé mýdlo Dove 100g', 'mydlo'],
  ['Drogerie', 'Tekuté mýdlo Palmolive náplň 500ml', 'mydlo'],
  ['Drogerie', 'Žlučové mýdlo na skvrny', null],
  ['Drogerie', 'Mýdlenka plastová', null],
  ['Děti', 'Dětské mýdlo Bambino', 'detske-mydlo'],
  // Deodorant
  ['Drogerie', 'Nivea Men Deodorant sprej 150ml', 'deodoranty'],
  ['Drogerie', 'Rexona Antiperspirant roll-on 50ml', 'deodoranty'],
  ['Drogerie', 'Deo roll-on Dove 50 ml', 'deodoranty'],
  ['Drogerie', 'Deodorant do bot 150ml', null],
  ['Drogerie', 'Osvěžovač WC deo', 'osvezovace'],
]

describe('seed-proposal types promoted to code', () => {
  it.each(CASES)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

// Misses found by the dry run on the production catalog (2026-10-10, `pnpm db:assign-product-types`).
const CATALOG_MISSES: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'Cajthaml Větrníky 3ks', null],
  ['Potraviny', 'Lahůdky Cajthaml Mini zákusky Mix', 'dorty-zakusky'],
  ['Potraviny', 'R38FUZETEA ZEL.CAJ GRAN.JABLKO&ACAI 1.5L', null],
  ['Potraviny', 'Beefeater Gin & Tonic 4,9%', null],
  ['Potraviny', 'MIX Vodka & Wild Berry Cocktail 4% obj.', null],
  ['Potraviny', 'Nutrend Excelent Protein Bar čokoláda kokos', null],
  ['Potraviny', 'Ehrmann High Protein Mousse Čokoláda', null],
  ['Potraviny', 'GymBeam Mini protein cookies arašídové máslo a čokoláda', null],
  ['Potraviny', 'Bombus Rice bar mléčná čokoláda', null],
  ['Potraviny', 'McCain Rustic Chips', null],
  ['Potraviny', 'Šnek Bob Bar jablko, jahoda, kešu, quinoa chips', null],
  ['Potraviny', 'An Mořské řasy NORI CHIPSY Original', null],
  ['Potraviny', 'Nutrend Protein Chips, sea salt', null],
  ['Potraviny', 'Milka Bubbly Coconut mléčná čokoláda z alpského mléka s porézní kokosovou náplní 97 g', 'cokolada-tabulkova'],
  ['Potraviny', 'Lindt Mléčná čokoláda s kousky karamelu a špetkou mořské soli 100g', 'cokolada-tabulkova'],
  ['Potraviny', 'Teekanne bio čaj Oriental Chai, 36 g', 'caj'],
  ['Potraviny', 'Slivovice r. jelínek 45 % alk. 0,5 l', 'lihoviny'],
]

describe('misses found on the real catalog', () => {
  it.each(CATALOG_MISSES)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

const CATALOG_MISSES_2: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'UNI CORNETTO COKOLADA 120ML NEW', null],
  ['Potraviny', 'AL X KIT KAT KORNOUT COKOLADA 110ML', null],
  ['Potraviny', 'X_CORNY ZERO MLECNA COKOLADA 20G', null],
  ['Drogerie', 'ebelin držák na mýdlo, 1 ks', null],
  ['Drogerie', 'ebelin sáček na mýdlo, 1 ks', null],
  ['Drogerie', 'trend !t up mýdlo na obočí 24h Brow Control, 8 ml', 'dekorativni-kosmetika'],
  ['Drogerie', 'Balea deo ubrousky Sensitive s aloe vera, 10 ks', null],
  ['Drogerie', 'nike deo natural sprej Ultra Blue, 75 ml', 'deodoranty'],
  ['Drogerie', 'Jelen Jádrové Mýdlo 200 g', 'mydlo'],
]

describe('more misses found on the real catalog', () => {
  it.each(CATALOG_MISSES_2)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

describe('collisions found on the real catalog', () => {
  it('keeps a brewery named "Vinohradský" a beer, not wine', () => {
    expect(classifyProductType('Potraviny', 'Vinohradský pivovar Jantarová 13 plech')).toBe('pivo')
  })
  it('keeps stain soap out of soap', () => {
    expect(classifyProductType('Drogerie', 'Tekuté mýdlo na skvrny')).toBeNull()
  })
  it('still finds wine', () => {
    expect(classifyProductType('Potraviny', 'Frankovka víno červené suché 0,75l')).toBe('vino')
  })
})

// Batches 2–7 (docs/12): names from the production catalog dry run, positives and the misses it found.
const BATCH_2_7: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'Coca-Cola 4 x 330ml', 'limonady'],
  ['Potraviny', 'Monster Energy Ultra Rosá', 'limonady'],
  ['Potraviny', 'Thomas Henry Botanical tonic', 'limonady'],
  ['Potraviny', 'Ondrášovka Tonic ochucená minerální voda 6x1,5l', 'voda-ochucena'],
  ['Potraviny', 'Relax Džus 100% pomeranč 1l', 'dzusy'],
  ['Potraviny', 'Skittles Smoothies 38g', null],
  ['Potraviny', 'Relax Sirup příchuť jablko mango 700ml', 'sirupy'],
  ['Potraviny', 'Javorový sirup 250 ml', null],
  ['Potraviny', 'Olma Florian Smetanový jogurt borůvka 150g', 'jogurt-ochuceny'],
  ['Potraviny', 'Bílý jogurt natur 150g', 'jogurt-bily'],
  ['Potraviny', 'Hollandia BIO BiFi Jogurtový drink jahoda s mátou', 'jogurt-pitny'],
  ['Potraviny', 'Miil Skyr natur', 'skyr'],
  ['Potraviny', 'Opavia Piškoty Tradiční Piškoty Rodinné balení 220 g', 'susenky-oplatky'],
  ['Potraviny', 'Sedita Club máslové sušenky', 'susenky-oplatky'],
  ['Potraviny', 'Tyčinka Corny Big', 'tycinky-sladke'],
  ['Potraviny', 'Cyrilovy Pekařské tyčinky', null],
  ['Potraviny', 'Chupa Chups Lízátko s překvapením', 'bonbony-zvykaci'],
  ['Potraviny', 'Häagen-Dazs Vanilková zmrzlina smetanová 460ml', 'zmrzliny'],
  ['Potraviny', 'Hellmann\'s Tatarská omáčka 100ml', 'omacky-hotove'],
  ['Potraviny', 'Alpro Ovesný nápoj This is Not M*lk 3,5 %', 'nahrazky-mleka-rostlinne'],
  ['Potraviny', 'Kotányi Kari 27g', 'koreni'],
  ['Potraviny', 'FREEE BIO Skořicové kroužky, bez lepku', null],
  ['Potraviny', 'Rio Cold Press Kurkuma shot', null],
  ['Potraviny', 'Kmotr Selský salám', 'salam'],
  ['Potraviny', 'Dr. Oetker Ristorante Pepperoni Salame', null],
  ['Potraviny', 'BILLA Krevety 225g', 'morske-plody'],
  ['Potraviny', 'KRO Mandlový croissant', 'pecivo-sladke'],
  ['Potraviny', 'Pekařství Makovec Velatický chléb', 'chleb'],
  ['Potraviny', 'Pekařství Makovec Sádlový rohlík', 'rohlik'],
  ['Drogerie', 'Kotex tampony Normal, 16 ks', 'damska-hygiena'],
  ['Drogerie', 'ebelin odlakovací tampony, 30 ks', 'pece-o-nehty'],
  ['Drogerie', 'Dontodent zubní kartáček Classic střední, 4 ks', 'ustni-hygiena'],
  ['Drogerie', 'ebelin pouzdro na zubní kartáček, 1 ks', null],
  ['Drogerie', 'Penny Víceúčelové vlhčené ubrousky 80 ks', 'vlhcene-ubrousky'],
  ['Drogerie', 'NIVEA MEN pěna na holení Hydrocare, 200 ml', 'holeni'],
  ['Drogerie', 'alverde NATURKOSMETIK řasenka Volumen, 10 ml', 'dekorativni-kosmetika'],
  ['Drogerie', 'Balea Aqua pleťové sérum, 30 ml', 'pece-o-plet'],
]

describe('batches 2–7', () => {
  it.each(BATCH_2_7)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

// Older types whose rules let false positives through; found reviewing the dry run before the first apply.
const OLDER_TYPES: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'Kotányi Muškátový ořech celý', null],
  ['Potraviny', 'Ořechový sýr', null],
  ['Potraviny', 'Farma Těšany Těšanský sýr ořechový', null],
  ['Potraviny', 'Pekárna Kabát Ořechový chléb', 'chleb'],
  ['Potraviny', 'Koláčkova pekárna BIO Ořechový chléb střední', 'chleb'],
  ['Potraviny', 'Hovězí ořech', 'hovezi-zadni'],
  ['Potraviny', 'Pršutérie Chovaneček Hovězí ořech', 'hovezi-zadni'],
  ['Potraviny', 'Président Brie ořechový', 'hermelin'],
  ['Potraviny', 'VÁŠ VÝBĚR Pekanové ořechy 200 g', 'orechy'],
  ['Potraviny', 'dmBio bio lískové ořechy, 200 g', 'orechy'],
  ['Potraviny', 'Nutella Pomazánka s lískovými ořechy a kakaem 1000g', null],
  ['Potraviny', 'Helios Pomazánka jahodová', null],
  ['Potraviny', 'Gurmán Klub Topinková pomazánka', 'pomazanky'],
  ['Potraviny', 'Nowaco Pomazánka à la krab', 'pomazanky'],
  ['Potraviny', 'Bonavita Mini topinky hořčice', null],
  ['Potraviny', 'Hellmann\'s Dressing med/hořčice', null],
  ['Potraviny', 'Haas Hořčice plnotučná', 'horcice'],
  ['Potraviny', 'Pribináček Kakao', null],
  ['Potraviny', 'Nesquik instantní kakao', 'kakao'],
  ['Potraviny', 'Odkolek Slovanské semínko krájený', null],
  ['Potraviny', 'clever Sezamová semínka 70g', 'seminka'],
  ['Potraviny', 'Knorr těstoviny Tomato Mozzarella 72g', null],
]

describe('older types, false positives from the dry run', () => {
  it.each(OLDER_TYPES)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

describe('kitchen towels vs cleaning cloths', () => {
  it('keeps "kuchyňské utěrky" in its own type in both categories', () => {
    expect(classifyProductType('Domácnost', 'Profissimo kuchyňské utěrky 2 v 1, 5 ks')).toBe('kuchynske-uterky')
    expect(classifyProductType('Domácnost', 'Spontex houbové utěrky Natura, 3 ks')).toBe('uterky')
  })
})

describe('owner decisions 2026-10-10', () => {
  it('treats HiPP Baby water as a children\'s drink, not as plain water', () => {
    expect(classifyProductType('Děti', 'HiPP Baby přírodní minerální voda neperlivá 6x1l')).toBe('detske-napoje')
    expect(classifyProductType('Děti', 'HiPP Baby přírodní minerální voda neperlivá multipack (6×1 l)')).toBe('detske-napoje')
    expect(classifyProductType('Děti', 'YESs Meloun neperlivá')).toBe('detske-napoje')
    expect(classifyProductType('Děti', 'HiPP Mama čaj pro kojící maminky')).toBeNull()
  })
  it('finds oranges also when the name carries a product code', () => {
    expect(classifyProductType('Potraviny', 'BIO Pomeranče (1000764180)')).toBe('pomerance')
    expect(classifyProductType('Potraviny', 'Pomeranče 1kg')).toBe('pomerance')
    expect(classifyProductType('Potraviny', 'Relax Džus 100% pomeranč 1l')).toBe('dzusy')
  })
})

// Second review round of the dry-run samples (2026-10-10).
const ROUND_2: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'Bliss mandarinka a zázvor, perlivá voda s kapkou vína 4,5% obj.', null],
  ['Potraviny', 'Maison Castel Bordeaux Merlot červené suché víno 0,75l', 'vino'],
  ['Potraviny', 'Topping Čokoláda', null],
  ['Potraviny', 'Marks & Spencer Kousky hořké čokolády', null],
  ['Potraviny', 'Lindt Excellence Čokoláda hořká 78%', 'cokolada-tabulkova'],
  ['Potraviny', 'Metro Chef Pomeranče džusové, síť', null],
  ['Potraviny', 'Sambazon BIO Acai Pure neslazená dřeň na smoothie', null],
  ['Potraviny', 'Polárka Smoothie mango 44g', null],
  ['Potraviny', 'Deva Smoothie banán, mango, pomeranč, jablko sklo', 'dzusy'],
  ['Potraviny', 'Jogurtová zmrzka, malina 470 ml', null],
  ['Potraviny', '4Slim Čekankový sirup Originál 350 g', null],
  ['Potraviny', 'Marks & Spencer Slané pšeničné sušenky', null],
  ['Potraviny', 'GRILL Party Grilovací tyčinky se sýrem 340g', null],
  ['Potraviny', 'Vimeal Krevetové závitky', null],
  ['Potraviny', 'Oceans Sushi set 3 (losos sashimi plátky, tuňák sashimi plátky, krevety ebi)', null],
  ['Potraviny', 'FJORU ASC Krevety celé nevařené 30/40', 'morske-plody'],
  ['Drogerie', 'ebelin odličovací tampony, 140 ks', 'odlicovaci-pripravky'],
  ['Drogerie', 'Ria tampony Normal, 16 ks', 'damska-hygiena'],
]

describe('second review round', () => {
  it.each(ROUND_2)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

// Third review round (2026-10-10): prefixes of brands and words that only look like the type.
const ROUND_3: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'Fantasia Čokovločky 102g', null],
  ['Potraviny', 'FANTA STRAWBERRY KIWI ZERO 1.75L', 'limonady'],
  ['Potraviny', 'Monster Energy Ultra Zero Sugar plech', 'limonady'],
  ['Domácnost', 'Monstera Ø květináče 12 cm', null],
  ['Potraviny', 'Orient Gourmet Červená kari pasta', null],
  ['Potraviny', 'Tymián citrónový čerstvý', null],
  ['Potraviny', 'Kotányi Pepř bílý mletý 20g', 'koreni'],
  ['Potraviny', 'Warburtons Toastové muffiny, 4 ks', null],
  ['Potraviny', 'Balconi Muffin s borůvkovou náplní 6x43 g', 'pecivo-sladke'],
  ['Potraviny', 'Sanium stick Tyčinkové hnojivo proti mšicím a molicím', null],
  ['Potraviny', 'Grissin Bon Grissini Torinesi tyčinky', 'slane-tycinky-preclik'],
  ['Potraviny', 'dmBio bio tyčinky se seitanem, 130 g', null],
  ['Potraviny', 'Dubajská pomazánka 300g', null],
  ['Potraviny', 'Pan Křupka Kukuřičné křupky banán a čokoláda', 'krupky-snacky'],
  ['Potraviny', 'Ritter Sport Mléčná čokoláda 100g', 'cokolada-tabulkova'],
  ['Potraviny', 'Emco Flapjack pekanový ořech', null],
  ['Potraviny', 'Benlian Rice cakes - lněné semínko a slunečnice', null],
  ['Potraviny', 'Emco Super srdíčka kakao 140g', null],
  ['Potraviny', 'Sedita Mini club kakao-malina', null],
  ['Potraviny', 'Dr.Oetker Přírodní kakao', 'kakao'],
]

describe('third review round', () => {
  it.each(ROUND_3)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

// Batches 8–15 (2026-10-10): positives and the false positives found while reviewing dry-run samples.
const BATCH_8_15: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'Captain Kombucha BIO Original', 'kombucha'],
  ['Potraviny', 'Pfanner 100% BIO zeleninový nápoj z červené řepy mléčně kvašený', null],
  ['Potraviny', 'Birell Stylu IPA nealkoholické pivo 0,5l', 'nealko-pivo'],
  ['Potraviny', 'Lipton Ledový čaj zelený 1,5l', 'ledove-caje'],
  ['Potraviny', 'Mattoni s příchutí citronu 6x0,75l', 'voda-ochucena'],
  ['Potraviny', 'Korunní Limeta a Máta jemně perlivá 6x1,5l', 'voda-ochucena'],
  ['Potraviny', 'Müllermilch Mléčný nápoj s banánem', 'mlecne-napoje'],
  ['Potraviny', 'Paw Patrol instantní kakaový nápoj', null],
  ['Potraviny', 'Actimel Probiotický nápoj jahoda 4×100 g', 'kysane-napoje'],
  ['Potraviny', 'Mlékárna ValMez Acidofilní mléko plnotučné', 'kysane-napoje'],
  ['Potraviny', 'Jägermeister Orange 0,7 l', 'likery'],
  ['Potraviny', 'Božkov Vaječný Pistácie 15% 0,5l', 'likery'],
  ['Potraviny', 'Božkov Originál 0,5 l', 'lihoviny'],
  ['Potraviny', 'Strongbow Gold Apple, plech multipack 4x440ml', 'cidery'],
  ['Potraviny', 'Lučina Svěží žervé s pažitkou', 'cerstvy-syr'],
  ['Potraviny', 'Madeta Madetka tavený smetanový sýr 2 ks 100g', 'taveny-syr'],
  ['Potraviny', 'Président Emmental bloček', 'syr-tvrdy'],
  ['Potraviny', 'mixit křupavý sýr Irský cheddar & cibule, 20 g', null],
  ['Potraviny', 'Zott Monte dezert 4×55 g', 'mlecne-dezerty'],
  ['Potraviny', 'Dr. Oetker Puding příchuť Vanilka 38g', null],
  ['Potraviny', 'Bon Lait Kozí mléko čerstvé (3,4%)', 'mleko-kozi-ovci'],
  ['Potraviny', 'Leonidas Bonboniéra Zanzibar 16 ks', 'bonboniery'],
  ['Potraviny', 'Lahůdky Cajthaml Dort Sacher', 'dorty-zakusky'],
  ['Potraviny', 'Häagen Dazs Red Velvet Cheesecake 420ml', null],
  ['Potraviny', 'Kachní prsa bez kosti s kůží 2x200g', 'kachna'],
  ['Potraviny', 'Vodňanská kachna Kachní párečky', 'parky'],
  ['Potraviny', 'Jim Jerky Hovězí chilli Sriracha', 'susene-maso'],
  ['Potraviny', 'Alnatura BIO Zeleninový bujón v kostce', 'vyvary-bujony'],
  ['Potraviny', 'Skutečně masová tlačenka 400g', 'tlacenky-jitrnice'],
  ['Potraviny', 'Bohemia Arašídy solené', 'arasidy'],
  ['Potraviny', 'Sedita Lina Arašídová mléčná', null],
  ['Potraviny', 'Nestlé Corn Flakes Med a arašídy', 'cerealie'],
  ['Potraviny', 'Chio Micro popcorn s máslovou příchutí 80g', 'popcorn'],
  ['Potraviny', 'Tuc Krekry s příchutí sýru 100g', 'krekry'],
  ['Potraviny', 'Schär Salinis preclíky bez lepku 60g', 'slane-tycinky-preclik'],
  ['Potraviny', 'Santa Maria Tortilla chips BBQ', 'tortilla-chipsy'],
  ['Potraviny', 'Biosaurus BIO sýrové křupky', 'krupky-snacky'],
  ['Potraviny', 'Nutella B-ready Křupavá oplatka plněná lískooříškovou pomazánkou s kakaem a křupkami', null],
  ['Potraviny', 'Vitana Čočková polévka', 'polevky'],
  ['Potraviny', 'Dr. Oetker Ristorante Pizza Diavola 350g', 'pizza-hotova'],
  ['Potraviny', 'Ristorante Prosciutto Duopack 660 g', null],
  ['Potraviny', 'Authentic Bramborový salát', 'salaty-hotove'],
  ['Potraviny', 'Salát Lollo Rosso 1 ks', 'salat'],
  ['Potraviny', 'Salát Mesclun nepraný', null],
  ['Potraviny', 'BILLA Ready Sendvič s vaječnou omeletou, slaninou a sýrem cheddar 120g', 'sendvice-wrapy'],
  ['Potraviny', 'Český toust Super sendvič, světlý', null],
  ['Potraviny', 'Beavia Kimchi klasik pálivé 350g', 'kvasena-zelenina'],
  ['Potraviny', 'YumYum instantní nudlová polévka s krevetovou příchutí', 'instantni-nudle'],
  ['Potraviny', 'Kiwi, vanička', 'ovoce-exoticke'],
  ['Potraviny', 'Mirinda Mango Tangerine', 'limonady'],
  ['Potraviny', 'Dýně hokaido 1 kg', 'dyne'],
  ['Potraviny', 'Špenát baby 130g', 'spenat'],
  ['Potraviny', 'Řepa červená 1 kg', 'cervena-repa'],
  ['Potraviny', 'BIO Květák 1 ks', 'kvetak'],
  ['Potraviny', 'Panzani Gnocchi bramborové', 'knedliky'],
  ['Potraviny', 'Sláma Listové těsto', 'testo'],
  ['Potraviny', 'Váleček na těsto', null],
  ['Potraviny', 'dmBio směs na pečení čokoládového koláče, 380 g', 'smesi-na-peceni'],
  ['Drogerie', 'GARNIER Color naturals barva na vlasy 1 ultra černá, 1 ks', 'barvy-na-vlasy'],
  ['Drogerie', 'syoss kondicionér na vlasy Intense Keratin, 440 ml', 'vlasova-pece'],
  ['Drogerie', 'syoss lak na vlasy Keratin, 300 ml', 'styling-vlasy'],
  ['Drogerie', 'COREGA fixační krém Power Max, 40 g', null],
  ['Drogerie', 'Dove tělové mléko 4v1, 100 ml', 'telova-pece'],
  ['Drogerie', 'Balea krém na ruce Spirit Glow, 100 ml', 'krem-na-ruce'],
  ['Drogerie', 'Labello balzám na rty Pearly Shine, 4,8 g', 'balzam-na-rty'],
  ['Drogerie', 'NYX PROFESSIONAL MAKEUP balzám na rty Fat Matte 09 Mauve Cloud, 2 g', 'balzam-na-rty'],
  ['Drogerie', 'SUNDANCE mléko na opalování SPF30, 200 ml', 'opalovaci-pripravky'],
  ['Drogerie', 'GARNIER micelární voda Salicylic, 400 ml', 'odlicovaci-pripravky'],
  ['Drogerie', 'Guess dámská EdT 1981, 50 ml', 'parfemy'],
  ['Drogerie', 'ebelin lešticí pilník na nehty, různé druhy', 'pece-o-nehty'],
  ['Drogerie', 'durex kondomy Classic, 12 ks', 'kondomy'],
  ['Drogerie', 'Bellinda punčochové kalhoty 3 Actions, velikost L, černá, 1 ks', 'puncochy'],
  ['Drogerie', 'Bellinda dámské ponožky Fine, 39-42 černé, 1 ks', 'ponozky'],
  ['Drogerie', 'Lirene exfoliační maska v ponožkách, 1 ks', null],
  ['Drogerie', 'Visiomax dioptrické brýle na čtení +2,50 Dp.', 'bryle'],
  ['Drogerie', 'Visiomax kontaktní čočky denní -0,75 DP, 8 ks', 'kontaktni-cocky'],
  ['Drogerie', 'Doppelherz kapsle Omega-3 1400, 30 ks', 'vitaminy-doplnky'],
  ['Drogerie', 'Persil prací kapsle Universal 4v1 Deep Clean, 28 PD', 'praci-kapsle'],
  ['Drogerie', 'Bref WC blok Power Active Pine, 6 ks', 'wc-bloky'],
  ['Domácnost', 'Profissimo rukavice do domácnosti, neoprenové, velikost M, 1 ks', 'rukavice-uklid'],
  ['Domácnost', 'Profissimo rukavice zahradní, střední velikost, 1 pár', null],
  ['Drogerie', 'glade ONE osvěžovač vzduchu Pure Clean Linen, 10 ml', 'osvezovace'],
  ['Děti', 'mam dudlík Perfect Night 0+m, modrá/zelená, 2 ks', 'dudliky'],
  ['Děti', 'Canpol babies silikonový box na dudlík béžový, 1 ks', null],
  ['Děti', 'Canpol babies lahev Junior růžová, 400 ml', 'detske-lahve'],
  ['Děti', 'HiPP BIO mléčná kaše ovesná - jablečná, 250 g', 'detske-kase'],
  ['Děti', 'Sunar Ovocná kašička Jahoda, banán a oves, 120 g', null],
  ['Děti', 'BEBA pokračovací mléčná kojenecká výživa 4 OPTIpro 18m, 500 g', 'kojenecke-mleko'],
  ['Děti', 'babylove bio příkrm jablko, banán & višeň, 100 g', 'detske-prikrmy'],
]

describe('batches 8–15', () => {
  it.each(BATCH_8_15)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})

describe('extended rules of existing types', () => {
  it('knows wines by grape and style', () => {
    for (const name of ['Habánské Sklepy Cabernet Sauvignon pozdní sběr', 'Sovín Veltlínské zelené 0,75l', 'Moët & Chandon Impérial Brut', 'Cielo Merlot']) {
      expect(classifyProductType('Potraviny', name), name).toBe('vino')
    }
  })
  it('knows chips by brand and prosciutto without taking a pizza brand', () => {
    expect(classifyProductType('Potraviny', 'Pringles Original')).toBe('chipsy-snacky')
    expect(classifyProductType('Potraviny', 'Pršutérie Pršut panenka')).toBe('sunka')
    expect(classifyProductType('Potraviny', 'Písecký pršut 100g')).toBe('sunka')
  })
})

// Second review round of batches 8–15.
const BATCH_8_15_ROUND_2: [ItemCategory, string, string | null][] = [
  ['Potraviny', 'RANA Tortelloni Ricotta špenát 400g', null],
  ['Potraviny', 'ALNATURA BIO Pesto ricotta', null],
  ['Potraviny', 'Prima Polárkový dort Čokoláda', null],
  ['Potraviny', 'Petráčkovy Hořické trubičky Napoleonka vaječný likér 15x60g', null],
  ['Potraviny', 'Celihope Polomáčená oplatka arašídová 35g bez lepku', null],
  ['Potraviny', 'ORION Nugeta arašídová 340g', null],
  ['Potraviny', 'Chinatown Sezamové koule, arašídy', null],
  ['Potraviny', 'Lindt Lindor čokoláda tabulková bílá', null],
  ['Potraviny', 'Mon Chéri 5 ks 52,5g', 'bonboniery'],
]

describe('batches 8–15, second round', () => {
  it.each(BATCH_8_15_ROUND_2)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})
