import { describe, expect, it } from 'vitest'
import { CHECKIN_DAYS_BY_CATEGORY, findDueForCheckin, isDueForCheckin, type PantryCheckinCandidate } from '@/lib/pantry'

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
