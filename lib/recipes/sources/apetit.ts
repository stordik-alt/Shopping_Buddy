import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const apetitAdapter = createPortalAdapter({
  id: 'apetit',
  name: 'Apetit Online',
  domain: 'apetitonline.cz',
  searchUrl: (query) => `https://www.apetitonline.cz/vyhledavani?search_api_fulltext=${encodeURIComponent(query)}`,
  recipePath: /^\/recept\//i,
})
