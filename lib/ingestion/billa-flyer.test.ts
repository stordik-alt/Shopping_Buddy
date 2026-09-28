import { describe, expect, it } from 'vitest'
import { isNationalFlyer, parseBillaListing, parseBillaPublitasUrl, parseBillaValidity } from '@/lib/ingestion/billa-flyer'

// Fixtures are trimmed from billa.cz's real /akcni-letaky listing and one flyer's own page
// (checked live 2026-09-28).

describe('parseBillaValidity', () => {
  it('reads a Czech validity range with day names', () => {
    expect(parseBillaValidity('Platí od středa 15. 7. do úterý 29. 9. 2026')).toEqual({ validFrom: '2026-07-15', validUntil: '2026-09-29' })
  })

  it('takes the start month\'s year from the year before when the range crosses New Year', () => {
    expect(parseBillaValidity('Platí od pondělí 29. 12. do pátek 2. 1. 2027')).toEqual({ validFrom: '2026-12-29', validUntil: '2027-01-02' })
  })

  it('is null for text with no validity range', () => {
    expect(parseBillaValidity('Katalog: Pivo')).toBeNull()
  })
})

describe('isNationalFlyer', () => {
  it('accepts an ordinary flyer title', () => {
    expect(isNationalFlyer('Katalog: Pivo')).toBe(true)
    expect(isNationalFlyer('Leták BILLA klub')).toBe(true)
  })

  it('rejects a single-store "Speciál" title (an opening/anniversary promotion, not chain-wide pricing)', () => {
    expect(isNationalFlyer('Speciál: Bílovec')).toBe(false)
    expect(isNationalFlyer('speciál: ostrava')).toBe(false)
  })
})

describe('parseBillaListing', () => {
  const tile = (slug: string, title: string, validity: string) =>
    `<a href="/akcni-letaky/${slug}" class="ws-teaser" data-teaser-name="${title}">` +
    `<div>…image markup…</div><div class="text-base-color py-2">${validity}</div></a>`

  it('reads each tile\'s slug, title and validity', () => {
    const html = tile('katalog-pivo', 'Katalog: Pivo', 'Platí od středa 15. 7. do úterý 29. 9. 2026') + tile('special-ostrava', 'Speciál: Ostrava', 'Platí od čtvrtka 24. 9. do úterý 29. 9. 2026')
    expect(parseBillaListing(html)).toEqual([
      { slug: 'katalog-pivo', title: 'Katalog: Pivo', validFrom: '2026-07-15', validUntil: '2026-09-29' },
      { slug: 'special-ostrava', title: 'Speciál: Ostrava', validFrom: '2026-09-24', validUntil: '2026-09-29' },
    ])
  })

  it('decodes &nbsp;/&amp;nbsp; inside the validity text', () => {
    const html = tile('katalog-zdravi', 'Katalog: Zdraví', 'Platí od středa 2.&amp;nbsp;9. do&amp;nbsp;úterý 29.&amp;nbsp;9.&amp;nbsp;2026')
    expect(parseBillaListing(html)).toEqual([{ slug: 'katalog-zdravi', title: 'Katalog: Zdraví', validFrom: '2026-09-02', validUntil: '2026-09-29' }])
  })

  it('skips a tile whose validity cannot be read rather than guessing', () => {
    const html = '<a href="/akcni-letaky/broken" class="ws-teaser" data-teaser-name="Broken"><div>no validity text here</div></a>'
    expect(parseBillaListing(html)).toEqual([])
  })

  it('is empty for a page with no tiles', () => {
    expect(parseBillaListing('<html><body>no flyers</body></html>')).toEqual([])
  })
})

describe('parseBillaPublitasUrl', () => {
  it('finds the viewer URL from the page-1 link, as the publication\'s base URL', () => {
    const html = 'x,"https:\\u002F\\u002Fview.publitas.com\\u002Fbilla-cz\\u002Fkatalog-pivo-15-7-29-9-2026\\u002Fpage\\u002F1",y'
    expect(parseBillaPublitasUrl(html)).toBe('https://view.publitas.com/billa-cz/katalog-pivo-15-7-29-9-2026/')
  })

  it('is not fooled by the page\'s separate PDF-download link to the same domain', () => {
    // The PDF link (numeric group/publication ids, no "/page/") appears earlier in the real page
    // than the viewer link (human-readable slug) — found live 2026-09-28 on the "Leták BILLA klub"
    // page, where taking the first https://view.publitas.com/ match at all picked the wrong one.
    const html =
      'pdf href "https:\\u002F\\u002Fview.publitas.com\\u002F64069\\u002F2700044\\u002Fpdfs\\u002Fabc.pdf" ' +
      'viewer "https:\\u002F\\u002Fview.publitas.com\\u002Fbilla-cz\\u002Fbilla-klub-23-9-6-10-2026\\u002Fpage\\u002F1"'
    expect(parseBillaPublitasUrl(html)).toBe('https://view.publitas.com/billa-cz/billa-klub-23-9-6-10-2026/')
  })

  it('is null when no Publitas link is present', () => {
    expect(parseBillaPublitasUrl('<html>nothing here</html>')).toBeNull()
  })
})
