import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const vareniAdapter = createPortalAdapter({
  id: 'vareni',
  name: 'Vaření.cz',
  domain: 'vareni.cz',
  maxSearchPages: 500,
  searchUrl: (query, page = 1) => 'https://www.vareni.cz/vyhledavani/?q=' + encodeURIComponent(query) + (page > 1 ? '&page=' + page : ''),
  recipePath: /^\/recepty\//i,
})
