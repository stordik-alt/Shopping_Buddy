import type { Recipe, RecipeSearchResult, RecipeSearchOptions, RecipeSourceAdapter } from '@/lib/recipes/types'
import { parseRecipeJsonLd } from '@/lib/recipes/parser'
import { fetchRecipeHtml } from '@/lib/recipes/fetch'
import { extractRecipeLinks } from '@/lib/recipes/sources/html'
import { isRecipeTitleRelevant } from '@/lib/recipes/relevance'

type PortalConfig = {
  id: string
  name: string
  domain: string
  imageDomains?: string[]
  maxSearchPages?: number
  searchUrl: (query: string, page?: number) => string
  fallbackSearchUrls?: (query: string, page?: number) => string[]
  recipePath: RegExp
}

function createPortalAdapter(config: PortalConfig): RecipeSourceAdapter {
  return {
    id: config.id,
    name: config.name,
    domains: [config.domain],
    imageDomains: config.imageDomains,

    async search(query: string, options: RecipeSearchOptions = {}): Promise<RecipeSearchResult[]> {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) return []
      const requestedLimit = Math.max(1, options.limit ?? 20)
      const excludedUrls = options.excludeUrls ?? new Set<string>()
      const maxPages = Math.max(1, Math.min(config.maxSearchPages ?? 20, 20))
      const allLinks = new Map<string, { url: string; title: string }>()
      let pagesWithoutNewLinks = 0

      for (let page = 1; page <= maxPages; page += 1) {
        const searchUrls = [
          config.searchUrl(normalizedQuery, page),
          ...(config.fallbackSearchUrls?.(normalizedQuery, page) ?? []),
        ]
        let pageAddedLinks = 0
        let fetchedAnyPage = false
        let lastFetchError: unknown = undefined

        for (const searchUrl of searchUrls) {
          try {
            const html = await fetchRecipeHtml(searchUrl, [config.domain])
            fetchedAnyPage = true
            const links = extractRecipeLinks(html, searchUrl, config.recipePath)
            for (const link of links) {
              if (!allLinks.has(link.url)) {
                allLinks.set(link.url, link)
                pageAddedLinks += 1
              }
            }

            if (links.length > 0) break
          } catch (error) {
            lastFetchError = error
          }
        }

        if (!fetchedAnyPage && lastFetchError) throw lastFetchError
        for (const link of links) {
          if (!allLinks.has(link.url)) {
            allLinks.set(link.url, link)
            pageAddedLinks += 1
          }
        }
        pagesWithoutNewLinks = pageAddedLinks === 0 ? pagesWithoutNewLinks + 1 : 0
        const relevantCount = [...allLinks.values()].filter(
          (link) => !excludedUrls.has(link.url) && isRecipeTitleRelevant(link.title, normalizedQuery),
        ).length
        if (relevantCount >= requestedLimit) break
        if (links.length === 0 || pagesWithoutNewLinks >= 2) break
      }

      const relevantLinks = [...allLinks.values()]
        .filter((link) => !excludedUrls.has(link.url) && isRecipeTitleRelevant(link.title, normalizedQuery))
        .slice(0, requestedLimit)

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
