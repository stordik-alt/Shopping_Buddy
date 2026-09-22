import { describe, expect, it } from 'vitest'
import { CHECKIN_DAYS_BY_CATEGORY, findDueForCheckin, inferPantryLocation, isDueForCheckin, pantryQuantityFor, type PantryCheckinCandidate } from '@/lib/pantry'
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
