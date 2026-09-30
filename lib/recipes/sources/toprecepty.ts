import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const topreceptyAdapter = createPortalAdapter({
  id: 'toprecepty',
  name: 'Toprecepty',
  domain: 'toprecepty.cz',
  maxSearchPages: 500,
  searchUrl: (query, page = 1) => 'https://www.toprecepty.cz/vyhledavani-receptu?hledam=' + encodeURIComponent(query) + (page > 1 ? '&stranka=' + page : ''),
  recipePath: /^\/recept\//i,
})
