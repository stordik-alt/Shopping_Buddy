export type RecipeIngredient = {
  id: string
  originalText: string
  quantity?: number
  unit?: string
  name: string
  scalable: boolean
}

export type Recipe = {
  id: string
  sourceId: string
  sourceName: string
  sourceUrl: string
  canonicalUrl: string
  title: string
  description?: string
  imageUrl?: string
  servings?: number
  servingsText?: string
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  totalTimeMinutes?: number
  category?: string
  cuisine?: string
  ratingValue?: number
  ratingScale?: number
  ratingCount?: number
  ratingSource?: string
  ingredients: RecipeIngredient[]
  fetchedAt: string
  parserVersion: number
}

export type RecipeSearchResult = Pick<
  Recipe,
  'id' | 'sourceId' | 'sourceName' | 'sourceUrl' | 'canonicalUrl' | 'title' |
  'description' | 'imageUrl' | 'servings' | 'servingsText' | 'totalTimeMinutes' |
  'ratingValue' | 'ratingScale' | 'ratingCount' | 'ratingSource'
>

export type SavedRecipe = RecipeSearchResult & {
  savedAt: string
  viewedAt?: string
  viewCount?: number
}

export type RecipeSearchOptions = {
  limit?: number
  excludeUrls?: ReadonlySet<string>
}

export type RecipeSourceAdapter = {
  id: string
  name: string
  domains: string[]
  imageDomains?: string[]
  search(query: string, options?: RecipeSearchOptions): Promise<RecipeSearchResult[]>
  getRecipe(url: string): Promise<Recipe>
}
