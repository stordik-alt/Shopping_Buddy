import { describe, expect, it } from 'vitest'
import { extractRecipeLinks, extractRecipeLinksFromRss } from '@/lib/recipes/sources/html'

describe('recipe result link extraction', () => {
  it('extracts same-host recipe links, strips fragments and deduplicates', () => {
    const html = `
      <a href="/recept/abc#comments"><span>Kuřecí rizoto</span></a>
      <a href="/recept/abc">Kuřecí rizoto</a>
      <a href="https://other.example/recept/nope">Cizí web</a>
      <a href="/clanek/abc">Článek</a>
    `

    expect(extractRecipeLinks(
      html,
      'https://example.com/search?q=rizoto',
      /^\/recept\//,
    )).toEqual([
      { url: 'https://example.com/recept/abc', title: 'Kuřecí rizoto' },
    ])
  })
})


  it('extracts recipe links from RSS items', () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[Kuřecí zelené kari]]></title>
        <link>https://www.vareni.cz/recepty/kureci-na-zelenem-kari/</link>
      </item>
      <item>
        <title>Článek</title>
        <link>https://www.vareni.cz/magazin/clanek/</link>
      </item>
      <item>
        <title>Duplicitní recept</title>
        <link>https://www.vareni.cz/recepty/kureci-na-zelenem-kari/#x</link>
      </item>
    </channel></rss>`

    expect(extractRecipeLinksFromRss(
      xml,
      'https://www.vareni.cz/rss/recepty.xml',
      /^\/recepty\//,
    )).toEqual([
      {
        url: 'https://www.vareni.cz/recepty/kureci-na-zelenem-kari/',
        title: 'Kuřecí zelené kari',
      },
    ])
  })
