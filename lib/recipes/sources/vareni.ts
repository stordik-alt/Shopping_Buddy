import type { Recipe, RecipeSearchOptions, RecipeSearchResult, RecipeSourceAdapter } from '@/lib/recipes/types'
import { parseRecipeJsonLd } from '@/lib/recipes/parser'
import { fetchRecipeHtml } from '@/lib/recipes/fetch'
import { extractRecipeLinks, extractRecipeLinksFromRss } from '@/lib/recipes/sources/html'
import { isRecipeTitleRelevant } from '@/lib/recipes/relevance'

const SEARCH_URL = (query: string) =>
  'https://www.vareni.cz/vyhledavani/?q=' + encodeURIComponent(query)

const RSS_URL = 'https://www.vareni.cz/rss/recepty.xml'
const RECIPE_PATH = /^\/recepty\//i
const RSS_CONTENT_TYPES = ['application/rss+xml', 'application/xml', 'text/xml']

function toSearchResult(link: { url: string; title: string }): RecipeSearchResult {
  return {
    id: link.url,
    sourceId: 'vareni',
    sourceName: 'Vaření.cz',
    sourceUrl: link.url,
    canonicalUrl: link.url,
    title: link.title,
  }
}

export const vareniAdapter: RecipeSourceAdapter = {
  id: 'vareni',
  name: 'Vaření.cz',
  domains: ['vareni.cz'],

  async search(query: string, options: RecipeSearchOptions = {}): Promise<RecipeSearchResult[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []

    const requestedLimit = Math.max(1, options.limit ?? 20)
    const excludedUrls = options.excludeUrls ?? new Set<string>()

    // Keep the existing query search as the primary source. The current site
    // can return HTTP 404 here, so failure is handled by the RSS fallback.
    try {
      const html = await fetchRecipeHtml(SEARCH_URL(normalizedQuery), ['vareni.cz'])
      const links = extractRecipeLinks(html, SEARCH_URL(normalizedQuery), RECIPE_PATH)
        .filter((link) => !excludedUrls.has(link.url))
        .filter((link) => isRecipeTitleRelevant(link.title, normalizedQuery))
        .slice(0, requestedLimit)

      if (links.length > 0) return links.map(toSearchResult)
    } catch {
      // Fall through to the stable recipe RSS feed.
    }

    const rss = await fetchRecipeHtml(RSS_URL, ['vareni.cz'], {
      allowedContentTypes: RSS_CONTENT_TYPES,
    })
    const feedLinks = extractRecipeLinksFromRss(rss, RSS_URL, RECIPE_PATH, 50)
      .filter((link) => !excludedUrls.has(link.url))

    // Prefer feed items that still match the scheduled query, then fill the
    // remaining slots with recent recipe entries so the import does not go
    // empty merely because the feed has no exact title match.
    const relevant = feedLinks.filter((link) => isRecipeTitleRelevant(link.title, normalizedQuery))
    const recent = feedLinks.filter((link) => !isRecipeTitleRelevant(link.title, normalizedQuery))
    return [...relevant, ...recent].slice(0, requestedLimit).map(toSearchResult)
  },

  async getRecipe(url: string): Promise<Recipe> {
    const html = await fetchRecipeHtml(url, ['vareni.cz'])
    return parseRecipeJsonLd(html, {
      sourceId: 'vareni',
      sourceName: 'Vaření.cz',
      sourceUrl: url,
      canonicalUrl: url,
    })
  },
}
