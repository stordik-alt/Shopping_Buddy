import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const receptyCzAdapter = createPortalAdapter({
  id: 'recepty-cz',
  name: 'Recepty.cz',
  domain: 'recepty.cz',
  imageDomains: ['ms*.ostium.cz'],
  searchUrl: (query) => 'https://www.recepty.cz/vyhledavani/pokrocile?search=' + encodeURIComponent(query) + '&showResults=1',
  recipePath: new RegExp('^/recept/[^/]+-\\d+/?$', 'i'),
})