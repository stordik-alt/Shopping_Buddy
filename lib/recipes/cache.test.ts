import { describe, expect, it } from 'vitest'
import { RecipeCache } from '@/lib/recipes/cache'

describe('RecipeCache', () => {
  it('returns cached values until ttl expires', () => {
    const cache = new RecipeCache<string>(1000)
    cache.set('key', 'value')
    expect(cache.get('key')).toBe('value')
  })

  it('does not return expired values', () => {
    const cache = new RecipeCache<string>(0)
    cache.set('key', 'value')
    expect(cache.get('key')).toBeUndefined()
  })

  it('can be cleared', () => {
    const cache = new RecipeCache<string>(1000)
    cache.set('key', 'value')
    cache.clear()
    expect(cache.get('key')).toBeUndefined()
  })
})
