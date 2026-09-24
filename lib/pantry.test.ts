import { describe, expect, it } from 'vitest'
import { pantryLocationEnum } from '@/lib/db/schema'
import { CHECKIN_DAYS_BY_CATEGORY, findDueForCheckin, inferPantryLocation, isDueForCheckin, PANTRY_LOCATIONS, pantryQuantityFor, summarizeByLocation, type PantryCheckinCandidate } from '@/lib/pantry'
import type { PantryItem } from '@/lib/types'

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

describe('summarizeByLocation', () => {
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

  it('has an entry with zeros for every location, even with no stock at all', () => {
    const summary = summarizeByLocation([])
    expect(Object.keys(summary)).toEqual(PANTRY_LOCATIONS)
    for (const location of PANTRY_LOCATIONS) expect(summary[location]).toEqual({ count: 0, needsCheck: 0, outOfStock: 0 })
  })

  it('counts each row in the location it is kept in, and only there', () => {
    const summary = summarizeByLocation([
      row({ id: '1', location: 'Spíž' }),
      row({ id: '2', location: 'Spíž' }),
      row({ id: '3', location: 'Lékárnička', name: 'Ibalgin' }),
      row({ id: '4', location: 'Drogérka', name: 'Šampon' }),
    ])
    expect(summary.Spíž.count).toBe(2)
    expect(summary.Lékárnička.count).toBe(1)
    expect(summary.Drogérka.count).toBe(1)
    expect(summary.Lednice.count).toBe(0)
  })

  it('flags rows the check-in cron asked about, and rows at zero quantity', () => {
    const summary = summarizeByLocation([
      row({ id: '1', location: 'Lednice', askedAt: '2026-09-21' }),
      row({ id: '2', location: 'Lednice', quantity: 0 }),
      row({ id: '3', location: 'Lednice' }),
    ])
    expect(summary.Lednice).toEqual({ count: 3, needsCheck: 1, outOfStock: 1 })
  })

  it('ignores a row with a location it does not know instead of crashing', () => {
    const unknown = row({ location: 'Sklep' as never })
    expect(() => summarizeByLocation([unknown])).not.toThrow()
    expect(Object.values(summarizeByLocation([unknown])).reduce((sum, entry) => sum + entry.count, 0)).toBe(0)
  })
})
