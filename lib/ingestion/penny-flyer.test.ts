import { describe, expect, it } from 'vitest'
import type { fetchWithTimeout } from '@/lib/ingestion/http'
import {
  parsePennyFlyerLinks,
  parsePennyPageCount,
  parsePennyPageText,
  parsePennyValidity,
  pennyFlyerSource,
  pennyPageDateProblem,
} from '@/lib/ingestion/penny-flyer'

// Fixtures are cut from Penny's real week-39 flyer (23.–29. 9. 2026) as published on
// files.rewe.co.at, and from the penny.cz flyer listing.
const BASE = 'https://files.rewe.co.at/PennyIntLeaflet/CZ/23_09_2026_cz/'

const LISTING_HTML =
  `<a href="${BASE}" target="_blank" aria-label="otevřít leták 23. 9." rel="noopener">` +
  `<a href="${BASE}" aria-label="Prohlédnout">Prohlédnout</a>` +
  '<a href="https://files.rewe.co.at/PennyIntLeaflet/CZ/../evil/">x</a><a href="https://example.com/letak/">y</a>'

const page = (number: number, text: string) =>
  `<html><head><title>23_09_2026 – Page ${number}</title></head><body><div class="nav-links"><a href="../${number + 1}/">${number + 1}</a></div>` +
  `<div id="text-container" itemprop="text"><h1>23_09_2026</h1><p>${number} ${text}</p><p class="powered-by">Made with FlippingBook</p></div></body></html>`

const PAGE_3_TEXT =
  '&lt; Nejnižš&#237; cena za posledn&#237;ch 30 dn&#237; 8,90 11,90/ 25% 11,90 14,90/ 20% ŠKVARKOV&#221; PAG&#193;Č* ze zmrazen&#233;ho polotovaru | 65 g 100 g 10,62 Kč ' +
  'Nab&#237;dka platn&#225; od středy 23. 9. do &#250;ter&#253; 29. 9. 2026'
const PAGE_30_TEXT = 'Nízké ceny hezky česky 25,90 31,90/ 18% Nabídka platná od pátku 25. 9. do neděle 27. 9. 2026'
const WINDOW = { validFrom: '2026-09-23', validUntil: '2026-09-29' }

describe('parsePennyFlyerLinks', () => {
  it('finds each flyer folder once and nothing else', () => {
    expect(parsePennyFlyerLinks(LISTING_HTML)).toEqual([BASE])
  })
})

describe('parsePennyPageCount', () => {
  it('is the highest page the index links to', () => {
    expect(parsePennyPageCount('<a href="./2/">2</a><a href="./37/">37</a><a href="./10/">10</a>')).toBe(37)
    expect(parsePennyPageCount('<p>no links</p>')).toBe(1)
  })
})

describe('parsePennyPageText', () => {
  it('reads the text layer, decodes it and drops the leading page number', () => {
    const text = parsePennyPageText(page(3, PAGE_3_TEXT), 3)
    expect(text.startsWith('< Nejnižší cena')).toBe(true)
    expect(text).toContain('ŠKVARKOVÝ PAGÁČ* ze zmrazeného polotovaru | 65 g 100 g 10,62 Kč')
    expect(text).not.toContain('FlippingBook')
  })

  it('is empty when the page has no text layer', () => {
    expect(parsePennyPageText('<html></html>', 1)).toBe('')
  })
})

describe('parsePennyValidity', () => {
  it('takes the window most pages print', () => {
    const text = parsePennyPageText(page(3, PAGE_3_TEXT), 3)
    expect(parsePennyValidity([text, text, PAGE_30_TEXT, ''])).toEqual(WINDOW)
  })

  it('takes the start from the year before across New Year', () => {
    expect(parsePennyValidity(['Nabídka platná od středy 30. 12. do úterý 5. 1. 2027'])).toEqual({ validFrom: '2026-12-30', validUntil: '2027-01-05' })
  })

  it('is null when no page prints a validity', () => {
    expect(parsePennyValidity(['29,90 39,90/ 25%', ''])).toBeNull()
  })
})

describe('pennyPageDateProblem', () => {
  it('accepts a page that prints only the flyer window', () => {
    expect(pennyPageDateProblem(parsePennyPageText(page(3, PAGE_3_TEXT), 3), WINDOW)).toBeNull()
    expect(pennyPageDateProblem('Platnost: 23. 9. – 29. 9. 2026', WINDOW)).toBeNull()
    expect(pennyPageDateProblem('29,90 39,90/ 25% 5x 48 g 1 kg 166,25 Kč', WINDOW)).toBeNull()
  })

  it('leaves out a page whose offers hold on other days', () => {
    expect(pennyPageDateProblem(PAGE_30_TEXT, WINDOW)).toBe('another date on the page: 25. 9.')
    expect(pennyPageDateProblem('Platnost: 23. 9. – 29. 9. … od pátku 25. 9.', WINDOW)).toBe('another date on the page: 25. 9.')
  })
})

describe('pennyFlyerSource', () => {
  const fakeFetch = (pages: Record<string, string>) =>
    (async (url: string | URL | Request) => {
      const body = pages[String(url)]
      return new Response(body ?? 'not found', { status: body ? 200 : 404 })
    }) as unknown as typeof fetchWithTimeout

  it('lists the flyer with its validity, the pages to read and the pages left out', async () => {
    const index = page(1, 'Cover 16,90 19,90/ 15%').replace('<div class="nav-links">', '<div class="nav-links"><a href="./2/">2</a><a href="./3/">3</a>')
    const get = fakeFetch({
      'https://www.penny.cz/nabidky/letaky': LISTING_HTML,
      [BASE]: index,
      [`${BASE}2/`]: page(2, PAGE_30_TEXT),
      [`${BASE}3/`]: page(3, PAGE_3_TEXT),
    })
    const [flyer] = await pennyFlyerSource.listFlyers(get, '2026-09-26')
    expect(flyer).toMatchObject({ id: '23_09_2026_cz', locationType: 'STANDARD', ...WINDOW })
    expect(flyer.pages.map((p) => p.number)).toEqual([1, 3])
    expect(flyer.pages[1].imageUrl).toBe(`${BASE}files/assets/common/page-html5-substrates/page0003_4.jpg`)
    expect(flyer.skippedPages).toEqual([{ number: 2, reason: 'another date on the page: 25. 9.' }])
    expect(await pennyFlyerSource.loadPages(get, flyer)).toBe(flyer.pages)
  })

  it('reports a listing without flyers and a flyer without a validity as failures', async () => {
    await expect(pennyFlyerSource.listFlyers(fakeFetch({ 'https://www.penny.cz/nabidky/letaky': '<p>nic</p>' }), '2026-09-26')).rejects.toThrow('has no flyers')
    const undated = fakeFetch({ 'https://www.penny.cz/nabidky/letaky': LISTING_HTML, [BASE]: page(1, '16,90 19,90/ 15%') })
    await expect(pennyFlyerSource.listFlyers(undated, '2026-09-26')).rejects.toThrow('no validity printed')
  })
})
