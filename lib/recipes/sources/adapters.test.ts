import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRecipeHtml } from '@/lib/recipes/fetch'
import { receptyCzAdapter } from '@/lib/recipes/sources/recepty-cz'
import { apetitAdapter } from '@/lib/recipes/sources/apetit'
import { topreceptyAdapter } from '@/lib/recipes/sources/toprecepty'
import { vareniAdapter } from '@/lib/recipes/sources/vareni'

vi.mock('@/lib/recipes/fetch', () => ({
  fetchRecipeHtml: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchRecipeHtml)

const detailFixture = (title: string, url: string) => `<!doctype html>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "${title}",
  "description": "Fixture receptu",
  "recipeYield": "4 porce",
  "prepTime": "PT15M",
  "totalTime": "PT45M",
  "recipeIngredient": ["500 g kuřecího masa", "1 ks cibule"],
  "aggregateRating": {"ratingValue": "4.5", "bestRating": "5", "ratingCount": "12"},
  "url": "${url}"
}
</script>`

const searchFixture = (url: string, title: string) =>
  `<a href="${url}"><span>${title}</span></a>`

describe('recipe portal adapter fixtures', () => {
  beforeEach(() => mockedFetch.mockReset())

  const cases = [
    { adapter: receptyCzAdapter, searchUrl: 'https://www.recepty.cz/vyhledavani?text=ku%C5%99e', recipeUrl: 'https://www.recepty.cz/recept/testovaci-recept-123456', title: 'Kuřecí rizoto' },
    { adapter: apetitAdapter, searchUrl: 'https://www.apetitonline.cz/vyhledavani?search_api_fulltext=ku%C5%99e', recipeUrl: 'https://www.apetitonline.cz/recept/testovaci-recept', title: 'Kuřecí rizoto' },
    { adapter: topreceptyAdapter, searchUrl: 'https://www.toprecepty.cz/vyhledavani-receptu?hledam=ku%C5%99e', recipeUrl: 'https://www.toprecepty.cz/recept/12345-testovaci-recept/', title: 'Kuřecí rizoto' },
    { adapter: vareniAdapter, searchUrl: 'https://www.vareni.cz/vyhledavani/?q=ku%C5%99e', recipeUrl: 'https://www.vareni.cz/recepty/testovaci-recept/', title: 'Kuřecí rizoto' },
  ] as const

  it.each(cases)('parses search results and detail for $adapter.name', async ({ adapter, searchUrl, recipeUrl, title }) => {
    if (adapter === receptyCzAdapter) {
      mockedFetch.mockImplementation(async (url) => url.includes('/recept/') ? detailFixture(title, recipeUrl) : searchFixture(recipeUrl, title))
    } else {
      mockedFetch.mockResolvedValue(searchFixture(recipeUrl, title))
    }
    const results = await adapter.search('kuře')
    expect(results[0]).toMatchObject({
      title,
      sourceId: adapter.id,
      sourceName: adapter.name,
      sourceUrl: recipeUrl,
      canonicalUrl: recipeUrl,
    })

    const recipe = await adapter.getRecipe(recipeUrl)
    expect(recipe).toMatchObject({
      title,
      sourceId: adapter.id,
      sourceName: adapter.name,
      servings: 4,
      totalTimeMinutes: 45,
      ratingValue: 4.5,
      ratingScale: 5,
      ratingCount: 12,
    })
    expect(recipe.ingredients).toHaveLength(2)
  })
  it('ignores Recepty.cz system pages and keeps individual recipes', async () => {
    mockedFetch.mockImplementation(async (url) => url.includes('recipePage=')
      ? ''
      : [
          '<a href="https://www.recepty.cz/recept/oblibene">Oblíbené</a>',
          '<a href="https://www.recepty.cz/recept/vsechny-vypisy-receptu">Všechny recepty</a>',
          '<a href="https://www.recepty.cz/recept/kureci-rizoto-123456">Kuřecí rizoto</a>',
        ].join(''))

    const results = await receptyCzAdapter.search('kuře')

    expect(results).toHaveLength(1)
    expect(results[0].sourceUrl).toBe('https://www.recepty.cz/recept/kureci-rizoto-123456')
    expect(receptyCzAdapter.imageDomains).toEqual(['ms*.ostium.cz'])
  })

  it.each([
    { adapter: receptyCzAdapter, host: 'www.recepty.cz', path: (page: number) => `/recept/kure-page-${page}-123456`, pageMarker: 'recipePage=2' },
    { adapter: apetitAdapter, host: 'www.apetitonline.cz', path: (page: number) => `/recept/kure-page-${page}`, pageMarker: 'page=1' },
    { adapter: topreceptyAdapter, host: 'www.toprecepty.cz', path: (page: number) => `/recept/12345-kure-page-${page}/`, pageMarker: 'stranka=2' },
    { adapter: vareniAdapter, host: 'www.vareni.cz', path: (page: number) => `/recepty/kure-page-${page}/`, pageMarker: 'page=2' },
  ])('continues pagination for $adapter.name and skips excluded URLs', async ({ adapter, host, path, pageMarker }) => {
    mockedFetch.mockImplementation(async (url) => {
      const page = mockedFetch.mock.calls.length
      const recipeUrl = `https://${host}${path(page)}`
      return searchFixture(recipeUrl, `Kuře stránka ${page}`)
    })

    const firstUrl = `https://${host}${path(1)}`
    const results = await adapter.search('kuře', {
      limit: 1,
      excludeUrls: new Set([firstUrl]),
    })

    expect(results).toHaveLength(1)
    expect(results[0].sourceUrl).toBe(`https://${host}${path(2)}`)
    expect(mockedFetch.mock.calls[1]?.[0]).toContain(pageMarker)
  })

})
