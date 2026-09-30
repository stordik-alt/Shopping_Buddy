import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const receptyCzAdapter = createPortalAdapter({
  id: 'recepty-cz',
  name: 'Recepty.cz',
  domain: 'recepty.cz',
  imageDomains: ['ms*.ostium.cz'],
  searchPageCount: 10,
  searchUrl: (query, page = 1) => 'https://www.recepty.cz/vyhledavani?text=' + encodeURIComponent(query) + (page > 1 ? '&recipePage=' + page : ''),
  recipePath: new RegExp('^/recept/[^/]+-\\d+/?$', 'i'),
})