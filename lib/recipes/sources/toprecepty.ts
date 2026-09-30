import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const topreceptyAdapter = createPortalAdapter({
  id: 'toprecepty',
  name: 'Toprecepty',
  domain: 'toprecepty.cz',
  searchUrl: (query) => `https://www.toprecepty.cz/vyhledavani-receptu?hledam=${encodeURIComponent(query)}`,
  recipePath: /^\/recept\//i,
})
