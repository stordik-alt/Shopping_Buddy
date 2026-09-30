import type { Recipe, RecipeSearchResult, RecipeSourceAdapter } from '@/lib/recipes/types'
import { parseRecipeJsonLd } from '@/lib/recipes/parser'
import { fetchRecipeHtml } from '@/lib/recipes/fetch'
import { extractRecipeLinks } from '@/lib/recipes/sources/html'

type PortalConfig = {
  id: string
  name: string
  domain: string
  imageDomains?: string[]
  searchUrl: (query: string) => string
  recipePath: RegExp
}

function createPortalAdapter(config: PortalConfig): RecipeSourceAdapter {
  return {
    id: config.id,
    name: config.name,
    domains: [config.domain],
    imageDomains: config.imageDomains,

    async search(query: string): Promise<RecipeSearchResult[]> {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) return []

      const searchUrl = config.searchUrl(normalizedQuery)
      const html = await fetchRecipeHtml(searchUrl, [config.domain])
      const links = extractRecipeLinks(html, searchUrl, config.recipePath)

      return links.map((link) => ({
        id: link.url,
        sourceId: config.id,
        sourceName: config.name,
        sourceUrl: link.url,
        canonicalUrl: link.url,
        title: link.title,
      }))
    },

    async getRecipe(url: string): Promise<Recipe> {
      const html = await fetchRecipeHtml(url, [config.domain])
      return parseRecipeJsonLd(html, {
        sourceId: config.id,
        sourceName: config.name,
        sourceUrl: url,
        canonicalUrl: url,
      })
    },
  }
}

export { createPortalAdapter }
