import { describe, expect, it } from 'vitest'
import { recipeMeetsImportRatingThreshold } from '@/lib/recipes/importer'

describe('recipeMeetsImportRatingThreshold', () => {
  it('accepts 4.0 and higher on a five-point scale', () => {
    expect(recipeMeetsImportRatingThreshold(4, 5)).toBe(true)
    expect(recipeMeetsImportRatingThreshold(4.5, 5)).toBe(true)
  })

  it('rejects ratings below 4.0 on a five-point scale', () => {
    expect(recipeMeetsImportRatingThreshold(3.99, 5)).toBe(false)
  })

  it('normalizes a non-five-point source scale to five points', () => {
    expect(recipeMeetsImportRatingThreshold(8, 10)).toBe(true)
    expect(recipeMeetsImportRatingThreshold(7.9, 10)).toBe(false)
  })

  it('does not reject recipes when no rating is available', () => {
    expect(recipeMeetsImportRatingThreshold()).toBe(true)
  })
})
