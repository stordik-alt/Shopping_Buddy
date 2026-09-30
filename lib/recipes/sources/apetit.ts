import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const apetitAdapter = createPortalAdapter({
  id: 'apetit',
  name: 'Apetit Online',
  domain: 'apetitonline.cz',
  maxSearchPages: 500,
  searchUrl: (query, page = 1) => 'https://www.apetitonline.cz/vyhledavani?search_api_fulltext=' + encodeURIComponent(query) + (page > 1 ? '&page=' + (page - 1) : ''),
  recipePath: /^\/recept\//i,
})
