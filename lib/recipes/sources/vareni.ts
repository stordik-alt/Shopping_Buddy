import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const vareniAdapter = createPortalAdapter({
  id: 'vareni',
  name: 'Vaření.cz',
  domain: 'vareni.cz',
  searchUrl: (query) => `https://www.vareni.cz/vyhledavani/?q=${encodeURIComponent(query)}`,
  recipePath: /^\/recepty\//i,
})
