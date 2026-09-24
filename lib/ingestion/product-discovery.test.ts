import { describe, expect, it } from 'vitest'
import { scaleUnitPrice } from '@/lib/ingestion/product-discovery'

describe('scaleUnitPrice', () => {
  it('scales the unit price by the price ratio of the same package', () => {
    // 199 Kč/kg at 19,90 Kč is 169 Kč/kg at 16,90 Kč (a 20 g cheaper offer of a 100 g pack).
    expect(scaleUnitPrice(199, 19.9, 16.9)).toBe(169)
    // ...and back up to the regular price.
    expect(scaleUnitPrice(169, 16.9, 19.9)).toBe(199)
  })

  it('rounds to haléře', () => {
    expect(scaleUnitPrice(100, 3, 1)).toBe(33.33)
  })

  it('leaves the unit price unchanged when the price does not change', () => {
    expect(scaleUnitPrice(59.9, 24.9, 24.9)).toBe(59.9)
  })
})
