import { describe, expect, it } from 'vitest'
import { pantryAreaEnum, pantryLocationEnum } from '@/lib/db/schema'
import {
  CHECKIN_DAYS_BY_CATEGORY,
  CHECKIN_DAYS_BY_SUBCATEGORY,
  checkinDaysFor,
  checkinSubcategoryKey,
  customPlaceIdFromKey,
  customPlaceKey,
  findDueForCheckin,
  findDuplicatePlacements,
  inferPantryLocation,
  isDueForCheckin,
  PANTRY_AREAS,
  PANTRY_LOCATIONS,
  pantryPlaceOptions,
  pantryQuantityFor,
  pantryItemAtHome,
  pantryReviewOrder,
  placeKeyOf,
  splitPantryReview,
  summarizeByPlace,
  type PantryCheckinCandidate,
} from '@/lib/pantry'
import type { PantryItem, PantryPlace } from '@/lib/types'

const NOW = new Date('2026-09-21T08:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

const candidate = (overrides: Partial<PantryCheckinCandidate> = {}): PantryCheckinCandidate => ({
  category: 'Potraviny',
  addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny),
  askedAt: null,
  ...overrides,
})

describe('isDueForCheckin', () => {
  it('is due exactly at the category interval since being added, never asked before', () => {
    expect(isDueForCheckin(candidate({ addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny) }), NOW)).toBe(true)
  })

  it('is not due before the interval has elapsed', () => {
    expect(isDueForCheckin(candidate({ addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny - 1) }), NOW)).toBe(false)
  })

  it('uses a longer interval for a category with a longer assumed shelf life', () => {
    const item = candidate({ category: 'Drogerie', addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny) })
    // Potraviny's interval has passed, but Drogerie's (longer) hasn't yet.
    expect(isDueForCheckin(item, NOW)).toBe(false)
  })

  it('re-asks once the interval has passed again since the last time it was asked', () => {
    const item = candidate({ addedAt: daysAgo(100), askedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny) })
    expect(isDueForCheckin(item, NOW)).toBe(true)
  })

  it('does not re-ask before the interval has passed again since it was last asked', () => {
    const item = candidate({ addedAt: daysAgo(100), askedAt: daysAgo(1) })
    expect(isDueForCheckin(item, NOW)).toBe(false)
  })

  it("uses the household's own override instead of the fixed default when one is set", () => {
    const item = candidate({ addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny) })
    // The fixed default has elapsed, but a longer household override has not.
    expect(isDueForCheckin(item, NOW, { Potraviny: CHECKIN_DAYS_BY_CATEGORY.Potraviny + 5 })).toBe(false)
    // A shorter override makes it due sooner than the fixed default would.
    const notYetByDefault = candidate({ addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny - 1) })
    expect(isDueForCheckin(notYetByDefault, NOW, { Potraviny: CHECKIN_DAYS_BY_CATEGORY.Potraviny - 1 })).toBe(true)
  })

  it("an override for a different category does not affect this item's own", () => {
    const item = candidate({ addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny) })
    expect(isDueForCheckin(item, NOW, { Drogerie: 1 })).toBe(true)
  })
})

describe('findDueForCheckin', () => {
  it('returns only the items that are actually due', () => {
    const due = candidate({ addedAt: daysAgo(CHECKIN_DAYS_BY_CATEGORY.Potraviny) })
    const notDue = candidate({ addedAt: daysAgo(1) })
    expect(findDueForCheckin([due, notDue], NOW)).toEqual([due])
  })
})

describe('inferPantryLocation', () => {
  it('sends non-food categories straight to Domácnost', () => {
    expect(inferPantryLocation('Domácnost', 'Houbičky na nádobí')).toBe('Domácnost')
    expect(inferPantryLocation('Drogerie', 'Prací prostředek')).toBe('Domácnost')
    expect(inferPantryLocation('Děti', 'Plenky')).toBe('Domácnost')
  })

  it('files clear medicine/first-aid names under Lékárnička', () => {
    expect(inferPantryLocation('Drogerie', 'Paralen 500 mg')).toBe('Lékárnička')
    expect(inferPantryLocation('Drogerie', 'Náplast textilní')).toBe('Lékárnička')
    expect(inferPantryLocation('Domácnost', 'Teploměr digitální')).toBe('Lékárnička')
  })

  it('files clear personal-care names under Drogérka', () => {
    expect(inferPantryLocation('Drogerie', 'Šampon na vlasy')).toBe('Drogérka')
    expect(inferPantryLocation('Drogerie', 'Zubní pasta')).toBe('Drogérka')
    expect(inferPantryLocation('Děti', 'Dětský sprchový gel')).toBe('Drogérka')
  })

  it('checks first-aid before personal care, so a medicated item is not filed as cosmetics', () => {
    expect(inferPantryLocation('Drogerie', 'Šampon proti lupům, léčivý')).toBe('Lékárnička')
  })

  it('never applies the non-food keywords to food — "Mléko" stays in the fridge, not a medicine folder', () => {
    expect(inferPantryLocation('Potraviny', 'Mléko polotučné')).toBe('Lednice')
    expect(inferPantryLocation('Potraviny', 'Vitamínový nápoj')).toBe('Spíž')
    expect(inferPantryLocation('Ostatní', 'Paralen')).toBeNull()
  })

  it('is unresolvable (null) for an "Ostatní" item — the category itself was already uncertain, so its location must not be guessed either', () => {
    expect(inferPantryLocation('Ostatní', 'Něco neznámého')).toBeNull()
  })

  it('recognizes a frozen food item by keyword', () => {
    expect(inferPantryLocation('Potraviny', 'Mražená zelenina')).toBe('Mrazák')
    expect(inferPantryLocation('Potraviny', 'Zmrzlina vanilková')).toBe('Mrazák')
  })

  it('recognizes a chilled food item by keyword', () => {
    expect(inferPantryLocation('Potraviny', 'Mléko polotučné')).toBe('Lednice')
    expect(inferPantryLocation('Potraviny', 'Kuřecí prsa')).toBe('Lednice')
  })

  it('recognizes a shelf-stable pantry item by keyword', () => {
    expect(inferPantryLocation('Potraviny', 'Rýže')).toBe('Spíž')
    expect(inferPantryLocation('Potraviny', 'Těstoviny')).toBe('Spíž')
    expect(inferPantryLocation('Potraviny', 'Konzervovaný hrášek')).toBe('Spíž')
  })

  it('is unresolvable (null) for a food item matching no known storage keyword, rather than guessing the pantry shelf', () => {
    expect(inferPantryLocation('Potraviny', 'Naprosto neznámá potravina')).toBeNull()
  })

  it('matches keywords case-insensitively', () => {
    expect(inferPantryLocation('Potraviny', 'MLÉKO')).toBe('Lednice')
  })
})

describe('pantryQuantityFor', () => {
  const pantryItem = (overrides: Partial<PantryItem> = {}): PantryItem => ({
    id: crypto.randomUUID(),
    name: 'Rýže',
    category: 'Potraviny',
    location: 'Spíž',
    quantity: 3,
    unit: 'ks',
    addedAt: '2026-09-20',
    ...overrides,
  })

  it('returns the matching item\'s quantity', () => {
    expect(pantryQuantityFor([pantryItem({ name: 'Rýže', quantity: 3 })], 'Rýže')).toBe(3)
  })

  it('matches case/whitespace-insensitively, same as matchProductByName', () => {
    expect(pantryQuantityFor([pantryItem({ name: 'Rýže', quantity: 3 })], '  RÝŽE  ')).toBe(3)
  })

  it('returns 0 for a product with no matching pantry row, rather than an error', () => {
    expect(pantryQuantityFor([pantryItem({ name: 'Rýže' })], 'Mléko')).toBe(0)
    expect(pantryQuantityFor([], 'Rýže')).toBe(0)
  })
})

describe('PANTRY_LOCATIONS', () => {
  it('offers exactly the locations the database enum accepts, in the same order — the UI can never offer one the database rejects', () => {
    expect(PANTRY_LOCATIONS).toEqual([...pantryLocationEnum.enumValues])
  })

  it('has the six Zásoby folders', () => {
    expect(PANTRY_LOCATIONS).toEqual(['Spíž', 'Lednice', 'Mrazák', 'Domácnost', 'Lékárnička', 'Drogérka'])
  })
})

describe('PANTRY_AREAS', () => {
  it('offers exactly the areas the database enum accepts, in the same order', () => {
    expect(PANTRY_AREAS).toEqual([...pantryAreaEnum.enumValues])
  })
})

describe('pantryPlaceOptions / placeKeyOf', () => {
  const custom = (overrides: Partial<PantryPlace> = {}): PantryPlace => ({ id: 'place-1', area: 'Auto', name: 'Kufr', ...overrides })

  it('lists the fixed locations first, then custom places grouped by area and named alphabetically', () => {
    const options = pantryPlaceOptions([custom({ id: 'a', area: 'Bydlení', name: 'Sklep' }), custom({ id: 'b', area: 'Auto', name: 'Schránka' }), custom({ id: 'c', area: 'Auto', name: 'Kufr' })])
    expect(options.slice(0, PANTRY_LOCATIONS.length).map((option) => option.key)).toEqual(PANTRY_LOCATIONS)
    expect(options.slice(PANTRY_LOCATIONS.length).map((option) => option.name)).toEqual(['Kufr', 'Schránka', 'Sklep'])
    expect(options.slice(0, PANTRY_LOCATIONS.length).every((option) => option.custom === false)).toBe(true)
    expect(options.slice(PANTRY_LOCATIONS.length).every((option) => option.custom === true)).toBe(true)
  })

  it('gives a custom place a key distinct from every fixed location, round-tripping its id', () => {
    const key = customPlaceKey('abc-123')
    expect(PANTRY_LOCATIONS as string[]).not.toContain(key)
    expect(customPlaceIdFromKey(key)).toBe('abc-123')
    expect(customPlaceIdFromKey('Lednice')).toBeNull()
  })

  it('keys an item by its custom place when it has one, otherwise by its fixed location', () => {
    expect(placeKeyOf({ location: 'Lednice', customPlaceId: null })).toBe('Lednice')
    expect(placeKeyOf({ location: 'Spíž', customPlaceId: 'place-1' })).toBe(customPlaceKey('place-1'))
  })
})

describe('summarizeByPlace', () => {
  const row = (overrides: Partial<PantryItem>): PantryItem => ({
    id: 'p',
    name: 'Rýže',
    category: 'Potraviny',
    location: 'Spíž',
    quantity: 3,
    unit: 'ks',
    addedAt: '2026-09-20',
    ...overrides,
  })
  const options = pantryPlaceOptions([])

  it('has an entry with zeros for every location, even with no stock at all', () => {
    const summary = summarizeByPlace([], options)
    expect(Object.keys(summary)).toEqual(PANTRY_LOCATIONS)
    for (const location of PANTRY_LOCATIONS) expect(summary[location]).toEqual({ count: 0, needsCheck: 0, outOfStock: 0 })
  })

  it('counts each row in the location it is kept in, and only there', () => {
    const summary = summarizeByPlace(
      [row({ id: '1', location: 'Spíž' }), row({ id: '2', location: 'Spíž' }), row({ id: '3', location: 'Lékárnička', name: 'Ibalgin' }), row({ id: '4', location: 'Drogérka', name: 'Šampon' })],
      options,
    )
    expect(summary.Spíž.count).toBe(2)
    expect(summary.Lékárnička.count).toBe(1)
    expect(summary.Drogérka.count).toBe(1)
    expect(summary.Lednice.count).toBe(0)
  })

  it('flags rows the check-in cron asked about, and rows at zero quantity', () => {
    const summary = summarizeByPlace([row({ id: '1', location: 'Lednice', askedAt: '2026-09-21' }), row({ id: '2', location: 'Lednice', quantity: 0 }), row({ id: '3', location: 'Lednice' })], options)
    expect(summary.Lednice).toEqual({ count: 3, needsCheck: 1, outOfStock: 1 })
  })

  it('ignores a row with a location it does not know instead of crashing', () => {
    const unknown = row({ location: 'Sklep' as never })
    expect(() => summarizeByPlace([unknown], options)).not.toThrow()
    expect(Object.values(summarizeByPlace([unknown], options)).reduce((sum, entry) => sum + entry.count, 0)).toBe(0)
  })

  it('counts a custom-place row under its custom place, not its (harmless default) fixed location', () => {
    const place = { id: 'place-1', area: 'Auto' as const, name: 'Kufr' }
    const summary = summarizeByPlace([row({ id: '1', location: 'Spíž', customPlaceId: 'place-1' })], pantryPlaceOptions([place]))
    expect(summary[customPlaceKey('place-1')].count).toBe(1)
    expect(summary.Spíž.count).toBe(0)
  })
})

describe('findDuplicatePlacements', () => {
  const row = (overrides: Partial<PantryItem>): PantryItem => ({
    id: 'p',
    name: 'Mléko',
    category: 'Potraviny',
    location: 'Lednice',
    quantity: 1,
    unit: 'l',
    addedAt: '2026-09-20',
    ...overrides,
  })

  it('flags the same name kept at more than one place', () => {
    const duplicates = findDuplicatePlacements([row({ id: '1', location: 'Lednice' }), row({ id: '2', location: 'Mrazák' })])
    expect(duplicates).toEqual([{ name: 'Mléko', ids: ['1', '2'] }])
  })

  it('is case/whitespace-insensitive, matching pantryQuantityFor\'s own rule', () => {
    const duplicates = findDuplicatePlacements([row({ id: '1', name: 'mléko', location: 'Lednice' }), row({ id: '2', name: ' Mléko ', location: 'Spíž' })])
    expect(duplicates).toHaveLength(1)
  })

  it('does not flag the same name kept only at one place, even in several rows', () => {
    expect(findDuplicatePlacements([row({ id: '1', location: 'Lednice' }), row({ id: '2', location: 'Lednice' })])).toEqual([])
  })

  it('treats a custom place as distinct from any fixed location with the same underlying column value', () => {
    const duplicates = findDuplicatePlacements([row({ id: '1', location: 'Spíž', customPlaceId: null }), row({ id: '2', location: 'Spíž', customPlaceId: 'place-1' })])
    expect(duplicates).toEqual([{ name: 'Mléko', ids: ['1', '2'] }])
  })
})

describe('pantryReviewOrder', () => {
  it('puts the items the check-in asked about first, then the longest unconfirmed, then by name', () => {
    const items = [
      { name: 'Rýže', addedAt: '2026-09-20T10:00:00Z', askedAt: undefined },
      { name: 'Mléko', addedAt: '2026-09-10T10:00:00Z', askedAt: '2026-09-24T08:00:00Z' },
      { name: 'Cukr', addedAt: '2026-09-01T10:00:00Z', askedAt: undefined },
      { name: 'Áčko', addedAt: '2026-09-20T10:00:00Z', askedAt: undefined },
    ]
    expect(pantryReviewOrder(items).map((item) => item.name)).toEqual(['Mléko', 'Cukr', 'Áčko', 'Rýže'])
    expect(items[0].name).toBe('Rýže') // the input is not reordered
  })
})

describe('splitPantryReview', () => {
  it('keeps every reviewed item not marked gone, ignores marks outside the check and duplicates', () => {
    expect(splitPantryReview(['a', 'b', 'c', 'b'], ['b', 'zzz'])).toEqual({ goneIds: ['b'], keptIds: ['a', 'c'] })
    expect(splitPantryReview([], ['a'])).toEqual({ goneIds: [], keptIds: [] })
  })
})

describe('summarizeByPlace with estimates', () => {
  it('counts an item estimated as used up as one to check, once', () => {
    const base = { name: 'Mléko', category: 'Potraviny' as const, location: 'Lednice' as const, quantity: 1, unit: 'l' as const, addedAt: '2026-09-01T00:00:00Z' }
    const summary = summarizeByPlace(
      [
        { ...base, id: 'a' },
        { ...base, id: 'b', askedAt: '2026-09-20T00:00:00Z' },
        { ...base, id: 'c', askedAt: '2026-09-20T00:00:00Z' },
      ],
      pantryPlaceOptions([]),
      new Set(['a', 'c']),
    )
    expect(summary.Lednice.needsCheck).toBe(3)
  })
})

describe('pantryItemAtHome', () => {
  const base = { category: 'Potraviny' as const, location: 'Lednice' as const, unit: 'ks' as const, addedAt: '2026-09-20T00:00:00Z' }
  it('finds the tracked item in stock by name, case, accents and synonyms ignored', () => {
    const items = [
      { ...base, id: 'eggs', name: 'Vejce', quantity: 6 },
      { ...base, id: 'salt', name: 'Sůl', quantity: 1, tracking: 'off' as const },
      { ...base, id: 'milk', name: 'Mléko', quantity: 0 },
    ]
    expect(pantryItemAtHome(items, 'vajíčka')?.id).toBe('eggs')
    expect(pantryItemAtHome(items, 'SŮL')).toBeNull() // not tracked
    expect(pantryItemAtHome(items, 'Mléko')).toBeNull() // none left
    expect(pantryItemAtHome(items, '  ')).toBeNull()
  })
})

describe('check-in interval by subcategory', () => {
  it('gives perishables a shorter default than long-life food', () => {
    expect(checkinDaysFor({ category: 'Potraviny', subcategory: 'Pečivo' })).toBeLessThan(checkinDaysFor({ category: 'Potraviny', subcategory: 'Konzervy' }))
  })

  it('prefers the household subcategory value, then the built-in one, then the category value', () => {
    const own = { [checkinSubcategoryKey('Potraviny', 'Pečivo')]: 2 }
    expect(checkinDaysFor({ category: 'Potraviny', subcategory: 'Pečivo' }, { Potraviny: 20 }, own)).toBe(2)
    expect(checkinDaysFor({ category: 'Potraviny', subcategory: 'Maso a uzeniny' }, { Potraviny: 20 }, own)).toBe(CHECKIN_DAYS_BY_SUBCATEGORY.Potraviny!['Maso a uzeniny'])
    expect(checkinDaysFor({ category: 'Potraviny', subcategory: null }, { Potraviny: 20 }, own)).toBe(20)
    expect(checkinDaysFor({ category: 'Drogerie', subcategory: 'Praní' })).toBe(CHECKIN_DAYS_BY_CATEGORY.Drogerie)
  })

  it('asks about bread before tinned food that was added at the same time', () => {
    const added = daysAgo(10)
    expect(isDueForCheckin(candidate({ subcategory: 'Pečivo', addedAt: added }), NOW)).toBe(true)
    expect(isDueForCheckin(candidate({ subcategory: 'Konzervy', addedAt: added }), NOW)).toBe(false)
  })
})
