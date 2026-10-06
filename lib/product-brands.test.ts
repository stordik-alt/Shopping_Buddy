import { describe, expect, it } from 'vitest'
import { BRAND_RULES_FOR_TESTS, brandOf, categoryByBrand } from '@/lib/product-brands'
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

  it('gives the item category of a raw name, or null', () => {
    expect(categoryByBrand('KUBIK JAHODA 0,5L')).toBe('Děti')
    expect(categoryByBrand('Colgate 50 ml')).toBe('Drogerie')
    expect(categoryByBrand('Rohlík tukový')).toBeNull()
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
