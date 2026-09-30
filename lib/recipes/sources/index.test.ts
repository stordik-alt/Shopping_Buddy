import { describe, expect, it } from 'vitest'
import { RECIPE_SOURCE_ADAPTERS, getRecipeSourceAdapter } from '@/lib/recipes/sources'

describe('recipe source registry', () => {
  it('registers all four phase-2 Czech sources', () => {
    expect(RECIPE_SOURCE_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'recepty-cz',
      'apetit',
      'toprecepty',
      'vareni',
    ])
  })

  it('resolves adapters by source id', () => {
    expect(getRecipeSourceAdapter('apetit').name).toBe('Apetit Online')
  })

  it('rejects an unknown source', () => {
    expect(() => getRecipeSourceAdapter('unknown')).toThrow('Unknown recipe source')
  })
})
