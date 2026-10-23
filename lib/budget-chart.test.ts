import { describe, expect, it } from 'vitest'
import { spendingDonutSegments } from '@/lib/budget-chart'

describe('spending donut segments', () => {
  it('groups tiny slices without dropping their original category values', () => {
    expect(spendingDonutSegments([
      { category: 'Potraviny', total: 97 },
      { category: 'Ostatní', total: 2 },
      { category: 'Auto', total: 1 },
    ])).toEqual([
      { kind: 'category', category: 'Potraviny', total: 97 },
      { kind: 'other', categories: [{ category: 'Ostatní', total: 2 }, { category: 'Auto', total: 1 }], total: 3 },
    ])
  })

  it('does not create a slice for an empty category or empty total', () => {
    expect(spendingDonutSegments([{ category: 'Potraviny', total: 100 }, { category: 'Auto', total: 0 }])).toEqual([
      { kind: 'category', category: 'Potraviny', total: 100 },
    ])
    expect(spendingDonutSegments([{ category: 'Potraviny', total: 0 }])).toEqual([])
  })
})
