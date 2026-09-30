import { describe, expect, it } from 'vitest'
import { extractRecipeLinks } from '@/lib/recipes/sources/html'

describe('recipe result link extraction', () => {
  it('extracts same-host recipe links, strips fragments and deduplicates', () => {
    const html = `
      <a href="/recept/abc#comments"><span>Kuřecí rizoto</span></a>
      <a href="/recept/abc">Kuřecí rizoto</a>
      <a href="https://example.com/recept/nope">Cizí web</a>
      <a href="/clanek/abc">Článek</a>
    `

    expect(extractRecipeLinks(
      html,
      'https://example.com/search?q=rizoto',
      /^\\/recept\\//,
    )).toEqual([
      { url: 'https://example.com/recept/abc', title: 'Kuřecí rizoto' },
    ])
  })
})
