import { describe, expect, it } from 'vitest'
import { FREE_SUBCATEGORY_MOVES, moveNeedsApproval } from '@/lib/product-subcategory-changes'

describe('moveNeedsApproval', () => {
  it('lets the first three moves through and holds the fourth for approval', () => {
    expect(FREE_SUBCATEGORY_MOVES).toBe(3)
    expect([0, 1, 2].map(moveNeedsApproval)).toEqual([false, false, false])
    expect([3, 4, 10].map(moveNeedsApproval)).toEqual([true, true, true])
  })
})
