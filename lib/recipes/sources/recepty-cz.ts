import { createPortalAdapter } from '@/lib/recipes/sources/adapter-factory'

export const receptyCzAdapter = createPortalAdapter({
  id: 'recepty-cz',
  name: 'Recepty.cz',
  domain: 'recepty.cz',
  searchUrl: (query) => `https://www.recepty.cz/vyhledavani/pokrocile?search=${encodeURIComponent(query)}&showResults=1`,
  // Recepty.cz uses /recept/<slug>-<numeric-id> for individual recipes.
  // Requiring the numeric recipe id prevents system pages such as
  // /recept/oblibene or /recept/vsechny-vypisy-receptu from being imported.
  recipePath: /^\/recept\/[^/]+-\d+\/?$/i,
})
