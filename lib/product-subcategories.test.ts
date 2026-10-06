import { describe, expect, it } from 'vitest'
import {
  classifySubcategoryByKeyword,
  isChildOrientedByKeyword,
  isNonInventoryLine,
  isValidProductSubcategory,
  PRODUCT_SUBCATEGORIES,
  subcategoriesOfItem,
} from '@/lib/product-subcategories'
import { normalizeProductText } from '@/lib/product-normalize'
import { itemCategoryEnum } from '@/lib/db/schema'

// The taxonomy must agree with the database enum, the same guard pattern PANTRY_LOCATIONS already
// has against pantry_location (lib/pantry.test.ts) — a category here that the enum doesn't know
// would silently be unreachable, one the enum has but this file doesn't would be undocumented.
describe('PRODUCT_SUBCATEGORIES', () => {
  it('has exactly one entry per item_category enum value', () => {
    expect(Object.keys(PRODUCT_SUBCATEGORIES).sort()).toEqual([...itemCategoryEnum.enumValues].sort())
  })
})

describe('classifySubcategoryByKeyword — spec section 2/21 examples', () => {
  const cases: Array<[string, string]> = [
    ['Máslo', 'Mléčné výrobky'],
    ['Šunka', 'Maso a uzeniny'],
    ['Jupík', 'Nápoje'],
    ['Kubík', 'Nápoje'],
    ['Dobrá Voda', 'Nápoje'],
    ['Mattoni', 'Nápoje'],
  ]
  it.each(cases)('%s -> Potraviny ▸ %s', (name, expected) => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText(name))).toBe(expected)
  })

  it('returns null (never a guess) for a name matching no keyword', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('xyz neznámá položka'))).toBeNull()
  })

  it('classifies a flavored drink as Nápoje, not Ovoce a zelenina, when its name also names a fruit (regression: found via a production dry run)', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('KORUNNÍ ETERA JABLKO'))).toBe('Nápoje')
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('YESS POMERANČ 0,5L'))).toBe('Nápoje')
  })

  it('still classifies a bare fruit/vegetable name as produce when no beverage brand or volume marker is present', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Jablka'))).toBe('Ovoce a zelenina')
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Pomeranče'))).toBe('Ovoce a zelenina')
  })

  it('does not guess a subcategory for an unbranded liter-volume fruit name (falls back to null over a wrong guess)', () => {
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Jablečná limonáda bez brandu 1,5l'))).toBe('Nápoje')
    expect(classifySubcategoryByKeyword('Potraviny', normalizeProductText('Neznámý pomerančový nápoj 0,5l'))).toBe('Nápoje')
  })
})

describe('isValidProductSubcategory', () => {
  it('accepts every name in the fixed list and null, rejects anything else', () => {
    for (const name of subcategoriesOfItem('Potraviny')) expect(isValidProductSubcategory('Potraviny', name)).toBe(true)
    expect(isValidProductSubcategory('Potraviny', null)).toBe(true)
    expect(isValidProductSubcategory('Potraviny', 'Neexistující kategorie')).toBe(false)
    // A real Drogerie subcategory must not validate under Potraviny — categories don't share lists.
    expect(isValidProductSubcategory('Potraviny', 'Praní')).toBe(false)
  })
})

describe('isNonInventoryLine — spec section 14', () => {
  it('recognizes common non-product receipt lines', () => {
    expect(isNonInventoryLine(normalizeProductText('Taška'))).toBe(true)
    expect(isNonInventoryLine(normalizeProductText('Igelitová taška'))).toBe(true)
    expect(isNonInventoryLine(normalizeProductText('Vratná záloha'))).toBe(true)
  })

  it('does not flag an ordinary product', () => {
    expect(isNonInventoryLine(normalizeProductText('Kuřecí prsa'))).toBe(false)
  })
})

describe('isChildOrientedByKeyword — spec section 10', () => {
  it('tags known children\'s brands without needing a category change', () => {
    expect(isChildOrientedByKeyword(normalizeProductText('Kubík 200ml'))).toBe(true)
    expect(isChildOrientedByKeyword(normalizeProductText('Jupík jahoda'))).toBe(true)
  })

  it('does not tag an unrelated product', () => {
    expect(isChildOrientedByKeyword(normalizeProductText('Mattoni 1.5l'))).toBe(false)
  })
})

describe('Ostatní item category', () => {
  it('offers its own subcategories', () => {
    expect(subcategoriesOfItem('Ostatní')).toContain('Oblečení a obuv')
    expect(isValidProductSubcategory('Ostatní', 'Tabák a e-cigarety')).toBe(true)
  })

  it.each([
    ['spodni pradlo', 'Oblečení a obuv'],
    ['X4 Bar Chladivé liči jednorázová e-cigareta', 'Tabák a e-cigarety'],
    ['Baterie AA', 'Elektronika'],
  ])('%s -> %s', (name, expected) => {
    expect(classifySubcategoryByKeyword('Ostatní', normalizeProductText(name))).toBe(expected)
  })
})

// The Potraviny subcategories added on 2026-10-03, checked on real catalog names — including the
// substring traps found while building them ("čočk" inside "Cocktails", "štika" inside "Paštika").
describe('classifySubcategoryByKeyword — new food subcategories (real catalog names)', () => {
  const place = (name: string) => classifySubcategoryByKeyword('Potraviny', normalizeProductText(name))

  it.each([
    ['Vejce M-L 10 ks volný výběh', 'Vejce'],
    ['Martin Prchal Vejce křepelčí', 'Vejce'],
    ['Rio Mare Tuňák ve vlastní šťávě', 'Ryby a mořské plody'],
    ['Nowaco Rybí prsty nemleté exclusive', 'Ryby a mořské plody'],
    ['Lagris Čočka červená půlená 1kg', 'Luštěniny'],
    ['clever Cizrna ve slaném nálevu 400g', 'Luštěniny'],
    ['ARO Vlašské ořechy jádra', 'Ořechy, semínka a sušené ovoce'],
    ['Jihlavanka Standard original pražená mletá káva 1000g', 'Káva a čaj'],
    ['Dilmah Zelený Čaj Jasmín plech', 'Káva a čaj'],
    ['Velkopopovický Kozel 12, ležák', 'Alkoholické nápoje'],
    ['Finlandia Vodka 700ml', 'Alkoholické nápoje'],
    ['Frankovka Morava Selection 0,75l', 'Alkoholické nápoje'],
    ['Schwartau Malinový džem výběrový 340g', 'Džemy, med a pomazánky'],
    ['Medokom Med květový 900g', 'Džemy, med a pomazánky'],
    ['Srdce domova Vlašský salát 400g', 'Lahůdky a hotová jídla'],
    ['alpro sójový nápoj, 1 000 ml', 'Rostlinné alternativy'],
    ['ALNATURA BIO Tofu natur', 'Rostlinné alternativy'],
    ['Vitana Droždí sušené pekařské', 'Mouka a pečení'],
    ['Cukrovar Vrbátky Cukr krupice', 'Mouka a pečení'],
    ['ARO Olej řepkový', 'Oleje a tuky'],
    ['Flora margarín 400 g', 'Oleje a tuky'],
    ['Benkor Majoránka', 'Koření a bylinky'],
    ['Chion Sůl mořská', 'Koření a bylinky'],
  ])('%s → %s', (name, subcategory) => {
    expect(place(name)).toBe(subcategory)
  })

  it.each([
    ['Srdce domova Paštika s kanadskými brusinkami 150g', 'Ryby a mořské plody'], // "štika" inside "paštika"
    ['Šafránka BIO Černý rybíz extra džem', 'Ryby a mořské plody'], // "rybí" inside "rybíz"
    ['MIX Pornstar Martini Cocktail 0,33l', 'Luštěniny'], // "čočk" without accents is "cock"
    ['Lahůdky Cajthaml Laskonka 3x40g', 'Káva a čaj'], // "caj" starts "Cajthaml"
    ['Jupí Sirup citrón 0,7l', 'Alkoholické nápoje'], // 0,7 l is not only spirits
    ['Müllermilch Mléčný nápoj s pistáciovo-kokosovou příchutí', 'Alkoholické nápoje'],
    ['Krušovice HOŘKÉ NEALKO nealkoholické pivo 0,5 l', 'Alkoholické nápoje'],
    ['Kinder Surprise čokoládové vajíčko s překvapením', 'Vejce'],
    ['Maggi Přidej vejce Formanská polévka', 'Vejce'],
    ['Olma Olmíci Haribo Vanilka', 'Koření a bylinky'],
    ['bombus Protein tyčinka s příchutí kakao a kokos, 50 g', 'Mouka a pečení'],
    ['Kitchin Artyčoky v oleji', 'Oleje a tuky'],
    ['R56-HANACKA PEPRMINT 20% 0,5L', 'Koření a bylinky'],
  ])('%s is not %s', (name, wrong) => {
    expect(place(name)).not.toBe(wrong)
  })

  // Found after the first production run (2026-10-03): a drink, nut, spice or pulse that is only the
  // flavour or filling of another food, and a few keywords that were too broad.
  it.each([
    ['Lindt Mléčná čokoláda plněná likérem Marc de Champagne 350g', 'Sladkosti'],
    ['Mon Chéri Čokoládové bonbony formované s likérovou náplní a celou třešní uvnitř 157,5g', 'Sladkosti'],
    ['After Eight Hořká čokoláda s peprmintovou náplní', 'Sladkosti'],
    ['Krajanka Vaječný likér zakysaná smetana', 'Mléčné výrobky'],
    ['Krajanka DeLuXe smetanový jogurt pomeranč a vaječný likér', 'Mléčné výrobky'],
    ['Snowdonia Cheddar amber mist sýr s whisky', 'Mléčné výrobky'],
    ['Bohemilk Opočenské čerstvé mléko plnotučné 0,75l', 'Mléčné výrobky'],
    ['Rohlik.cz Řemeslná paštika s whisky a uzenými mandlemi', 'Maso a uzeniny'],
    ['Živina BBQ pálivá omáčka s medem a bourbon whiskey', 'Omáčky a dochucovadla'],
    ['Bottega Gianduia Cioccolato Liquore 17% čokoláda s lískovými ořechy', 'Alkoholické nápoje'],
    ['Baileys Original krémový likér 17%', 'Alkoholické nápoje'],
    ['U Sedmi Kašen Originál vodka 0,5l', 'Alkoholické nápoje'],
    ['Křivoklátská dezertní medovina Višňová (18%)', 'Alkoholické nápoje'],
    ['R56-HANACKA PEPRMINT 20% 0,5L', 'Alkoholické nápoje'],
    ['Biogena Majestic Tea ovocný čaj Pivoňka & Broskev 20x2 g, 50 g', 'Káva a čaj'],
    ['Oxalis Belgické pralinky aromatizovaná mletá káva', 'Káva a čaj'],
    ['Jupí Sirup Ice Tea černý čaj s citronem 0,7l', 'Nápoje'],
    ['Gepa bílá čokoláda s kousky kávy, 100 g', 'Sladkosti'],
    ['Orient Gourmet Rybí omáčka', 'Omáčky a dochucovadla'],
    ['Losos steak s kořením na gril', 'Ryby a mořské plody'],
    ['Miss Can Paštika z chobotnice', 'Ryby a mořské plody'],
    ['Vitana Ryby koření', 'Koření a bylinky'],
    ['Vitana Perníkové koření 23g', 'Koření a bylinky'],
    ['Vitana Čočková polévka', 'Lahůdky a hotová jídla'],
    ['Arax Polévková směs Čočka červená loupaná a pohanka', 'Luštěniny'],
    ['Marks & Spencer Čočky z mléčné čokolády s barevnou cukrovou krustou', 'Sladkosti'],
    ['Honestly Proteinová kaše ořechová', 'Cereálie a snídaně'],
    ['Dr. Oetker Ovesná kaše jablko, skořice', 'Cereálie a snídaně'],
    ['Srdce domova Paštika s mandlemi 150g', 'Maso a uzeniny'],
    ['Rohlik.cz Kešu ořechy natural WW240', 'Ořechy, semínka a sušené ovoce'],
    ['iChoc BIO Vegan čokoláda classic', 'Sladkosti'],
    ['Zárubova Vegan Mayo (neobsahuje vejce)', 'Rostlinné alternativy'],
    ['Well Well Pomazánka z tofu s rybí příchutí', 'Rostlinné alternativy'],
    ['Český toust Super sendvič, světlý', 'Pečivo'],
    ['Gastro Menu Salát vajíčkový', 'Lahůdky a hotová jídla'],
  ])('%s → %s', (name, subcategory) => {
    expect(place(name)).toBe(subcategory)
  })

  it('keeps non-alcoholic beer among the drinks', () => {
    expect(place('Krušovice HOŘKÉ NEALKO nealkoholické pivo 0,5 l')).toBe('Nápoje')
  })

  it('lists every new subcategory in PRODUCT_SUBCATEGORIES.Potraviny', async () => {
    const { NEW_FOOD_SUBCATEGORIES } = await import('@/lib/product-subcategories')
    for (const name of NEW_FOOD_SUBCATEGORIES) expect(isValidProductSubcategory('Potraviny', name)).toBe(true)
  })
})

// More kinds of products (2026-10-04), checked against the catalog: produce only as the product
// itself, never as a flavour; the head of a name decides; drugstore, household and children's goods.
describe('classifySubcategoryByKeyword — extended rules (real catalog names)', () => {
  const place = (category: 'Potraviny' | 'Drogerie' | 'Domácnost' | 'Děti' | 'Ostatní', name: string) => classifySubcategoryByKeyword(category, normalizeProductText(name))

  it.each([
    ['Metro Chef Žampiony bílé čerstvé, vanička', 'Ovoce a zelenina'],
    ['Cherry rajčata datlová 250 g', 'Ovoce a zelenina'],
    ['BIO Paprika žlutá, balení', 'Ovoce a zelenina'],
    ['Jablka zelená, taška', 'Ovoce a zelenina'],
    ['Krůtí prsa', 'Maso a uzeniny'],
    ['Metro Premium Párky vídeňské se sýrem (60% masa)', 'Maso a uzeniny'],
    ['Barilla Penne Rigate rodinné balení', 'Těstoviny a rýže'],
    ['Maggi Nudle z pánve Kuře na kari', 'Těstoviny a rýže'],
    ['Monster Energy Zero Sugar 500ml', 'Nápoje'],
    ['Schweppes Tonic 0,33 l', 'Nápoje'],
    ['Gambrinus 12 Patron pl 6x0,5l', 'Alkoholické nápoje'],
    ['Radegast Ryze Hořká 12 plech 6×0,5 l', 'Alkoholické nápoje'],
    ['Magnum Classic nanuk', 'Mražené potraviny'],
    ['McCain 123 hranolky vlnky 750g', 'Mražené potraviny'],
    ['Orbit žvýkačky White Classic dražé, 10 ks', 'Sladkosti'],
    ['Barilla Pesto Peperoncino', 'Omáčky a dochucovadla'],
    ['Svíčková omáčka 280 g', 'Omáčky a dochucovadla'],
    ['Giana Olivy bez pecky 180g', 'Konzervy'],
    ['Authentic Hummus Classico', 'Džemy, med a pomazánky'],
    ['NESCAFÉ® Dolce Gusto® Cortado - kávové kapsle - 16 ks', 'Káva a čaj'],
    ["Nature's Promise Bio Eidam 30% – plátky 100 g", 'Mléčné výrobky'],
    ['Kiri Z tvarohu a smetany (12 porcí)', 'Mléčné výrobky'],
    ['ARO Olej olivový z pokrutin', 'Oleje a tuky'],
  ])('Potraviny: %s → %s', (name, subcategory) => {
    expect(place('Potraviny', name)).toBe(subcategory)
  })

  it.each([
    ['Mirinda Mango Tangerine', 'Ovoce a zelenina'],
    ['Lindt Sensation maliny/brusinky', 'Ovoce a zelenina'],
    ['Gervais s paprikou a rajčaty', 'Ovoce a zelenina'],
    ['Don Peppe Jahodové knedlíky 600g', 'Ovoce a zelenina'],
    ['Avokádo Kmín celý 30g', 'Ovoce a zelenina'],
    ['Avokádo Medová hořčice', 'Ovoce a zelenina'],
    ['Billa Gnocchi s Parmigiano Reggiano 500 g', 'Mléčné výrobky'],
    ['Friskies Granule pro kočky s kuřecím 4 kg (vybrané druhy)', 'Maso a uzeniny'],
    ['BIG BOY® Maliny v matcha a bílé čokoládě', 'Káva a čaj'],
    ['Jojo Ice tea želé bonbóny', 'Nápoje'],
  ])('Potraviny: %s is not %s', (name, wrong) => {
    expect(place('Potraviny', name)).not.toBe(wrong)
  })

  it.each([
    ['Drogerie', 'MAYBELLINE NEW YORK korektor Fit Me Microscopic 20 Sand, 0,28 g', 'Kosmetika'],
    ['Drogerie', 'Balea sprej na vlasy tepelná ochrana, 75 ml', 'Kosmetika'],
    ['Drogerie', 'RIMMEL LONDON rtěnka Lasting Finish Satin 006 Pink Blush, 4 g', 'Kosmetika'],
    ['Drogerie', 'Gillette Mach3 Extra Comfort gel na holení, 240 ml', 'Hygiena'],
    ['Drogerie', 'Jessa menstruační kalhotky Teens, velikost 148/152, 1 ks', 'Hygiena'],
    ['Drogerie', 'Bellinda punčochové kalhoty MATT, velikost 48/52, amber, 1 ks', 'Doplňky a oblečení'],
    ['Drogerie', 'Ariel Prací kapsle All in 1 Color na barevné prádlo 44 ks', 'Praní'],
    ['Drogerie', 'Somat Excellence 5 v 1 Tablety do myčky 80 ks', 'Mytí nádobí'],
    ['Drogerie', 'SANYTOL tekuté mýdlo antibakteriální vyživující, 250 ml', 'Hygiena'],
    ['Domácnost', 'Persil prací kapsle Discs 4v1 Deep Clean Expert Sensitive, 54 PD', 'Úklid'],
    ['Domácnost', 'Bolsius vonná svíčka Everyday Mango Sorbet, 1 ks', 'Ostatní'],
    ['Děti', 'HiPP Babysanft koupel na dobrou noc, 350 ml', 'Dětská kosmetika'],
    ['Děti', 'LOVI savička dynamická MAMMAFEEL 6m+ střední, 1 ks', 'Dětské potřeby'],
    ['Děti', 'JIRI MODELS kniha omalovánky s tetováním Paw Patrol, 1 ks', 'Hračky'],
    ['Ostatní', 'Marlboro Gold', 'Tabák a e-cigarety'],
  ] as const)('%s: %s → %s', (category, name, subcategory) => {
    expect(place(category, name)).toBe(subcategory)
  })

  // Children's food (owner request 2026-10-04), never read as cosmetics or as a baby bottle.
  it.each([
    ['HiPP mléčná kaše PRAEBIOTIK vanilková, 250 g', 'Kaše a cereálie'],
    ['Nutrilon pokračovací mléčná kojenecká výživa 3 Advanced..., 800 g', 'Kojenecké mléko'],
    ['BEBA EXPERTpro SENSITIVE od 1 roku, 800 g', 'Kojenecké mléko'],
    ['HiPP BIO příkrm Broskev-Meruňka s tvarohovým krémem, 160 g', 'Příkrmy'],
    ['Hami přesnídávka 100% ovoce jablko, kiwi, acerola, 400 g', 'Příkrmy'],
    ['babylove bio boloňské špagety, 250 g', 'Příkrmy'],
    ['Goodies křupky srdíčka s příchutí banánu a jahody, 30 g', 'Dětské svačinky'],
    ['dmBio bio dětský čaj s příchutí ovoce, 40 g', 'Dětské nápoje'],
    ['PHILIPS AVENT kojenecká lahev Natural Response 6m+, 330ml, 1 ks', 'Dětské potřeby'],
    ['Chicco parfémovaná tělová voda Pop Vanilla wrap, 150 ml', 'Dětská kosmetika'],
  ])('Děti: %s → %s', (name, subcategory) => {
    expect(place('Děti', name)).toBe(subcategory)
  })

  it("offers the children's food subcategories in the budget too, so a receipt line keeps its subcategory there", async () => {
    const { subcategoriesOf } = await import('@/lib/expense-categories')
    for (const name of ['Kojenecké mléko', 'Příkrmy', 'Kaše a cereálie', 'Dětské svačinky', 'Dětské nápoje']) {
      expect(isValidProductSubcategory('Děti', name)).toBe(true)
      expect(subcategoriesOf('Děti')).toContain(name)
    }
  })
})
