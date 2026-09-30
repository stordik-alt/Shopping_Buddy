import type { Recipe, RecipeSearchResult, RecipeSourceAdapter } from '@/lib/recipes/types'
import { parseRecipeJsonLd } from '@/lib/recipes/parser'
import { fetchRecipeHtml } from '@/lib/recipes/fetch'
import { extractRecipeLinks } from '@/lib/recipes/sources/html'
import { isRecipeTitleRelevant } from '@/lib/recipes/relevance'

type PortalConfig = {
  id: string
  name: string
  domain: string
  imageDomains?: string[]
  searchPageCount?: number
  searchUrl: (query: string, page?: number) => string
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

      const pageCount = Math.max(1, config.searchPageCount ?? 1)
      const allLinks = new Map<string, { url: string; title: string }>()

      for (let page = 1; page <= pageCount; page += 1) {
        const searchUrl = config.searchUrl(normalizedQuery, page)
        const html = await fetchRecipeHtml(searchUrl, [config.domain])
        const links = extractRecipeLinks(html, searchUrl, config.recipePath)
        for (const link of links) {
          if (!allLinks.has(link.url)) allLinks.set(link.url, link)
        }
      }

      const relevantLinks = [...allLinks.values()].filter((link) => isRecipeTitleRelevant(link.title, normalizedQuery))

      return relevantLinks.map((link) => ({
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
