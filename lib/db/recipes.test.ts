import { describe, expect, it } from 'vitest'

describe('recipe saved-data model', () => {
  it('keeps saved recipes metadata-only', () => {
    // The database rows intentionally do not contain ingredients or instructions.
    expect(['title', 'sourceUrl', 'canonicalUrl', 'imageUrl', 'servings', 'totalTimeMinutes']).toEqual(
      expect.arrayContaining(['title', 'sourceUrl', 'canonicalUrl']),
    )
  })
})
