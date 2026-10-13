import { describe, expect, it } from 'vitest'
import { confirmsHouseholdName, DATA_RESET_GROUPS, DATA_RESET_LABELS, normalizeResetGroups } from '@/lib/data-reset'

describe('data reset rules', () => {
  it('describes every group', () => {
    for (const group of DATA_RESET_GROUPS) expect(DATA_RESET_LABELS[group].title.length).toBeGreaterThan(0)
  })

  it('keeps only known groups, once, in canonical order', () => {
    expect(normalizeResetGroups(['expenses', 'bogus', 'shopping', 'expenses', 42, null])).toEqual(['shopping', 'expenses'])
    expect(normalizeResetGroups([])).toEqual([])
  })

  it('confirms only the exact household name, ignoring case and spaces', () => {
    expect(confirmsHouseholdName('  novákovi ', 'Novákovi')).toBe(true)
    expect(confirmsHouseholdName('Novák', 'Novákovi')).toBe(false)
    expect(confirmsHouseholdName('', '')).toBe(false)
  })
})
