import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { getDb } from '../lib/db/client'
import { productTypes } from '../lib/db/schema'
import { storeProductTypeImage } from '../lib/product-images'
import { eq } from 'drizzle-orm'

/**
 * Improved search terms for Wikimedia Commons.
 * Since searching in Czech failed, we use common English terms for generic product types.
 * This mapping covers the most common categories to bootstrap the visual library.
 */
const ENGLISH_MAPPINGS: Record<string, string> = {
  'maslo': 'Butter',
  'mleko-polotucne': 'Semi-skimmed milk',
  'mleko-plnotucne': 'Whole milk',
  'mleko-bez-laktozy': 'Lactose-free milk',
  'smetana-na-vareni': 'Cooking cream',
  'smetana-ke-slehani': 'Whipping cream',
  'zakysana-smetana': 'Sour cream',
  'jogurt-bily': 'Plain yogurt',
  'tvaroh': 'Curd cheese',
  'eidam': 'Edam cheese',
  'gouda': 'Gouda cheese',
  'mozzarella': 'Mozzarella',
  'balkansky-syr': 'Feta cheese',
  'hermelin': 'Camembert cheese',
  'parmazan': 'Parmesan cheese',
  'taveny-syr': 'Processed cheese',
  'niva': 'Blue cheese',
  'cottage': 'Cottage cheese',
  'kefir': 'Kefir',
  'vejce': 'Chicken eggs',
  'rohlik': 'Bread roll',
  'chleb': 'Loaf of bread',
  'toustovy-chleb': 'Toast bread',
  'houska': 'Bun',
  'bageta': 'Baguette',
  'jablka': 'Apple',
  'banany': 'Banana',
  'mandarinky': 'Mandarin',
  'citrony': 'Lemon',
  'hrusky': 'Pear',
  'hrozny': 'Grapes',
  'jahody': 'Strawberry',
  'boruvky': 'Blueberry',
  'maliny': 'Raspberry',
  'avokado': 'Avocado',
  'rajcata': 'Tomato',
  'okurky': 'Cucumber',
  'paprika': 'Bell pepper',
  'brambory': 'Potato',
  'cibule': 'Onion',
  'jarni-cibulka': 'Spring onion',
  'cesnek': 'Garlic',
  'mrkev': 'Carrot',
  'salat': 'Lettuce',
  'zeli': 'Cabbage',
  'zampiony': 'Champignon',
  'cuketa': 'Zucchini',
  'celer': 'Celery',
  'brokolice': 'Broccoli',
  'houby': 'Mushroom',
  'pomerance': 'Orange',
  'pomazanky': 'Spread',
  'mrazena-zelenina': 'Frozen vegetables',
  'cerealie': 'Cereal',
  'ovesne-vlocky': 'Oat flakes',
  'kecup': 'Ketchup',
  'horcice': 'Mustard',
  'majoneza': 'Mayonnaise',
  'dzem': 'Jam',
  'kakao': 'Cocoa powder',
  'orechy': 'Nuts',
  'seminka': 'Seeds',
  'klobasy': 'Sausage',
  'pastika': 'Pâté',
  'mrazene-ovoce': 'Frozen fruit',
  'hranolky': 'French fries',
  'pizza-mrazena': 'Frozen pizza',
  'kureci-prsa': 'Chicken breast',
  'kureci-stehna': 'Chicken thigh',
  'kureci-kridla': 'Chicken wing',
  'kure-cele': 'Whole chicken',
  'kureci-mlete': 'Minced chicken',
  'kureci-vnitrnosti': 'Chicken giblets',
  'kureci-na-polevku': 'Chicken carcass',
  'veprova-krkovice': 'Pork collar',
  'veprova-pecene': 'Pork roast',
  'veprova-panenka': 'Pork tenderloin',
  'veprova-kyta': 'Pork leg',
  'veprova-plec': 'Pork shoulder',
  'veprovy-bucek': 'Pork belly',
  'veprova-zebra': 'Pork ribs',
  'veprove-mlete': 'Minced pork',
  'veprove-na-gulas': 'Pork stew meat',
  'hovezi-svickova': 'Beef tenderloin',
  'hovezi-zadni': 'Beef hindquarter',
  'hovezi-predni': 'Beef forequarter',
  'hovezi-steak': 'Beef steak',
  'hovezi-mlete': 'Minced beef',
  'hovezi-na-gulas': 'Beef stew meat',
  'kruti-prsa': 'Turkey breast',
  'kruti-stehna': 'Turkey thigh',
  'kruti-mlete': 'Minced turkey',
  'mlete-smesne': 'Mixed minced meat',
  'sunka': 'Ham',
  'parky': 'Frankfurter',
  'slanina': 'Bacon',
  'losos': 'Salmon',
  'tunak-konzerva': 'Canned tuna',
  'ryze': 'Rice',
  'testoviny': 'Pasta',
  'mouka-hladka': 'Wheat flour',
  'mouka-polohruba': 'Semi-coarse flour',
  'mouka-hruba': 'Coarse flour',
  'cukr-krupice': 'Granulated sugar',
  'cukr-moucka': 'Powdered sugar',
  'olej-slunecnicovy': 'Sunflower oil',
  'olej-repkovy': 'Rapeseed oil',
  'olej-olivovy': 'Olive oil',
  'cocka': 'Lentil',
  'med': 'Honey',
  'ocet': 'Vinegar',
  'sul': 'Salt',
  'drozdi': 'Yeast',
  'kava-mleta': 'Ground coffee',
  'kava-zrnkova': 'Coffee beans',
  'voda-neperliva': 'Still water',
  'voda-perliva': 'Sparkling water',
  'pivo': 'Beer',
  'caj': 'Tea',
  'vino': 'Wine',
  'lihoviny': 'Liquor',
  'cokolada-tabulkova': 'Chocolate bar',
  'chipsy-snacky': 'Potato chips',
  'limonady': 'Soft drink',
  'dzusy': 'Fruit juice',
  'sirupy': 'Syrup',
  'jogurt-ochuceny': 'Flavoured yogurt',
  'jogurt-pitny': 'Drinking yogurt',
  'skyr': 'Skyr',
  'susenky-oplatky': 'Biscuits',
  'tycinky-sladke': 'Sweet sticks',
  'bonbony-zvykaci': 'Candy',
  'zmrzliny': 'Ice cream',
  'omacky-hotove': 'Sauce',
  'nahrazky-mleka-rostlinne': 'Plant milk',
  'koreni': 'Spice',
  'salam': 'Salami',
  'morske-plody': 'Seafood',
  'pecivo-sladke': 'Sweet pastry',
  'kombucha': 'Kombucha',
  'nealko-pivo': 'Non-alcoholic beer',
  'ledove-caje': 'Iced tea',
  'voda-ochucena': 'Flavoured water',
  'mlecne-napoje': 'Milk drink',
  'kysane-napoje': 'Fermented milk drink',
  'likery': 'Liqueur',
  'cidery': 'Cider',
  'cerstvy-syr': 'Cream cheese',
  'syr-tvrdy': 'Hard cheese',
  'mlecne-dezerty': 'Dairy dessert',
  'mleko-kozi-ovci': 'Goat milk',
  'bonboniery': 'Pralines',
  'dorty-zakusky': 'Cake',
  'kachna': 'Duck meat',
  'susene-maso': 'Dried meat',
  'vyvary-bujony': 'Broth',
  'tlacenky-jitrnice': 'Headcheese',
  'arasidy': 'Peanuts',
  'popcorn': 'Popcorn',
  'krekry': 'Crackers',
  'slane-tycinky-preclik': 'Pretzels',
  'tortilla-chipsy': 'Tortilla chips',
  'krupky-snacky': 'Puffed snacks',
  'polevky': 'Soup',
  'pizza-hotova': 'Pizza',
  'salaty-hotove': 'Prepared salad',
  'sendvice-wrapy': 'Sandwich',
  'kvasena-zelenina': 'Sauerkraut',
  'instantni-nudle': 'Instant noodles',
  'ovoce-exoticke': 'Exotic fruit',
  'kukurice': 'Corn',
  'dyne': 'Pumpkin',
  'spenat': 'Spinach',
  'cervena-repa': 'Beetroot',
  'kvetak': 'Cauliflower',
  'knedliky': 'Dumplings',
  'testo': 'Dough',
  'smesi-na-peceni': 'Baking mix',
  'barvy-na-vlasy': 'Hair dye',
  'vlasova-pece': 'Hair care',
  'styling-vlasy': 'Hair styling',
  'telova-pece': 'Body care',
  'krem-na-ruce': 'Hand cream',
  'balzam-na-rty': 'Lip balm',
  'opalovaci-pripravky': 'Sunscreen',
  'odlicovaci-pripravky': 'Makeup remover',
  'parfemy': 'Perfume',
  'pece-o-nehty': 'Nail care',
  'kondomy': 'Condoms',
  'puncochy': 'Tights',
  'ponozky': 'Socks',
  'bryle': 'Glasses',
  'kontaktni-cocky': 'Contact lenses',
  'vitaminy-doplnky': 'Vitamins',
  'praci-kapsle': 'Laundry pods',
  'wc-bloky': 'Toilet block',
  'rukavice-uklid': 'Cleaning gloves',
  'osvezovace': 'Air freshener',
  'dudliky': 'Pacifiers',
  'detske-lahve': 'Baby bottle',
  'detske-kase': 'Baby porridge',
  'kojenecke-mleko': 'Infant formula',
  'mydlo': 'Soap',
  'deodoranty': 'Deodorant',
  'damska-hygiena': 'Feminine hygiene',
  'ustni-hygiena': 'Oral hygiene',
  'vlhcene-ubrousky': 'Wet wipes',
  'holeni': 'Shaving',
  'dekorativni-kosmetika': 'Decorative cosmetics',
  'pece-o-plet': 'Skin care',
  'toaletni-papir': 'Toilet paper',
  'kuchynske-uterky': 'Kitchen towel',
  'zubni-pasta': 'Toothpaste',
  'sprchovy-gel': 'Shower gel',
  'sampon': 'Shampoo',
  'praci-gel': 'Laundry detergent gel',
  'praci-prasek': 'Laundry detergent powder',
  'avivaz': 'Fabric softener',
  'tablety-do-mycky': 'Dishwasher tablets',
  'jar': 'Dish soap',
  'pleny': 'Diapers',
  'sul-do-mycky': 'Dishwasher salt',
  'lestidlo-do-mycky': 'Rinse aid',
  'cistic-wc': 'Toilet cleaner',
  'cistic-koupelny': 'Bathroom cleaner',
  'cistic-kuchyne': 'Kitchen cleaner',
  'univerzalni-cistic': 'Universal cleaner',
  'cistic-oken': 'Glass cleaner',
  'odstranovac-skvrn': 'Stain remover',
  'dezinfekce': 'Disinfectant',
  'houbicky-na-nadobi': 'Sponge',
  'uterky': 'Towel',
  'pytle-na-odpadky': 'Trash bag',
  'alobal': 'Aluminum foil',
  'potravinova-folie': 'Cling film',
  'pecici-papir': 'Baking paper',
  'papir-tasky': 'Tissue',
  'vlhcene-ubrousky-detske': 'Baby wipes',
  'detsky-sampon': 'Baby shampoo',
  'detsky-sprchovy-gel': 'Baby shower gel',
  'detske-mydlo': 'Baby soap',
  'detska-kosmetika': 'Baby cosmetics',
  'detske-prikrmy': 'Baby food',
  'detske-kapsicky': 'Baby pouches',
  'detske-napoje': 'Baby drinks',
  'syr-plisnovy': 'Blue cheese',
  'syr-grilovaci': 'Grilling cheese',
  'smetana-do-kavy': 'Coffee creamer',
  'slehacka-sprej': 'Whipped cream spray',
  'creme-fraiche': 'Crème fraîche',
  'ghi': 'Ghee',
  'mleko-susene': 'Powdered milk',
  'mleko-kondenzovane': 'Condensed milk',
  'syrovatka': 'Whey',
  'syrove-svacinky': 'Cheese snack',
  'uzene-maso': 'Smoked meat',
  'sekana': 'Meatloaf',
  'kabanos': 'Kabanos',
  'vnitrnosti': 'Offal',
  'veprovy-bok': 'Pork belly',
  'hovezi-zebra': 'Beef ribs',
  'zverina-kralik': 'Venison',
  'pecene-maso-hotove': 'Roasted meat',
}

async function populateProductImages() {
  const db = getDb()
  console.log('🚀 Starting product image population (English mapping pivot)...')

  let successCount = 0
  let failureCount = 0

  const types = await db.select().from(productTypes)

  for (const type of types) {
    const { key, name } = type

    // Skip if already has image
    if (type.imageRef) {
      continue
    }

    try {
      // Determine the best search query (English mapping -> Czech name)
      const searchQuery = ENGLISH_MAPPINGS[key] || name
      console.log(`🔍 Searching for: ${searchQuery} (${key})...`)

      const encodedQuery = encodeURIComponent(searchQuery)
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&titles=${encodedQuery}`

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'AnitkaProductImagePopulator/1.0 (contact: storekjan10@example.com)'
        }
      })
      if (!response.ok) throw new Error(`Wikimedia API failed: ${response.status}`)

      const data: any = await response.json()
      const pages = data.query?.pages
      if (!pages) throw new Error('No pages returned')

      const pageId = Object.keys(pages)[0]
      if (pageId === '-1') throw new Error('No matching page found')

      const imageUrl = pages[pageId]?.thumbnail?.source
      if (!imageUrl) throw new Error('No thumbnail available')

      console.log(`✅ Found image for ${searchQuery}: ${imageUrl}`)

      const imageRef = await storeProductTypeImage(key, imageUrl)

      await db
        .update(productTypes)
        .set({ imageRef })
        .where(eq(productTypes.key, key))

      successCount++
    } catch (error: any) {
      console.error(`❌ ${name} (${key}): ${error.message}`)
      failureCount++
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log(`\n✨ Population complete!`)
  console.log(`✅ Successes: ${successCount}`)
  console.log(`❌ Failures: ${failureCount}`)
}

populateProductImages().catch((error) => {
  console.error('Fatal error during population:', error)
  process.exit(1)
})
