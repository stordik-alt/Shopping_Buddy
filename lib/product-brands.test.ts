import { describe, expect, it } from 'vitest'
import { BRAND_RULES_FOR_TESTS, brandOf, categoryWithBrand } from '@/lib/product-brands'
import { classifySubcategory } from '@/lib/categorization'
import { inferPantryLocation } from '@/lib/pantry'
import { normalizeProductText } from '@/lib/product-normalize'
import { classifySubcategoryByKeyword, isValidProductSubcategory } from '@/lib/product-subcategories'
import { resolveItemPlacement } from '@/lib/receipts'
import type { ItemCategory } from '@/lib/types'

const brand = (name: string) => brandOf(normalizeProductText(name))
const place = (category: ItemCategory, name: string) => classifySubcategoryByKeyword(category, normalizeProductText(name))

describe('brand dictionary', () => {
  it("names only subcategories of the brand's own category", () => {
    for (const rule of BRAND_RULES_FOR_TESTS) expect(isValidProductSubcategory(rule.category, rule.subcategory ?? null), rule.brand).toBe(true)
  })

  // Owner decision 2026-10-06: children's drinks go to Děti ▸ Dětské nápoje; Yess is Dobrá voda's
  // children's line, plain Dobrá voda is an ordinary drink.
  it.each([
    ['Kubík jahoda', 'Kubík'],
    ['KUBÍK W.VIŠEŇ 0,5L', 'Kubík'],
    ['JUPİK JABLKO 0,5L', 'Jupík'],
    ['Dobrá voda YESs s příchutí jahoda neperlivá 0,5l', 'Yess'],
    ['YESS POMERANČ 0,5L', 'Yess'],
  ])("%s is the children's drink %s", (name, expected) => {
    expect(brand(name)).toEqual({ brand: expected, category: 'Děti', subcategory: 'Dětské nápoje', decides: true })
  })

  it('keeps plain Dobrá voda and Jupí syrups among ordinary drinks', () => {
    expect(brand('Dobrá voda neperlivá 1,5l')).toMatchObject({ brand: 'Dobrá voda', category: 'Potraviny', subcategory: 'Nápoje' })
    expect(brand('Jupí Sirup malina 0,7l')).toMatchObject({ brand: 'Jupí', category: 'Potraviny', subcategory: 'Nápoje' })
  })

  it('reads a receipt abbreviation by its brand', () => {
    expect(brand('ORION STUD.PECET 180G')).toMatchObject({ brand: 'Orion', subcategory: 'Sladkosti' })
    expect(brand('MADETA JIH.EIDAM 30%')).toMatchObject({ brand: 'Madeta', subcategory: 'Mléčné výrobky' })
  })

  it('takes the brand that comes first in the name', () => {
    expect(brand('Jacobs Milka Cappuccino')).toMatchObject({ brand: 'Jacobs' })
    expect(brand('Olma Olmíci jogurtoví vanilkoví s Haribo Tropi frutti')).toMatchObject({ brand: 'Olma' })
  })

  it("says nothing where the name is not the brand's goods", () => {
    expect(brand('ORION Nůž na chléb Classic 17,5 cm')).toBeNull()
    expect(brand('Bacardi Rum a Coca-Cola 5% obj.')).toBeNull()
    expect(brand('Relax sluneční brýle Bianca')).toBeNull()
    expect(brand('Müller Thurgau 2023 suché bílé')).toBeNull()
    expect(brand('Dr. Müller PHARMA pastilky se šalvějí')).toBeNull()
    expect(brand('Hello kitty Gumové bonbony 175 g')).toBeNull()
    expect(brand("Jacob's Creek Shiraz Cabernet víno 0,75l")).toBeNull()
  })

  it("leaves a grown-up brand's children's line to other evidence", () => {
    expect(brand('NIVEA Kids sprchový gel, šampon a kondicionér 3 v 1')).toBeNull()
    expect(brand('elmex Junior zubní pasta 75 ml')).toBeNull()
    expect(brand('NIVEA sprchový gel Creme Care, 500 ml')).toMatchObject({ category: 'Drogerie' })
  })

  it('counts an ordinary word as a brand only at the start of the name', () => {
    expect(brand('Relax Multivitamin 1l')).toMatchObject({ brand: 'Relax' })
    expect(brand('Koupel relax levandule')).toBeNull()
    expect(brand('Toma Natura jablko 1l')).toMatchObject({ brand: 'Toma' })
  })

  it("gives the brand's item category over another, or the other without a brand", () => {
    expect(categoryWithBrand('KUBIK JAHODA 0,5L', 'Potraviny')).toBe('Děti')
    expect(categoryWithBrand('Colgate 50 ml', 'Potraviny')).toBe('Drogerie')
    expect(categoryWithBrand('Rohlík tukový', 'Potraviny')).toBe('Potraviny')
    expect(categoryWithBrand('Rohlík tukový', null)).toBeNull()
  })

  it("never takes a product out of Děti for a grown-up brand (a children's line without 'kids' in the name)", () => {
    expect(categoryWithBrand('Balea sprchový gel Surfosaurus 2 v 1, 300 ml', 'Děti')).toBe('Děti')
    expect(categoryWithBrand('Balea sprchový gel Surfosaurus 2 v 1, 300 ml', 'Potraviny')).toBe('Drogerie')
  })
})

describe('subcategory by brand', () => {
  it("places a children's drink, also under Potraviny, never among fruit", () => {
    expect(place('Děti', 'Kubík jahoda')).toBe('Dětské nápoje')
    expect(place('Potraviny', 'Jupík jablko')).toBe('Nápoje')
  })

  it("lets a one-kind brand beat a dairy or fruit word in the name", () => {
    expect(place('Potraviny', 'Milka čokoláda mléčná')).toBe('Sladkosti')
    expect(place('Potraviny', 'ORION Banány želé tyčinka v hořké čokoládě')).toBe('Sladkosti')
    expect(place('Potraviny', 'Relax Sirup jablko pomeranč 700ml')).toBe('Nápoje')
  })

  it("leaves a sweets brand's ice cream and drinks to the keyword rules", () => {
    expect(place('Potraviny', 'Kinder Bueno Mražený krém 4 ks 360ml')).toBe('Mražené potraviny')
    expect(place('Potraviny', 'Milka Čokoládový nápoj')).toBe('Nápoje')
  })

  it('places by brand only what the keyword rules cannot, for a brand of several goods', () => {
    expect(place('Potraviny', 'MADETA BALKAN 115G')).toBe('Mléčné výrobky')
    expect(place('Potraviny', 'Madeta Jihočeské máslo 82%')).toBe('Mléčné výrobky')
    expect(place('Potraviny', 'Kotányi Mleté maso')).toBe('Koření a bylinky')
  })
})

describe('bread and flour (regression: production dry run 2026-10-06)', () => {
  it.each([
    ['Silisan Tortilly z pšeničné mouky 4x60g', 'Pečivo'],
    ['Chléb zrníčkový bez mouky', 'Pečivo'],
    ['Mlynářova mouka pšeničná chlebová', 'Mouka a pečení'],
    ['Babiččina Volba Hladká mouka na křehké pečivo', 'Mouka a pečení'],
  ])('%s → %s', (name, expected) => {
    expect(place('Potraviny', name)).toBe(expected)
  })

  it('tells an old drink-brand substring from the brand itself', () => {
    expect(place('Potraviny', 'BILLA Ready Tomatová polévka 400g')).toBe('Lahůdky a hotová jídla')
    expect(place('Potraviny', 'Fantasia Jogurt s jahodami')).toBe('Mléčné výrobky')
    expect(place('Potraviny', "Jacob's Creek Merlot víno 0,75l")).toBe('Alkoholické nápoje')
  })
})

describe('placing a receipt line and a pantry row by brand', () => {
  it("puts a children's drink among children's goods, on the shelf", () => {
    expect(resolveItemPlacement(null, 'Potraviny', 'KUBIK JAHODA 0,5L')).toEqual({ category: 'Děti', location: 'Spíž' })
  })

  it("puts children's food on the shelf or in the fridge, other children's goods in Domácnost", () => {
    expect(inferPantryLocation('Děti', 'Jupík jahoda 0,5l')).toBe('Spíž')
    expect(inferPantryLocation('Děti', 'HiPP BIO příkrm Karotka s bramborami, 125 g')).toBe('Spíž')
    expect(inferPantryLocation('Děti', 'HiPP BIO Mléčný dezert banán a kakao')).toBe('Lednice')
    expect(inferPantryLocation('Děti', 'Plenky')).toBe('Domácnost')
  })

  it('still falls back to the reader category without a brand', () => {
    expect(resolveItemPlacement(null, 'Potraviny', 'Mražená zelenina')).toEqual({ category: 'Potraviny', location: 'Mrazák' })
  })
})

// Recognition improvements of 2026-10-06, each measured against the local catalog copy; the
// negative cases are the false positives found while measuring.
describe('receipt lines read with their abbreviations spelled out', () => {
  it.each([
    ['Kuř.prsní řízky', 'Potraviny', 'Maso a uzeniny'],
    ['PRIBIN.KAPS.JAH.70G', 'Potraviny', 'Mléčné výrobky'],
    ['POMERÁNĀE', 'Potraviny', 'Ovoce a zelenina'],
    ['MAT.BILE HROZNY 1,5L', 'Potraviny', 'Nápoje'],
    ['ČESNEK.POMAZ.SE SÝR.', 'Potraviny', 'Džemy, med a pomazánky'],
    ['SPX HOUB.MEGAMAX 5KS', 'Domácnost', 'Úklid'],
    ['ALB SALAT L.GEM 2KS', 'Potraviny', 'Ovoce a zelenina'],
  ] as const)('%s → %s ▸ %s', (name, category, subcategory) => {
    expect(classifySubcategory(category, name, null)?.subcategory).toBe(subcategory)
  })

  it('never changes a name the rules already place as printed', () => {
    expect(classifySubcategory('Potraviny', 'Mléko polotučné 1l', null)?.subcategory).toBe('Mléčné výrobky')
  })
})

describe('keywords and brands added on 2026-10-06', () => {
  it.each([
    ['Nachmelená opice Irish stout 12° láhev', 'Alkoholické nápoje'],
    ['Clock APA 12°', 'Alkoholické nápoje'],
    ['Srdce domova Pařížský salát 400g', 'Lahůdky a hotová jídla'],
    ['Rukola praná, vanička', 'Ovoce a zelenina'],
    ['Česká Farma Salát římský', 'Ovoce a zelenina'],
    ['LA TORRENTE loupaná rajčata 400g', 'Konzervy'],
    ['BILLA Okurky ve sladkokyselém nálevu 4-7 cm 670g', 'Konzervy'],
    ['GRIZLY Švestky sušené', 'Ořechy, semínka a sušené ovoce'],
    ['Bonitas BIO Sezam loupaný', 'Ořechy, semínka a sušené ovoce'],
    ['Racio Knäckebrot žitný', 'Pečivo'],
    ['Ölz Super Soft Sandwich', 'Pečivo'],
    ['Bohemia Hradecké tyčinky', 'Slané pochutiny'],
    ['Pom-Bär Original 50g', 'Slané pochutiny'],
    ['Husa s droby', 'Maso a uzeniny'],
    ['Authentic Rib Eye steak 40 dní', 'Maso a uzeniny'],
    ['Mečoun steak', 'Ryby a mořské plody'],
    ['Jablečný mošt 1l', 'Nápoje'],
    ['FuzeTea Broskev ibišek 1,5l', 'Nápoje'],
    ['Granini Pomeranč 1l', 'Nápoje'],
    ['ORION GRANKO 400G', 'Nápoje'],
    ['Strongbow Gold Apple, plech multipack 4x440ml', 'Alkoholické nápoje'],
    ['Český Mlynář Krupička pšeničná jemná', 'Mouka a pečení'],
    ['ARAX Ječné kroupy', 'Těstoviny a rýže'],
    ['Hřib smrkový – čerstvý, vanička', 'Ovoce a zelenina'],
    ['GRIZLY Lísková jádra loupaná', 'Ořechy, semínka a sušené ovoce'],
    ['JoJo Kyselé Žížalky', 'Sladkosti'],
    ['Gervais Original', 'Mléčné výrobky'],
  ])('%s → %s', (name, expected) => {
    expect(place('Potraviny', name)).toBe(expected)
  })

  it.each([
    // Bread "se sezamem" is bread, not seeds.
    ['Penam Hamburger sypaný sezamem (4ks)', 'Pečivo'],
    ['Wasa Delicate sezam a mořská sůl', 'Pečivo'],
    // Fries, sandwich biscuits, spice mixes, tinned fruit and "Samostatné balení" are no meat, bread, nuts or drinks.
    ['Aviko Steak fries', null],
    ['Bahlsen Hit sandwich sušenky s čokoládovou náplní', 'Sladkosti'],
    ['CLEVER SANDWICH - BISCUITS 500GR', null],
    ['Vitana Steak 28g', 'Koření a bylinky'],
    ['Vegi Steak Yakoma-so', null],
    ['Giana Ananas plátky v ananasové šťávě 565g', 'Konzervy'],
    ['Kitchin Mango plátky v mírně sladkém nálevu', 'Konzervy'],
    ['Opavia Miňonky Kakaové celomáčené oplatky Samostatné balení 50 g', 'Sladkosti'],
    ['Naše maso Wagyu Sloupnice tenké křehké plátky na sukiyaki', 'Maso a uzeniny'],
    ['Kunín krupička GRANKO 150g', 'Mléčné výrobky'],
  ])('%s → %s', (name, expected) => {
    expect(place('Potraviny', name)).toBe(expected)
  })

  it('places household and drugstore brands', () => {
    expect(place('Domácnost', 'Tento Family 150 ks')).toBe('Papír')
    expect(place('Domácnost', 'Zewa kuch. role')).toBe('Papír')
    expect(place('Drogerie', 'Bellinda legíny THERMO, černé, 38/40 S, 1 ks')).toBe('Doplňky a oblečení')
    expect(categoryWithBrand('TEREZIA Magnesium + Vitamín B6 a Meduňka, 30 ks', 'Potraviny')).toBe('Drogerie')
  })
})

// New subcategories (owner approval 2026-10-06), with the false positives found while measuring.
describe('Zdraví a doplňky stravy, Doplňky a oblečení, Zahrada', () => {
  it.each([
    ['Drogerie', 'Doppelherz Vitamín D3 vysoká dávka 2000 I.E., 50 tablet, 18,3 g', 'Zdraví a doplňky stravy'],
    ['Drogerie', 'Tussirex sirup na kašel, 120 ml', 'Zdraví a doplňky stravy'],
    ['Drogerie', 'Compeed náplast na puchýře paty, 5 ks', 'Zdraví a doplňky stravy'],
    ['Drogerie', 'Hansaplast dětské náplasti Frozen, 20 ks', 'Zdraví a doplňky stravy'],
    ['Drogerie', 'Visiomax kontaktní čočky měsíční -1,25 DP, 1 ks', 'Zdraví a doplňky stravy'],
    ['Drogerie', 'Visiomax dioptrické brýle na čtení +1,0 Dp, tmavě červené, 1 ks', 'Zdraví a doplňky stravy'],
    ['Drogerie', 'Fascino samodržicí punčochy 15 DEN, černé, vel.38-40, 1 ks', 'Doplňky a oblečení'],
    ['Drogerie', 'ebelin gumičky do vlasů transparentní, 3 ks', 'Doplňky a oblečení'],
    ['Drogerie', 'SUNDANCE sluneční brýle šedé s modrými skly, 1 ks', 'Doplňky a oblečení'],
    ['Domácnost', 'Profissimo rukavice zahradní, střední velikost, 1 pár, 1 ks', 'Zahrada'],
    // Cosmetics with a vitamin, washing capsules, denture tablets and incontinence pants stay where they were.
    ['Drogerie', 'ziaja Vitamín C.B3 Niacinamide noční krém, 50 ml', 'Kosmetika'],
    ['Drogerie', 'NIVEA dvoufázový odličovač očí s vitamínem C, 125 ml', 'Kosmetika'],
    ['Drogerie', 'Formil Kapsle na praní 3v1 Morning fresh / Golden flower 34 ks', 'Praní'],
    ['Drogerie', 'Dontodent tablety na čištění zubních náhrad, 32 ks', 'Hygiena'],
  ] as const)('%s: %s → %s', (category, name, subcategory) => {
    expect(place(category, name)).toBe(subcategory)
  })

  it('leaves incontinence pants out of the clothing subcategory', () => {
    expect(place('Drogerie', 'Jessa DISKRET inkontinenční kalhotky Super, velikost XL')).not.toBe('Doplňky a oblečení')
  })

  it('offers the new subcategories in the budget too', async () => {
    const { subcategoriesOf } = await import('@/lib/expense-categories')
    expect(subcategoriesOf('Drogerie')).toEqual(expect.arrayContaining(['Zdraví a doplňky stravy', 'Doplňky a oblečení']))
    expect(subcategoriesOf('Domácnost')).toContain('Zahrada')
  })
})

describe('subcategories A–Z', () => {
  it('lists every product and expense subcategory in Czech alphabetical order', async () => {
    const { subcategoriesOfItem, sortSubcategoryNames } = await import('@/lib/product-subcategories')
    const { EXPENSE_CATEGORY_NAMES, subcategoriesOf } = await import('@/lib/expense-categories')
    for (const category of ['Potraviny', 'Drogerie', 'Domácnost', 'Děti', 'Ostatní'] as const) expect(subcategoriesOfItem(category)).toEqual(sortSubcategoryNames(subcategoriesOfItem(category)))
    for (const category of EXPENSE_CATEGORY_NAMES) expect(subcategoriesOf(category)).toEqual(sortSubcategoryNames(subcategoriesOf(category)))
    // Czech order: "Ch" after "H", "Č" after "C".
    expect(sortSubcategoryNames(['Hygiena', 'Chléb', 'Čištění', 'Cereálie'])).toEqual(['Cereálie', 'Čištění', 'Hygiena', 'Chléb'])
  })
})

// Seasonings and spice blends (owner, 2026-10-06), and Activia.
describe('seasonings, spice blends and Activia', () => {
  it.each([
    ['Vitana Masox 10x11g', 'Omáčky a dochucovadla'],
    ['Vitana Masox šťáva na maso', 'Omáčky a dochucovadla'],
    ['Vitana Šťáva vepřová', 'Omáčky a dochucovadla'],
    ['Vitana Šťáva k masu 56g', 'Omáčky a dochucovadla'],
    ['Knorr Bohatý Bujón Hovězí 4 ks 112g', 'Omáčky a dochucovadla'],
    ['Knorr Bohatý bujón s chutí červeného vína 104g', 'Omáčky a dochucovadla'],
    ['Vitana Vývar zeleninový 4 ks', 'Omáčky a dochucovadla'],
    ['Knorr Hotová jíška světlá 250g', 'Omáčky a dochucovadla'],
    ['Podravka Marináda BBQ', 'Omáčky a dochucovadla'],
    ['Avokádo Kuře gril 34g', 'Koření a bylinky'],
    ['Vitana Kuře pečené bez soli', 'Koření a bylinky'],
    ['Vitana Americké brambory', 'Koření a bylinky'],
    ['Vitana Ryby 28g', 'Koření a bylinky'],
    // Meat in a marinade, soups, instant meals and a beer called "Vývar" stay what they are.
    ['Iceland Kuřecí křídla v Barbecue marinádě', 'Maso a uzeniny'],
    ['Vývar s játrovými knedlíčky 400 g', 'Lahůdky a hotová jídla'],
    ['Vitana Do hrnečku Česnečka s houstičkami 17g', 'Lahůdky a hotová jídla'],
    ['Old Cock Vývar světlý ležák 11° plech', 'Alkoholické nápoje'],
    ['ACTIVIA Nápoj Jahoda - kiwi 280g', 'Mléčné výrobky'],
    ['ACTIVIA Snídaně s vlákninou Jablko 170g', 'Mléčné výrobky'],
  ])('%s → %s', (name, expected) => {
    expect(place('Potraviny', name)).toBe(expected)
  })

  it('leaves the avocado fruit alone', () => {
    expect(place('Potraviny', 'Avokádo Hass "ready to eat", 1 ks')).not.toBe('Koření a bylinky')
  })
})
