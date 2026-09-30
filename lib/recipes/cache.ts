type CacheEntry<T> = { value: T; expiresAt: number }

export class RecipeCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  clear(): void {
    this.entries.clear()
  }
}

export const recipeSearchCache = new RecipeCache<unknown>(5 * 60 * 1000)
export const recipeDetailCache = new RecipeCache<unknown>(60 * 60 * 1000)
