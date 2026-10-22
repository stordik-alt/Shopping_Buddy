// The one central mapping from a product to its visual (docs/08_ICON_SYSTEM.md, "Vizuály produktů").
//
// The household's stock is a picture of the pantry, not a list of names, so every product needs a
// visual that says what it is. The rules the brief set, and how this file keeps them:
//
//  1. A product type is drawn as *that* product (tomatoes look like tomatoes, water looks like a
//     bottle, pasta looks like pasta) — never one generic icon for everything.
//  2. A visual is never chosen by brand. It comes from the product's type (the stable key in
//     lib/product-types.ts), then its subcategory, then its category.
//  3. No SKU is mapped by hand: the whole taxonomy (every product type) is covered by the table
//     below, and lib/product-visuals.test.ts fails when a new type arrives without a visual.
//
// A representative photograph stored for a product type wins over the illustration when one
// exists. The pantry query supplies that type's R2 image reference; the illustration remains the
// fallback for types whose image has not been populated.

import type { ItemCategory } from '@/lib/types'

/** The closed set of illustration shapes. Each one is drawn by components/ui/product-visual.tsx. */
export type ProductVisualShape =
  | 'round'
  | 'oval'
  | 'pear'
  | 'tomato'
  | 'pumpkin'
  | 'pepper'
  | 'corn-cob'
  | 'cluster'
  | 'cherry'
  | 'cabbage'
  | 'leaf'
  | 'sprig'
  | 'long'
  | 'bulb'
  | 'garlic'
  | 'celeriac'
  | 'radish'
  | 'mushroom'
  | 'blob'
  | 'cone'
  | 'crescent'
  | 'bottle'
  | 'can'
  | 'jar'
  | 'cup'
  | 'mug'
  | 'glass'
  | 'glasses'
  | 'carton'
  | 'tea-box'
  | 'packet'
  | 'tub'
  | 'tube'
  | 'loaf'
  | 'baguette'
  | 'roll'
  | 'pastry'
  | 'cake-slice'
  | 'tortilla'
  | 'wedge'
  | 'drumstick'
  | 'poultry-breast'
  | 'poultry-wing'
  | 'whole-poultry'
  | 'steak'
  | 'ribs'
  | 'mince'
  | 'bone'
  | 'cut'
  | 'tray'
  | 'slices'
  | 'stripes'
  | 'sausage'
  | 'fish'
  | 'seafood'
  | 'egg'
  | 'block'
  | 'spray'
  | 'umbrella'
  | 'blister'
  | 'box'
  | 'sheet'
  | 'basket'
  | 'bowl'
  | 'nest'
  | 'bar'
  | 'cookie'
  | 'brush'
  | 'candle'
  | 'battery'
  | 'cat-bowl'
  | 'dog-bowl'
  | 'bottle-nipple'
  | 'pacifier'
  | 'baby-bib'
  | 'changing-pad'
  | 'makeup-set'
  | 'perfume-bottle'
  | 'diaper'
  | 'hygiene-pad'
  | 'feminine-care'
  | 'glove'
  | 'socks'
  | 'hosiery'
  | 'underwear'
  | 'leggings'
  | 'coffee-capsule'
  | 'headphones'
  | 'cable'

/** The closed set of colour pairs the shapes are drawn in. */
export type ProductVisualTint =
  | 'red'
  | 'rose'
  | 'orange'
  | 'yellow'
  | 'cream'
  | 'white'
  | 'sand'
  | 'brown'
  | 'green'
  | 'olive'
  | 'teal'
  | 'blue'
  | 'navy'
  | 'purple'
  | 'pink'
  | 'grey'
  | 'black'
  | 'amber'
  | 'silver'

export type ProductVisual = {
  shape: ProductVisualShape
  tint: ProductVisualTint
}

/** The colours a tint draws in: the product's own colour, a darker shade of it, and an accent
 *  used for the small details (a leaf, a label, a highlight). Fixed hex on purpose — the
 *  illustrations are flat and must read the same in light and dark mode, and the app's surface
 *  tokens would not give flat fills enough contrast. */
export const PRODUCT_VISUAL_TINTS: Record<ProductVisualTint, { primary: string; secondary: string; accent: string }> = {
  red: { primary: '#E5484D', secondary: '#A82F35', accent: '#3F9A52' },
  rose: { primary: '#E5839B', secondary: '#B95875', accent: '#F2C230' },
  orange: { primary: '#F2801D', secondary: '#B85C10', accent: '#3F9A52' },
  yellow: { primary: '#F2C230', secondary: '#B08812', accent: '#3F9A52' },
  // A pale product (milk, a yoghurt) still has to be seen on a pale card, so "white" and "cream"
  // are not paper-white: they are the off-white a white product is drawn in, with a grey edge
  // colour for the details.
  cream: { primary: '#E8D6AE', secondary: '#B99C6C', accent: '#8C5A32' },
  white: { primary: '#EAE4D6', secondary: '#BCB2A0', accent: '#8C5A32' },
  sand: { primary: '#D6B183', secondary: '#A87F52', accent: '#5E3A21' },
  brown: { primary: '#8C5A32', secondary: '#5E3A21', accent: '#F2C230' },
  green: { primary: '#5FAE77', secondary: '#2F7A4A', accent: '#F2C230' },
  olive: { primary: '#93A63F', secondary: '#5F7126', accent: '#E5484D' },
  teal: { primary: '#2AA198', secondary: '#176A63', accent: '#F2C230' },
  blue: { primary: '#3B82C4', secondary: '#23508C', accent: '#F2C230' },
  navy: { primary: '#2A4A7A', secondary: '#1B3055', accent: '#F2C230' },
  purple: { primary: '#7A5AC9', secondary: '#4E3487', accent: '#F2C230' },
  pink: { primary: '#F49BB4', secondary: '#C26784', accent: '#3F9A52' },
  grey: { primary: '#A3ACB8', secondary: '#6B7280', accent: '#3F9A52' },
  black: { primary: '#4A4A4A', secondary: '#2A2A2A', accent: '#9AA3AF' },
  amber: { primary: '#E0A33C', secondary: '#A8742A', accent: '#5E3A21' },
  silver: { primary: '#C8CDD4', secondary: '#9AA3AF', accent: '#5B6472' },
}

/** The visual a product gets when nothing more specific is known: a plain shopping basket in a
 *  neutral colour. Never a crash and never a wrong picture of something else. */
export const NEUTRAL_PRODUCT_VISUAL: ProductVisual = { shape: 'basket', tint: 'grey' }

const visual = (shape: ProductVisualShape, tint: ProductVisualTint): ProductVisual => ({ shape, tint })

/** Every product type (lib/product-types.ts) and the visual that stands for it. The whole
 *  taxonomy is covered — a type that is missing here falls back to its subcategory, and the test
 *  in lib/product-visuals.test.ts fails so the gap is closed deliberately. */
export const PRODUCT_TYPE_VISUALS: Record<string, ProductVisual> = {
  // --- Mléčné výrobky -------------------------------------------------------------------------
  maslo: visual('block', 'yellow'),
  'mleko-polotucne': visual('carton', 'blue'),
  'mleko-plnotucne': visual('carton', 'white'),
  'mleko-bez-laktozy': visual('carton', 'navy'),
  'smetana-na-vareni': visual('tub', 'cream'),
  'smetana-ke-slehani': visual('tub', 'white'),
  'zakysana-smetana': visual('tub', 'yellow'),
  'jogurt-bily': visual('cup', 'white'),
  tvaroh: visual('tub', 'sand'),
  eidam: visual('wedge', 'yellow'),
  gouda: visual('wedge', 'orange'),
  mozzarella: visual('block', 'white'),
  'balkansky-syr': visual('wedge', 'cream'),
  hermelin: visual('oval', 'cream'),
  parmazan: visual('wedge', 'sand'),
  'taveny-syr': visual('block', 'yellow'),
  niva: visual('wedge', 'white'),
  cottage: visual('tub', 'cream'),
  kefir: visual('bottle', 'white'),
  vejce: visual('egg', 'yellow'),

  // --- Pečivo ---------------------------------------------------------------------------------
  rohlik: visual('roll', 'sand'),
  chleb: visual('loaf', 'brown'),
  'toustovy-chleb': visual('loaf', 'orange'),
  houska: visual('roll', 'cream'),
  bageta: visual('baguette', 'sand'),

  // --- Ovoce a zelenina -----------------------------------------------------------------------
  jablka: visual('round', 'red'),
  banany: visual('crescent', 'yellow'),
  mandarinky: visual('round', 'orange'),
  citrony: visual('oval', 'yellow'),
  hrusky: visual('pear', 'green'),
  hrozny: visual('cluster', 'purple'),
  jahody: visual('cluster', 'red'),
  boruvky: visual('cluster', 'blue'),
  maliny: visual('cluster', 'pink'),
  avokado: visual('oval', 'olive'),
  rajcata: visual('tomato', 'red'),
  okurky: visual('oval', 'green'),
  paprika: visual('pepper', 'red'),
  brambory: visual('blob', 'sand'),
  cibule: visual('bulb', 'orange'),
  'jarni-cibulka': visual('long', 'green'),
  cesnek: visual('garlic', 'white'),
  mrkev: visual('cone', 'orange'),
  salat: visual('leaf', 'green'),
  zeli: visual('cabbage', 'green'),
  zampiony: visual('mushroom', 'brown'),
  cuketa: visual('long', 'green'),
  celer: visual('celeriac', 'sand'),
  brokolice: visual('cluster', 'green'),
  houby: visual('mushroom', 'sand'),
  pomerance: visual('round', 'orange'),
  pomazanky: visual('oval', 'rose'),
  'mrazena-zelenina': visual('box', 'blue'),
  cerealie: visual('box', 'orange'),
  'ovesne-vlocky': visual('packet', 'cream'),
  kecup: visual('tube', 'red'),
  horcice: visual('tube', 'yellow'),
  majoneza: visual('jar', 'cream'),
  dzem: visual('jar', 'red'),
  kakao: visual('packet', 'brown'),
  orechy: visual('cluster', 'brown'),
  seminka: visual('cluster', 'sand'),
  klobasy: visual('sausage', 'brown'),
  pastika: visual('jar', 'brown'),
  'mrazene-ovoce': visual('box', 'purple'),
  hranolky: visual('packet', 'red'),
  'pizza-mrazena': visual('wedge', 'orange'),

  // --- Maso a uzeniny ------------------------------------------------------------------------
  'kureci-prsa': visual('poultry-breast', 'sand'),
  'kureci-stehna': visual('drumstick', 'cream'),
  'kureci-kridla': visual('poultry-wing', 'cream'),
  'kure-cele': visual('whole-poultry', 'sand'),
  'kureci-mlete': visual('mince', 'cream'),
  'kureci-vnitrnosti': visual('tray', 'olive'),
  'kureci-na-polevku': visual('cut', 'cream'),
  'veprova-krkovice': visual('cut', 'pink'),
  'veprova-pecene': visual('cut', 'red'),
  'veprova-panenka': visual('cut', 'rose'),
  'veprova-kyta': visual('cut', 'cream'),
  'veprova-plec': visual('cut', 'sand'),
  'veprovy-bucek': visual('cut', 'olive'),
  'veprova-zebra': visual('ribs', 'pink'),
  'veprove-mlete': visual('mince', 'pink'),
  'veprove-na-gulas': visual('cut', 'brown'),
  'hovezi-svickova': visual('cut', 'navy'),
  'hovezi-zadni': visual('cut', 'red'),
  'hovezi-predni': visual('cut', 'rose'),
  'hovezi-steak': visual('steak', 'red'),
  'hovezi-mlete': visual('mince', 'red'),
  'hovezi-na-gulas': visual('cut', 'brown'),
  'kruti-prsa': visual('poultry-breast', 'cream'),
  'kruti-stehna': visual('drumstick', 'sand'),
  'kruti-mlete': visual('mince', 'sand'),
  'kruti-ostatni': visual('drumstick', 'grey'),
  'mlete-smesne': visual('mince', 'rose'),
  sunka: visual('slices', 'pink'),
  parky: visual('sausage', 'pink'),
  slanina: visual('stripes', 'pink'),

  // --- Ryby a mořské plody --------------------------------------------------------------------
  losos: visual('fish', 'rose'),
  'tunak-konzerva': visual('can', 'blue'),
  'ryby-bile': visual('fish', 'grey'),
  'ryby-konzervy': visual('can', 'olive'),
  'uzene-ryby': visual('fish', 'brown'),
  surimi: visual('slices', 'white'),
  'rybi-prsty-obalovane': visual('cut', 'white'),
  'rybi-pomazanky': visual('jar', 'white'),
  'sladkovodni-ryby-cerstve': visual('fish', 'blue'),
  'morske-plody': visual('seafood', 'orange'),
  'rybi-saly': visual('bowl', 'blue'),

  // --- Konzervy, rýže, těstoviny, mouka, cukr -------------------------------------------------
  ryze: visual('bowl', 'white'),
  testoviny: visual('nest', 'yellow'),
  'instantni-nudle': visual('cup', 'yellow'),
  'nudle-vajecne': visual('nest', 'yellow'),
  'asijske-nudle': visual('nest', 'olive'),
  'plnene-testoviny': visual('nest', 'pink'),
  'mouka-hladka': visual('packet', 'sand'),
  'mouka-polohruba': visual('packet', 'cream'),
  'mouka-hruba': visual('packet', 'brown'),
  'mouky-specialni': visual('packet', 'cream'),
  'cukr-krupice': visual('packet', 'white'),
  'cukr-moucka': visual('packet', 'white'),
  'cukr-specialni': visual('packet', 'cream'),

  // --- Oleje a tuky, příchutí, koření ---------------------------------------------------------
  'olej-slunecnicovy': visual('bottle', 'yellow'),
  'olej-repkovy': visual('bottle', 'olive'),
  'olej-olivovy': visual('bottle', 'green'),
  'rostlinne-oleje-specialni': visual('bottle', 'sand'),
  'margariny-tuky': visual('tub', 'yellow'),
  'rostlinna-smetana-krem': visual('tub', 'olive'),
  cocka: visual('cluster', 'sand'),
  'fazole-cizrna-konzervy': visual('can', 'sand'),
  'hrasek-fazolky': visual('cluster', 'olive'),
  'hummus-luste-pomazanky': visual('tub', 'cream'),
  med: visual('jar', 'yellow'),
  ocet: visual('bottle', 'orange'),
  sul: visual('packet', 'white'),
  'sul-do-mycky': visual('packet', 'grey'),
  drozdi: visual('packet', 'grey'),
  'koreni': visual('bottle', 'brown'),
  'kavoviny-cekanka': visual('jar', 'olive'),
  'kypriciprasek-zelatina': visual('packet', 'white'),
  'kyselina-citronova': visual('packet', 'yellow'),
  'kyprici-prasek': visual('packet', 'cream'),
  'mleko-susene': visual('packet', 'white'),
  'mleko-kondenzovane': visual('can', 'white'),
  syrovatka: visual('bottle', 'cream'),
  ghi: visual('tub', 'yellow'),

  // --- Nápoje --------------------------------------------------------------------------------
  'kava-mleta': visual('packet', 'brown'),
  'kava-instantni': visual('jar', 'brown'),
  'kava-zrnkova': visual('cluster', 'brown'),
  'kava-kapsle': visual('coffee-capsule', 'brown'),
  'voda-neperliva': visual('bottle', 'blue'),
  'voda-perliva': visual('bottle', 'teal'),
  pivo: visual('can', 'olive'),
  caj: visual('tea-box', 'green'),
  'caj-bylinny-ovocny': visual('tea-box', 'rose'),
  matcha: visual('packet', 'olive'),
  'matcha-latte': visual('mug', 'pink'),
  'yerba-mate': visual('packet', 'teal'),
  vino: visual('bottle', 'navy'),
  cidery: visual('bottle', 'green'),
  'svarene-vino': visual('glass', 'red'),
  'fortifikovana-vina': visual('bottle', 'brown'),
  'nealko-vino-sekt': visual('bottle', 'blue'),
  lihoviny: visual('bottle', 'purple'),
  likery: visual('bottle', 'pink'),
  palenky: visual('bottle', 'black'),
  'aperitivy': visual('glass', 'olive'),
  'rtd-koktejly': visual('glass', 'pink'),
  'nealko-koktejly': visual('glass', 'green'),
  medovina: visual('bottle', 'olive'),
  'cokolada-tabulkova': visual('bar', 'brown'),
  'cokolada-na-vareni': visual('bar', 'navy'),
  'chipsy-snacky': visual('packet', 'yellow'),
  limonady: visual('bottle', 'yellow'),
  dzusy: visual('glass', 'orange'),
  sirupy: visual('bottle', 'rose'),
  'prirodni-sirupy-sladidla': visual('bottle', 'rose'),
  'jogurt-ochuceny': visual('cup', 'pink'),
  'jogurt-pitny': visual('bottle', 'white'),
  skyr: visual('tub', 'white'),
  'susenky-oplatky': visual('cookie', 'sand'),
  'detske-susenky-krupky': visual('cookie', 'pink'),
  'tycinky-sladke': visual('bar', 'sand'),
  'cerealni-tycinky': visual('bar', 'orange'),
  'proteinove-tycinky': visual('bar', 'olive'),
  'cokoladove-tycinky-znackove': visual('bar', 'brown'),
  'bonbony-zvykaci': visual('cluster', 'pink'),
  'bonboniery': visual('bar', 'pink'),
  'adventni-kalendare': visual('box', 'red'),
  marshmallow: visual('cluster', 'white'),
  zmrzliny: visual('cone', 'pink'),
  'mlecne-dezerty': visual('cup', 'cream'),
  'mlecne-svaciny-detske': visual('cup', 'pink'),
  'mlecna-krupice': visual('cup', 'white'),
  'jogurty-znackove': visual('cup', 'blue'),
  'jogurtove-smoothie': visual('glass', 'pink'),
  'omacky-hotove': visual('bottle', 'red'),
  'asijske-omacky': visual('bottle', 'navy'),
  'nahrazky-mleka-rostlinne': visual('carton', 'olive'),
  'kysane-napoje': visual('bottle', 'white'),
  'mlecne-napoje': visual('glass', 'white'),
  salam: visual('slices', 'red'),
  'vysocina-salam': visual('slices', 'rose'),
  'pecivo-sladke': visual('pastry', 'sand'),
  'dorty-zakusky': visual('cake-slice', 'rose'),
  'zavin-strudl': visual('loaf', 'rose'),
  'zavinace': visual('roll', 'rose'),
  'chlebicky-lahudkove': visual('block', 'cream'),
  'jemne-pecivo-baleni': visual('packet', 'cream'),
  'rizove-chlebicky': visual('block', 'cream'),
  'veka': visual('block', 'white'),
  'ciabatta-focaccia': visual('loaf', 'cream'),
  'tortilly': visual('tortilla', 'cream'),
  'tortilla-chipsy': visual('wedge', 'olive'),
  'burger-hotdog-bulky': visual('roll', 'sand'),
  'sendvice-wrapy': visual('roll', 'sand'),
  'bagely-bagetky': visual('oval', 'cream'),
  kombucha: visual('bottle', 'olive'),
  'nealko-pivo': visual('can', 'green'),
  'ledove-caje': visual('glass', 'teal'),
  'voda-ochucena': visual('bottle', 'pink'),
  'kokosova-voda': visual('bottle', 'cream'),
  'energeticke-napoje': visual('can', 'navy'),
  mosty: visual('bottle', 'rose'),
  'ovocne-stavy-100': visual('glass', 'red'),
  'napojove-koncentraty': visual('bottle', 'red'),
  'iontove-napoje': visual('bottle', 'teal'),
  'proteinove-napoje': visual('bottle', 'blue'),
  'kavove-napoje-hotove': visual('cup', 'navy'),
  'instantni-napoje': visual('packet', 'blue'),
  'kakaove-napoje-instantni': visual('packet', 'brown'),
  'funkcni-napoje': visual('bottle', 'green'),
  'shoty-wellness': visual('bottle', 'green'),
  // Types that are not in the taxonomy's own list (a phone, a pair of glasses, a pet bowl) keep
  // their own visual so they are told apart at a glance.
  arasidy: visual('cluster', 'olive'),
  bryle: visual('glasses', 'navy'),
  'kontaktni-cocky': visual('glasses', 'teal'),
  'sprchove-pripravky-dalsi': visual('bottle', 'blue'),
  'syrove-nite-korbaciky': visual('box', 'yellow'),
  'ocni-polstarky': visual('box', 'teal'),
  'pece-o-vousy': visual('bottle', 'brown'),
  'masazni-pripravky': visual('bottle', 'green'),
  'ovocne-snacky': visual('packet', 'green'),
  'krmivo-pro-kocky': visual('cat-bowl', 'purple'),
  'krmivo-pro-psy': visual('dog-bowl', 'brown'),

  // --- Sladké, slané, hotová jídla ---------------------------------------------------------------
  'popcorn': visual('packet', 'yellow'),
  krekry: visual('block', 'sand'),
  'krupky-snacky': visual('packet', 'orange'),
  'slane-tycinky-preclik': visual('block', 'olive'),
  'kukuricne-trubicky': visual('tube', 'yellow'),
  'trubicky-oplatkove': visual('bar', 'rose'),
  'polevky': visual('bowl', 'red'),
  'polevky-instantni': visual('packet', 'red'),
  'pizza-hotova': visual('wedge', 'red'),
  'pizza-korpus': visual('wedge', 'cream'),
  'salaty-hotove': visual('bowl', 'green'),
  'kvasena-zelenina': visual('jar', 'green'),
  'konzervy-ovoce-kompoty': visual('jar', 'orange'),
  'zelenina-konzervovana': visual('can', 'green'),
  'ovoce-exoticke': visual('pear', 'orange'),
  kukurice: visual('corn-cob', 'yellow'),
  dyne: visual('pumpkin', 'orange'),
  spenat: visual('leaf', 'olive'),
  'cervena-repa': visual('round', 'navy'),
  kvetak: visual('cluster', 'white'),
  knedliky: visual('oval', 'cream'),
  testo: visual('bowl', 'white'),
  'smesi-na-peceni': visual('bowl', 'cream'),
  'kuskus-bulgur': visual('bowl', 'sand'),
  'pohanka-jahly-kroupy': visual('bowl', 'brown'),
  'kase-instantni': visual('cup', 'sand'),
  'detske-kase': visual('cup', 'yellow'),
  'granola-musli-tycinky': visual('packet', 'brown'),
  'ovesne-ovocne-kapsicky': visual('packet', 'pink'),
  'tofu-tempeh': visual('block', 'white'),
  'rostlinne-syry-dezerty': visual('block', 'cream'),
  'olivy-kapary': visual('jar', 'olive'),
  'rajcatove-vyrobky': visual('jar', 'rose'),
  'syrove-pomazanky': visual('jar', 'white'),
  'sladke-pomazanky': visual('jar', 'brown'),
  'masove-pomazanky': visual('jar', 'pink'),
  'ovocne-pomazanky': visual('jar', 'green'),
  'orechove-kremy-masla': visual('tub', 'brown'),
  'mandle': visual('cluster', 'cream'),
  'kesu-pistacie': visual('cluster', 'green'),
  'liskove-vlasske-orechy': visual('cluster', 'orange'),
  'orechy-smesi': visual('cluster', 'grey'),
  'susene-ovoce': visual('cluster', 'rose'),
  'mak-semena-specialni': visual('cluster', 'black'),
  'ovoce-susene-mrazem': visual('packet', 'sand'),
  'bramborove-vyrobky': visual('oval', 'sand'),
  'zazvor-kurkuma-cerstve': visual('cone', 'sand'),
  'mlete-ovoce-pyre': visual('jar', 'rose'),
  'merunky': visual('oval', 'pink'),
  'broskve-nektarinky': visual('round', 'pink'),
  'svestky-slivky': visual('round', 'purple'),
  'tresne-visne': visual('cherry', 'red'),
  'ostruziny': visual('cluster', 'black'),
  'redkvicky-redkev': visual('radish', 'rose'),
  'kedlubny-kapusty': visual('round', 'olive'),
  'lilek-patison': visual('oval', 'navy'),
  'bylinky-cerstve': visual('sprig', 'green'),
  'polevkova-zelenina-smes': visual('packet', 'green'),
  'syr-platkovy': visual('block', 'sand'),
  'syr-plisnovy': visual('wedge', 'navy'),
  'syr-grilovaci': visual('block', 'olive'),
  'syr-tvrdy': visual('block', 'sand'),
  'cerstvy-syr': visual('tub', 'white'),
  'tvaruzky-syrecky': visual('wedge', 'grey'),
  raclette: visual('wedge', 'olive'),
  'mleko-kozi-ovci': visual('carton', 'olive'),
  'smetana-do-kavy': visual('mug', 'white'),
  'creme-fraiche': visual('bottle', 'white'),
  'slehacka-sprej': visual('spray', 'grey'),
  'syrove-svacinky': visual('tub', 'pink'),

  // --- Maso navíc ------------------------------------------------------------------------------
  'uzene-maso': visual('stripes', 'brown'),
  sekana: visual('cut', 'olive'),
  kabanos: visual('sausage', 'olive'),
  vnitrnosti: visual('tray', 'olive'),
  'veprovy-bok': visual('cut', 'grey'),
  'hovezi-zebra': visual('ribs', 'red'),
  'zverina-kralik': visual('drumstick', 'rose'),
  'pecene-maso-hotove': visual('cut', 'brown'),
  'hotova-masova-jidla': visual('box', 'navy'),
  'kureci-nugety-stripsy': visual('stripes', 'sand'),
  'maso-nudlicky-kostky': visual('cut', 'pink'),
  'kureci-rizky': visual('cut', 'yellow'),
  'trhane-maso': visual('tray', 'cream'),
  'maso-ve-vlastni-stave': visual('can', 'red'),
  'masove-smesi-na-polevku': visual('tray', 'brown'),
  'veprove-koleno': visual('cut', 'teal'),
  'veprove-vedlejsi': visual('drumstick', 'rose'),
  'sous-vide-maso': visual('cut', 'blue'),
  burgery: visual('roll', 'brown'),
  'gyros-kebab-maso': visual('sausage', 'brown'),
  'kureci-medailonky-filetky': visual('poultry-breast', 'sand'),
  husa: visual('drumstick', 'green'),
  kachna: visual('drumstick', 'navy'),
  'susene-maso': visual('stripes', 'brown'),
  'vyvary-bujony': visual('box', 'brown'),
  'tlacenky-jitrnice': visual('slices', 'rose'),
  'chorizo-fuet': visual('sausage', 'red'),
  pancetta: visual('stripes', 'rose'),
  'steaky-specialni': visual('steak', 'red'),
  'mrazene-kureci-kruti': visual('box', 'teal'),
  'mrazene-kachna-husa': visual('box', 'navy'),
  'mrazene-vepro-hovezi': visual('box', 'rose'),
  'mrazene-ryby-file': visual('box', 'grey'),
  'mrazena-zelenina-smesi': visual('box', 'green'),
  'mrazene-ovoce-plody': visual('box', 'pink'),
  'obalovana-zelenina-syr': visual('box', 'olive'),
  'pernik': visual('cookie', 'brown'),
  'puding-prasek': visual('packet', 'pink'),
  'marlenka-medove': visual('bar', 'yellow'),
  'orechy-v-cokolade': visual('bar', 'pink'),
  'peceni-zdobeni-aroma': visual('packet', 'purple'),
  'naplne-peceni': visual('tub', 'rose'),
  'strouhanka': visual('bowl', 'sand'),
  krutony: visual('bowl', 'brown'),

  // --- Drogerie, kosmetika, hygiena -------------------------------------------------------------
  mydlo: visual('block', 'green'),
  'detske-mydlo': visual('block', 'pink'),
  'sprchovy-gel': visual('bottle', 'teal'),
  'detsky-sprchovy-gel': visual('bottle', 'rose'),
  'detska-hygiena-koupel': visual('tub', 'pink'),
  sampon: visual('bottle', 'purple'),
  'detsky-sampon': visual('bottle', 'pink'),
  'suchy-sampon': visual('box', 'purple'),
  'vlasova-pece': visual('bottle', 'teal'),
  'styling-vlasy': visual('spray', 'pink'),
  'barvy-na-vlasy': visual('bottle', 'purple'),
  'vlasove-doplnky': visual('bottle', 'grey'),
  'telova-pece': visual('tub', 'pink'),
  'krem-na-ruce': visual('tub', 'white'),
  'univerzalni-krem': visual('tub', 'yellow'),
  'pece-o-plet': visual('tub', 'rose'),
  'pece-o-nohy': visual('tub', 'olive'),
  'koupel': visual('tub', 'teal'),
  'balzam-na-rty': visual('tube', 'pink'),
  'pece-o-rty': visual('tube', 'green'),
  'detska-kosmetika': visual('tube', 'rose'),
  'opalovaci-pripravky': visual('bottle', 'orange'),
  'odlicovaci-pripravky': visual('bottle', 'blue'),
  parfemy: visual('perfume-bottle', 'pink'),
  'vune-na-pradlo': visual('bottle', 'grey'),
  osvezovace: visual('bottle', 'blue'),
  'pece-o-nehty': visual('bottle', 'rose'),
  'umele-nehty': visual('box', 'rose'),
  depilace: visual('box', 'pink'),
  'lubrikacni-gely': visual('tube', 'teal'),
  'kosmeticke-pomucky': visual('brush', 'rose'),
  'kartace-doplnky-vlasy': visual('brush', 'brown'),
  'kosmeticke-zrcatka-tasky': visual('block', 'pink'),
  'dekorativni-kosmetika': visual('makeup-set', 'rose'),
  'holeni': visual('bottle', 'navy'),
  'holici-hlavice-holitka': visual('bottle', 'grey'),
  'nahradni-hlavice-kartacky': visual('brush', 'blue'),
  deodoranty: visual('spray', 'white'),
  'damska-hygiena': visual('feminine-care', 'rose'),
  'inkontinencni-vlozky': visual('hygiene-pad', 'white'),
  puncochy: visual('hosiery', 'grey'),
  ponozky: visual('socks', 'olive'),
  'kalhotky-podprsenky': visual('underwear', 'pink'),
  'leginy-treginy': visual('leggings', 'navy'),
  kondomy: visual('box', 'blue'),
  'vitaminy-doplnky': visual('blister', 'green'),
  'kapky-spreje-pastilky-zdravi': visual('bottle', 'teal'),
  'naplasti-obinadla': visual('blister', 'sand'),
  'repelenty-proti-hmyzu': visual('spray', 'olive'),
  'esencialni-oleje': visual('bottle', 'rose'),
  'ustni-hygiena': visual('tube', 'white'),
  'zubni-pasta': visual('tube', 'blue'),
  'zubni-nahrady': visual('tube', 'green'),
  'bileni-zubu': visual('packet', 'white'),
  'toaletni-papir': visual('sheet', 'white'),
  'vlhceny-toaletni-papir': visual('sheet', 'pink'),
  'kuchynske-uterky': visual('sheet', 'teal'),
  uterky: visual('sheet', 'green'),
  'hadry-mopy-prachovky': visual('sheet', 'teal'),
  'vlhcene-ubrousky': visual('box', 'white'),
  'ubrousky-papirove': visual('box', 'cream'),
  'papir-tasky': visual('box', 'sand'),
  'vlhcene-ubrousky-detske': visual('box', 'pink'),
  'praci-gel': visual('bottle', 'blue'),
  'praci-prasek': visual('packet', 'white'),
  'praci-kapsle': visual('box', 'blue'),
  avivaz: visual('bottle', 'pink'),
  'tablety-do-mycky': visual('box', 'green'),
  jar: visual('bottle', 'teal'),
  'lestidlo-do-mycky': visual('bottle', 'white'),
  'cistic-wc': visual('bottle', 'white'),
  'cistic-koupelny': visual('bottle', 'teal'),
  'cistic-kuchyne': visual('bottle', 'olive'),
  'univerzalni-cistic': visual('spray', 'green'),
  'cistic-oken': visual('spray', 'blue'),
  'odstranovac-skvrn': visual('spray', 'olive'),
  dezinfekce: visual('spray', 'white'),
  'odvapnovace-kyseliny': visual('bottle', 'white'),
  'houbicky-na-nadobi': visual('block', 'yellow'),
  'pytle-na-odpadky': visual('packet', 'grey'),
  'sacky-uzaviratelne-mrazici': visual('packet', 'blue'),
  'sacky-do-vysavace': visual('packet', 'black'),
  'sacky-na-peceni': visual('sheet', 'white'),
  alobal: visual('sheet', 'grey'),
  'potravinova-folie': visual('sheet', 'blue'),
  'pecici-papir': visual('sheet', 'cream'),
  'wc-bloky': visual('box', 'white'),
  'rukavice-uklid': visual('glove', 'teal'),
  'kosti-na-vyvar': visual('bone', 'cream'),
  'baterie': visual('battery', 'navy'),
  'destniky': visual('umbrella', 'navy'),

  // --- Děti ------------------------------------------------------------------------------------
  pleny: visual('diaper', 'white'),
  dudliky: visual('pacifier', 'pink'),
  'detske-lahve': visual('bottle', 'pink'),
  'detske-savicky': visual('bottle-nipple', 'white'),
  'detske-bryndaky': visual('baby-bib', 'pink'),
  'detske-prebalovaci-podlozky': visual('changing-pad', 'blue'),
  'detske-nadobi': visual('bowl', 'blue'),
  'kojenecke-mleko': visual('can', 'blue'),
  'detske-prikrmy': visual('jar', 'orange'),
  'detske-kapsicky': visual('packet', 'yellow'),
  'detske-napoje': visual('bottle', 'green'),
  'poporodni-kojici-pomucky': visual('bottle', 'rose'),

  // --- Domácnost a ostatní ------------------------------------------------------------------------
  svicky: visual('candle', 'cream'),
  jiska: visual('battery', 'grey'),
}

/** The visual of every subcategory — the fallback for a product whose type is unknown. */
export const SUBCATEGORY_VISUALS: Record<string, ProductVisual> = {
  'Pečivo': visual('loaf', 'brown'),
  'Mléčné výrobky': visual('carton', 'blue'),
  'Vejce': visual('egg', 'yellow'),
  'Maso a uzeniny': visual('drumstick', 'sand'),
  'Ryby a mořské plody': visual('fish', 'blue'),
  'Ovoce a zelenina': visual('round', 'green'),
  'Luštěniny': visual('cluster', 'sand'),
  'Ořechy, semínka a sušené ovoce': visual('cluster', 'brown'),
  'Nápoje': visual('bottle', 'blue'),
  'Káva a čaj': visual('mug', 'brown'),
  'Alkoholické nápoje': visual('bottle', 'navy'),
  'Sladkosti': visual('bar', 'pink'),
  'Džemy, med a pomazánky': visual('jar', 'amber'),
  'Slané pochutiny': visual('packet', 'orange'),
  'Lahůdky a hotová jídla': visual('box', 'orange'),
  'Rostlinné alternativy': visual('block', 'green'),
  'Trvanlivé potraviny': visual('can', 'grey'),
  'Mouka a pečení': visual('packet', 'cream'),
  'Oleje a tuky': visual('bottle', 'olive'),
  'Konzervy': visual('can', 'grey'),
  'Mražené potraviny': visual('box', 'blue'),
  'Těstoviny a rýže': visual('nest', 'yellow'),
  'Koření a bylinky': visual('bottle', 'brown'),
  'Omáčky a dochucovadla': visual('bottle', 'red'),
  'Cereálie a snídaně': visual('box', 'orange'),
  'Dětská výživa': visual('jar', 'orange'),
  'Ostatní potraviny': visual('basket', 'sand'),
  'Praní': visual('bottle', 'blue'),
  'Mytí nádobí': visual('bottle', 'teal'),
  'Čištění domácnosti': visual('spray', 'green'),
  'Kosmetika': visual('tub', 'pink'),
  'Hygiena': visual('tube', 'white'),
  'Dětská hygiena': visual('bottle', 'pink'),
  'Zdraví a doplňky stravy': visual('blister', 'orange'),
  'Doplňky a oblečení': visual('box', 'grey'),
  'Ostatní drogerie': visual('basket', 'grey'),
  'Papír': visual('sheet', 'cream'),
  'Kuchyň': visual('sheet', 'silver'),
  'Úklid': visual('spray', 'blue'),
  'Zahrada': visual('sprig', 'green'),
  'Ostatní': visual('basket', 'grey'),
  'Pleny': visual('packet', 'white'),
  'Dětská kosmetika': visual('tube', 'pink'),
  'Dětské potřeby': visual('box', 'yellow'),
  'Hračky': visual('block', 'pink'),
  'Kojenecké mléko': visual('can', 'blue'),
  'Příkrmy': visual('jar', 'orange'),
  'Kaše a cereálie': visual('cup', 'cream'),
  'Dětské svačinky': visual('packet', 'pink'),
  'Dětské nápoje': visual('bottle', 'blue'),
  'Oblečení a obuv': visual('box', 'purple'),
  'Elektronika': visual('battery', 'navy'),
  'Tabák a e-cigarety': visual('box', 'grey'),
  'Ostatní zboží': visual('basket', 'grey'),
}

/** The visual of every category — the last fallback before the neutral one. */
export const CATEGORY_VISUALS: Record<ItemCategory, ProductVisual> = {
  Potraviny: visual('basket', 'orange'),
  Drogerie: visual('bottle', 'teal'),
  Domácnost: visual('spray', 'blue'),
  Děti: visual('block', 'yellow'),
  Ostatní: visual('basket', 'grey'),
}

/** The visual a product is shown with: its own type first, then its subcategory, then its
 *  category, and finally the neutral basket. Deterministic — the same product always gets the
 *  same visual, and nothing about it is guessed at random. */
export function productVisualFor(input: {
  productTypeKey?: string | null
  subcategory?: string | null
  category?: ItemCategory | null
}): ProductVisual {
  const byType = input.productTypeKey ? PRODUCT_TYPE_VISUALS[input.productTypeKey] : undefined
  if (byType) return byType
  const bySubcategory = input.subcategory ? SUBCATEGORY_VISUALS[input.subcategory] : undefined
  if (bySubcategory) return bySubcategory
  const byCategory = input.category ? CATEGORY_VISUALS[input.category] : undefined
  if (byCategory) return byCategory
  return NEUTRAL_PRODUCT_VISUAL
}
