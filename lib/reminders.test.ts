import { describe, expect, it } from 'vitest'
import { findStaleItems, STALE_AFTER_DAYS, type ReminderCandidate } from '@/lib/reminders'

const NOW = new Date('2026-09-21T08:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

const candidate = (overrides: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  id: crypto.randomUUID(),
  name: 'Mléko',
  done: false,
  createdAt: daysAgo(STALE_AFTER_DAYS),
  remindedAt: null,
  ...overrides,
})

describe('findStaleItems', () => {
  it('includes an item exactly at the staleness cutoff', () => {
    expect(findStaleItems([candidate({ createdAt: daysAgo(STALE_AFTER_DAYS) })], NOW)).toHaveLength(1)
  })

  it('excludes an item not yet old enough', () => {
    expect(findStaleItems([candidate({ createdAt: daysAgo(STALE_AFTER_DAYS - 1) })], NOW)).toHaveLength(0)
  })

  it('excludes an already-done item regardless of age', () => {
    expect(findStaleItems([candidate({ done: true, createdAt: daysAgo(30) })], NOW)).toHaveLength(0)
  })

  it('excludes an item already reminded about, so it never fires twice', () => {
    expect(findStaleItems([candidate({ createdAt: daysAgo(30), remindedAt: daysAgo(1) })], NOW)).toHaveLength(0)
  })

  it('returns multiple stale items from a mixed list', () => {
    const items = [candidate({ name: 'Mléko' }), candidate({ name: 'Chleba' }), candidate({ createdAt: daysAgo(0) })]
    expect(findStaleItems(items, NOW).map((i) => i.name)).toEqual(['Mléko', 'Chleba'])
  })
})
