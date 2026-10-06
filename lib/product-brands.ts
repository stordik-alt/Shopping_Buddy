// Brand dictionary (značky): a manufacturer's or product line's name says what a product is even
// when the rest of the name does not — "ORION STUD.PECET" on a receipt is a sweet, "KUBIK JAHODA"
// a children's drink, not a strawberry. Owner request 2026-10-06 ("Můžeme se tedy řídit i firmou,
// značkou, která to vyrábí"); concept in docs/19_BRANDS.md.
//
// A brand gives a product's item category, and a subcategory in one of two strengths:
//   - `decides`: the brand makes only one kind of goods (Kubík, Kofola, Milka), so its subcategory
//     beats the keyword rules — "Jupík jablko" is a drink, never an apple;
//   - otherwise the keyword rules in lib/product-subcategories.ts come first and the brand only
//     places a name they cannot ("MADETA JIH." → Mléčné výrobky), because the brand makes several
//     kinds of goods within the category ("Madeta máslo", "Madeta eidam" are both dairy anyway, but
//     "Orion kakao" is for baking).
// Pure and deterministic like the keyword rules (CLAUDE.md section 25); every brand was checked
// against the real catalog (local copy, 2026-10-06) before it was added.

import { normalizeProductText } from '@/lib/product-normalize'
import type { ItemCategory } from '@/lib/types'

type BrandRule = {
  /** The brand's display name. */
  brand: string
  /** Spellings of the brand, matched as whole words in the normalized name. */
  keywords: string[]
  category: ItemCategory
  /** One of `category`'s fixed subcategories (checked by a test); absent when the brand makes too
   *  many kinds of goods to name one. */
  subcategory?: string
  decides?: boolean
  /** The brand is also an ordinary word ("Relax", "Rio", "Toma"): it counts only as the first word
   *  of the name, where a brand stands. */
  atStart?: boolean
  /** Names with one of these words are not this brand's ("Müller Thurgau" is a wine, not Müller). */
  exclude?: string[]
}

const SWEETS_EXCLUDE = ['mražen', 'mraž', 'zmrzlin', 'nanuk', 'drink', 'nápoj']
const KITCHENWARE_WORDS = ['nůž', 'palička', 'sáček', 'sítko', 'hrnek', 'hrnec', 'pánev', 'forma', 'kráječ', 'struhadl', 'prkénk', 'miska', 'dóza', 'lžíce', 'vykrajovátk', 'cm']

// Mixed drinks carry a soft-drink brand ("Bacardi Rum a Coca-Cola"); the keyword rules place them.
const SOFT_DRINK_EXCLUDE = ['alkohol', 'obj', 'rum', 'whisk', 'vodka', 'gin', 'likér']

// The brand that comes first in the name wins ("Jacobs Milka Cappuccino" is Jacobs coffee, "Olma
// Olmíci … s Haribo" an Olma yogurt); a product line is spelled together with its parent brand, so
// the longer keyword wins ("Dobrá voda YESs" is Yess).
const BRAND_RULES: BrandRule[] = [
  // Children's drinks (owner decision 2026-10-06: Děti ▸ Dětské nápoje; Yess is Dobrá voda's line
  // for children, plain Dobrá voda stays an ordinary drink).
  { brand: 'Jupík', keywords: ['jupík'], category: 'Děti', subcategory: 'Dětské nápoje', decides: true },
  { brand: 'Kubík', keywords: ['kubík'], category: 'Děti', subcategory: 'Dětské nápoje', decides: true },
  { brand: 'Yess', keywords: ['dobrá voda yess', 'yess'], category: 'Děti', subcategory: 'Dětské nápoje', decides: true },

  // Children's goods.
  { brand: 'Pampers', keywords: ['pampers'], category: 'Děti', subcategory: 'Pleny', decides: true },
  { brand: 'Huggies', keywords: ['huggies'], category: 'Děti', subcategory: 'Pleny', decides: true },
  { brand: 'Libero', keywords: ['libero'], category: 'Děti', subcategory: 'Pleny', decides: true },
  { brand: 'Nutrilon', keywords: ['nutrilon'], category: 'Děti', subcategory: 'Kojenecké mléko' },
  { brand: 'Beba', keywords: ['beba'], category: 'Děti', subcategory: 'Kojenecké mléko' },
  { brand: 'Sunar', keywords: ['sunar'], category: 'Děti' },
  // "HiPP Mama" is tea and vitamins for nursing mothers.
  { brand: 'HiPP', keywords: ['hipp'], category: 'Děti', exclude: ['mama'] },
  { brand: 'Hami', keywords: ['hami'], category: 'Děti' },

  // Drinks.
  { brand: 'Dobrá voda', keywords: ['dobrá voda'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Mattoni', keywords: ['mattoni', 'matton'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Korunní', keywords: ['korunní'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Rajec', keywords: ['rajec'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Ondrášovka', keywords: ['ondrášovka'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Poděbradka', keywords: ['poděbradka'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Magnesia', keywords: ['magnesia'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Aquila', keywords: ['aquila'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Bonaqua', keywords: ['bonaqua'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Toma', keywords: ['toma'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, atStart: true },
  // Jupí syrups are family syrups, not the children's Jupík.
  { brand: 'Jupí', keywords: ['jupí'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Kofola', keywords: ['kofola'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Coca-Cola', keywords: ['coca cola'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Pepsi', keywords: ['pepsi'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Fanta', keywords: ['fanta'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Sprite', keywords: ['sprite'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Mirinda', keywords: ['mirinda'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Schweppes', keywords: ['schweppes'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Birell', keywords: ['birell'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Rauch', keywords: ['rauch'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Pfanner', keywords: ['pfanner'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Cappy', keywords: ['cappy'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Tymbark', keywords: ['tymbark'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  // Relax also sells sunglasses.
  { brand: 'Relax', keywords: ['relax'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, atStart: true, exclude: ['brýle'] },
  // Hello also names Hello Kitty sweets and a children's fruit snack.
  { brand: 'Hello', keywords: ['hello'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, atStart: true, exclude: ['kitty', 'svačin'] },
  { brand: 'Red Bull', keywords: ['red bull'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'Monster', keywords: ['monster energy', 'monster'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, atStart: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'San Pellegrino', keywords: ['san pellegrino'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Fritz-Kola', keywords: ['fritz kola'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Caprio', keywords: ['caprio'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Powerade', keywords: ['powerade'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: '7UP', keywords: ['7up', '7 up'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  { brand: 'FuzeTea', keywords: ['fuzetea', 'fuze tea'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Nestea', keywords: ['nestea'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Capri-Sun', keywords: ['capri sun'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Fruit Shoot', keywords: ['fruit shoot'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Granini', keywords: ['granini'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'San Benedetto', keywords: ['san benedetto'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'DrWitt', keywords: ['drwitt', 'dr witt'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Ovocňák', keywords: ['ovocňák'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Strongbow', keywords: ['strongbow'], category: 'Potraviny', subcategory: 'Alkoholické nápoje', decides: true },
  // Cocoa for a drink; "ORION GRANKO" is Granko, not an Orion sweet (Orion excludes it).
  { brand: 'Granko', keywords: ['granko'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },
  { brand: 'Big Shock', keywords: ['big shock'], category: 'Potraviny', subcategory: 'Nápoje', decides: true, exclude: SOFT_DRINK_EXCLUDE },
  // Not a brand: carried over from the earlier list of drink names, so a radler stays a drink.
  { brand: 'Radler', keywords: ['radler'], category: 'Potraviny', subcategory: 'Nápoje', decides: true },

  // Sweets. Their ice creams and drinks ("Kinder Bueno zmrzlina", "Milka Chocolate Drink") are
  // frozen food and drinks, so the keyword rules place those.
  // ORION is also a kitchenware brand ("ORION Nůž na chléb", "ORION Sítko na čaj").
  { brand: 'Orion', keywords: ['orion'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: [...SWEETS_EXCLUDE, ...KITCHENWARE_WORDS, 'granko'] },
  { brand: 'Milka', keywords: ['milka'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Lindt', keywords: ['lindt'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Kinder', keywords: ['kinder'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Ferrero', keywords: ['ferrero', 'raffaello', 'toffifee'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Haribo', keywords: ['haribo'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Merci', keywords: ['merci'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, atStart: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Ritter Sport', keywords: ['ritter sport'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Toblerone', keywords: ['toblerone'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Figaro', keywords: ['figaro'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Sedita', keywords: ['sedita', 'horalky', 'horalka'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Opavia', keywords: ['opavia', 'tatranky', 'tatranka'], category: 'Potraviny', subcategory: 'Sladkosti', exclude: SWEETS_EXCLUDE },
  { brand: 'Manner', keywords: ['manner'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Mars', keywords: ['mars', 'snickers', 'twix', 'bounty', 'milky way'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, atStart: true, exclude: SWEETS_EXCLUDE },
  { brand: 'KitKat', keywords: ['kitkat', 'kit kat'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Lentilky', keywords: ['lentilky'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Studentská pečeť', keywords: ['studentská pečeť'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Fidorka', keywords: ['fidorka'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Margot', keywords: ['margot'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Tic Tac', keywords: ['tic tac'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Mentos', keywords: ['mentos'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'JoJo', keywords: ['jojo'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },
  { brand: 'Lotus', keywords: ['lotus biscoff'], category: 'Potraviny', subcategory: 'Sladkosti', decides: true, exclude: SWEETS_EXCLUDE },

  // Salty snacks.
  { brand: "Lay's", keywords: ['lays'], category: 'Potraviny', subcategory: 'Slané pochutiny', decides: true },
  { brand: 'Pringles', keywords: ['pringles'], category: 'Potraviny', subcategory: 'Slané pochutiny', decides: true },
  { brand: 'Chio', keywords: ['chio'], category: 'Potraviny', subcategory: 'Slané pochutiny', decides: true },
  { brand: 'Bake Rolls', keywords: ['bake rolls'], category: 'Potraviny', subcategory: 'Slané pochutiny', decides: true },
  { brand: 'Pom-Bär', keywords: ['pom bar'], category: 'Potraviny', subcategory: 'Slané pochutiny', decides: true },
  { brand: 'Tuc', keywords: ['tuc'], category: 'Potraviny', subcategory: 'Slané pochutiny', decides: true, atStart: true },

  // Dairy: dairies make several dairy products, all of them dairy.
  { brand: 'Madeta', keywords: ['madeta'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Olma', keywords: ['olma'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Zott', keywords: ['zott'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Ehrmann', keywords: ['ehrmann'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Hollandia', keywords: ['hollandia'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Bohemilk', keywords: ['bohemilk'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Meggle', keywords: ['meggle'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Président', keywords: ['président'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Kunín', keywords: ['kunín'], category: 'Potraviny', subcategory: 'Mléčné výrobky', decides: true },
  { brand: 'Milbona', keywords: ['milbona'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  { brand: 'Pilos', keywords: ['pilos'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  // Not Müller-Thurgau wine, nor Dr. Müller's pharmacy goods.
  { brand: 'Müller', keywords: ['müller'], category: 'Potraviny', subcategory: 'Mléčné výrobky', exclude: ['thurgau', 'pharma', 'dr müller'] },
  { brand: 'Gervais', keywords: ['gervais'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },
  // Danone's yoghurt line: always dairy, its drinks and breakfast cups too (owner, 2026-10-06).
  { brand: 'Activia', keywords: ['activia'], category: 'Potraviny', subcategory: 'Mléčné výrobky', decides: true },
  { brand: 'Danone', keywords: ['danone'], category: 'Potraviny', subcategory: 'Mléčné výrobky' },

  // Meat.
  { brand: 'Kostelecké uzeniny', keywords: ['kostelecké'], category: 'Potraviny', subcategory: 'Maso a uzeniny' },
  { brand: 'Vodňanské kuře', keywords: ['vodňanské', 'vodňanská', 'vodňanský'], category: 'Potraviny', subcategory: 'Maso a uzeniny' },
  { brand: 'Krahulík', keywords: ['krahulík'], category: 'Potraviny', subcategory: 'Maso a uzeniny' },
  { brand: 'Váhala', keywords: ['váhala'], category: 'Potraviny', subcategory: 'Maso a uzeniny' },
  { brand: 'Pikok', keywords: ['pikok'], category: 'Potraviny', subcategory: 'Maso a uzeniny' },
  { brand: 'Herta', keywords: ['herta'], category: 'Potraviny', subcategory: 'Maso a uzeniny' },

  // Coffee and tea.
  // Jacob's Creek is a wine.
  { brand: 'Jacobs', keywords: ['jacobs'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true, exclude: ['creek'] },
  { brand: 'Tchibo', keywords: ['tchibo'], category: 'Potraviny', subcategory: 'Káva a čaj' },
  { brand: 'Lavazza', keywords: ['lavazza'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Douwe Egberts', keywords: ['douwe egberts'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Dallmayr', keywords: ['dallmayr'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Segafredo', keywords: ['segafredo'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Teekanne', keywords: ['teekanne'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Pickwick', keywords: ['pickwick'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Jemča', keywords: ['jemča'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Dilmah', keywords: ['dilmah'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },
  { brand: 'Ahmad Tea', keywords: ['ahmad'], category: 'Potraviny', subcategory: 'Káva a čaj', decides: true },

  // Fats, spices, sauces, pasta, cereals, frozen food.
  { brand: 'Rama', keywords: ['rama'], category: 'Potraviny', subcategory: 'Oleje a tuky', atStart: true },
  { brand: 'Hera', keywords: ['hera'], category: 'Potraviny', subcategory: 'Oleje a tuky', atStart: true },
  { brand: 'Flora', keywords: ['flora'], category: 'Potraviny', subcategory: 'Oleje a tuky', atStart: true },
  { brand: 'Heliol', keywords: ['heliol'], category: 'Potraviny', subcategory: 'Oleje a tuky' },
  { brand: 'Kotányi', keywords: ['kotányi'], category: 'Potraviny', subcategory: 'Koření a bylinky', decides: true },
  { brand: 'Nadir', keywords: ['nadir'], category: 'Potraviny', subcategory: 'Koření a bylinky', decides: true },
  { brand: "Hellmann's", keywords: ['hellmanns'], category: 'Potraviny', subcategory: 'Omáčky a dochucovadla' },
  { brand: 'Develey', keywords: ['develey'], category: 'Potraviny', subcategory: 'Omáčky a dochucovadla' },
  { brand: 'Heinz', keywords: ['heinz'], category: 'Potraviny', subcategory: 'Omáčky a dochucovadla' },
  { brand: 'Barilla', keywords: ['barilla'], category: 'Potraviny', subcategory: 'Těstoviny a rýže' },
  { brand: 'Panzani', keywords: ['panzani'], category: 'Potraviny', subcategory: 'Těstoviny a rýže' },
  { brand: 'De Cecco', keywords: ['de cecco'], category: 'Potraviny', subcategory: 'Těstoviny a rýže' },
  { brand: 'Emco', keywords: ['emco'], category: 'Potraviny', subcategory: 'Cereálie a snídaně' },
  { brand: "Kellogg's", keywords: ['kelloggs'], category: 'Potraviny', subcategory: 'Cereálie a snídaně' },
  { brand: 'Nowaco', keywords: ['nowaco'], category: 'Potraviny', subcategory: 'Mražené potraviny' },
  { brand: 'Algida', keywords: ['algida'], category: 'Potraviny', subcategory: 'Mražené potraviny', decides: true },
  { brand: 'Giana', keywords: ['giana'], category: 'Potraviny', subcategory: 'Konzervy' },
  { brand: 'Penam', keywords: ['penam'], category: 'Potraviny', subcategory: 'Pečivo' },
  { brand: 'Wasa', keywords: ['wasa'], category: 'Potraviny', subcategory: 'Pečivo', decides: true },
  { brand: 'Nice Bites', keywords: ['nice bites'], category: 'Potraviny', subcategory: 'Ořechy, semínka a sušené ovoce' },
  // Food brands of too many kinds of goods to name a subcategory: they only say "food", which a
  // receipt line's reader may not (2026-10-06, checked against the catalog).
  { brand: 'Vitana', keywords: ['vitana'], category: 'Potraviny' },
  { brand: 'Dr. Oetker', keywords: ['dr oetker', 'oetker'], category: 'Potraviny' },
  { brand: 'Hamé', keywords: ['hamé'], category: 'Potraviny' },
  { brand: 'Knorr', keywords: ['knorr'], category: 'Potraviny' },
  { brand: 'Maggi', keywords: ['maggi'], category: 'Potraviny' },
  { brand: 'Podravka', keywords: ['podravka'], category: 'Potraviny' },
  { brand: 'Lipton', keywords: ['lipton'], category: 'Potraviny' },

  // Drugstore.
  { brand: 'Colgate', keywords: ['colgate'], category: 'Drogerie', subcategory: 'Hygiena' },
  { brand: 'Elmex', keywords: ['elmex'], category: 'Drogerie', subcategory: 'Hygiena' },
  { brand: 'Gillette', keywords: ['gillette'], category: 'Drogerie', subcategory: 'Hygiena' },
  { brand: 'Always', keywords: ['always'], category: 'Drogerie', subcategory: 'Hygiena', atStart: true },
  { brand: 'Nivea', keywords: ['nivea'], category: 'Drogerie', subcategory: 'Kosmetika' },
  { brand: 'Garnier', keywords: ['garnier'], category: 'Drogerie', subcategory: 'Kosmetika' },
  { brand: "L'Oréal", keywords: ['loreal', 'l oreal'], category: 'Drogerie', subcategory: 'Kosmetika' },
  { brand: 'Maybelline', keywords: ['maybelline'], category: 'Drogerie', subcategory: 'Kosmetika' },
  { brand: 'Dermacol', keywords: ['dermacol'], category: 'Drogerie', subcategory: 'Kosmetika' },
  { brand: 'Schwarzkopf', keywords: ['schwarzkopf', 'schauma', 'syoss'], category: 'Drogerie', subcategory: 'Kosmetika' },
  { brand: 'Rexona', keywords: ['rexona'], category: 'Drogerie', subcategory: 'Kosmetika' },
  // dm's own drugstore brands, and supplements and hosiery sold in drugstores (2026-10-06).
  { brand: 'Balea', keywords: ['balea'], category: 'Drogerie' },
  { brand: 'ebelin', keywords: ['ebelin'], category: 'Drogerie' },
  { brand: 'Terezia', keywords: ['terezia'], category: 'Drogerie', subcategory: 'Zdraví a doplňky stravy', decides: true },
  { brand: 'Bellinda', keywords: ['bellinda'], category: 'Drogerie', subcategory: 'Doplňky a oblečení' },
  { brand: 'Visiomax', keywords: ['visiomax'], category: 'Drogerie', subcategory: 'Zdraví a doplňky stravy' },

  // Household goods.
  { brand: 'Tento', keywords: ['tento'], category: 'Domácnost', subcategory: 'Papír', decides: true, atStart: true },
  { brand: 'Zewa', keywords: ['zewa'], category: 'Domácnost', subcategory: 'Papír', decides: true },
  { brand: 'Spontex', keywords: ['spontex'], category: 'Domácnost', subcategory: 'Úklid' },
  { brand: 'Profissimo', keywords: ['profissimo'], category: 'Domácnost' },
  { brand: 'Denkmit', keywords: ['denkmit'], category: 'Domácnost' },
]

export type BrandMatch = {
  brand: string
  category: ItemCategory
  subcategory: string | null
  decides: boolean
}

type CompiledBrand = BrandRule & { padded: string[]; paddedExclude: string[] }

// Normalized once at module load, the same way names are normalized before matching; padded with
// spaces so a keyword matches only whole words (" tuc " never in "tucne").
const COMPILED: CompiledBrand[] = BRAND_RULES.map((rule) => ({
  ...rule,
  padded: rule.keywords.map((keyword) => ` ${normalizeProductText(keyword)} `),
  paddedExclude: (rule.exclude ?? []).map((word) => ` ${normalizeProductText(word)}`),
}))

// A children's line of a grown-up brand ("NIVEA Kids", "elmex Junior", "Rajec kojenecká voda") is
// not where the brand's own category says — the brand tells nothing about it, so other evidence
// (the retailer's category, the receipt reader's, the keyword rules) decides.
const CHILD_LINE_WORDS = [' baby', ' babies', ' kids', ' junior', ' detsk', ' kojenec', ' pro deti', ' batol']

/** The brand a name already normalized by `normalizeProductText` belongs to, or `null`. */
export function brandOf(normalizedName: string): BrandMatch | null {
  const haystack = ` ${normalizedName} `
  let best: { rule: CompiledBrand; index: number; length: number } | null = null
  for (const rule of COMPILED) {
    if (rule.paddedExclude.some((word) => haystack.includes(word))) continue
    for (const keyword of rule.padded) {
      const index = haystack.indexOf(keyword)
      if (index < 0 || (rule.atStart && index > 0)) continue
      if (!best || index < best.index || (index === best.index && keyword.length > best.length)) best = { rule, index, length: keyword.length }
    }
  }
  if (!best) return null
  const { rule } = best
  if (rule.category !== 'Děti' && CHILD_LINE_WORDS.some((word) => haystack.includes(word))) return null
  return { brand: rule.brand, category: rule.category, subcategory: rule.subcategory ?? null, decides: rule.decides ?? false }
}

/** A brand's item category over `otherCategory` (a retailer's, a receipt reader's) — except that a
 *  grown-up brand never takes a product out of Děti: a retailer that files "Balea sprchový gel
 *  Surfosaurus" among children's goods knows it is the brand's children's line even when the name
 *  says no "kids" (2026-10-06). `otherCategory` when the name names no known brand. */
export function categoryWithBrand(rawName: string, otherCategory: ItemCategory | null): ItemCategory | null {
  const brand = brandOf(normalizeProductText(rawName))
  if (!brand) return otherCategory
  return otherCategory === 'Děti' && brand.category !== 'Děti' ? otherCategory : brand.category
}

/** The subcategory a brand gives a product classified in `category`. A brand of another category says
 *  nothing there — except a children's drink brand under Potraviny, which is still a drink (a caller
 *  that did not resolve the category by brand first must not see "Jupík jablko" as an apple). */
export function brandSubcategoryIn(brand: BrandMatch, category: ItemCategory): string | null {
  if (brand.category === category) return brand.subcategory
  if (category === 'Potraviny' && brand.subcategory === 'Dětské nápoje') return 'Nápoje'
  return null
}

/** Every brand rule, for the test that checks each subcategory exists in its category. */
export const BRAND_RULES_FOR_TESTS: readonly Pick<BrandRule, 'brand' | 'category' | 'subcategory'>[] = BRAND_RULES
