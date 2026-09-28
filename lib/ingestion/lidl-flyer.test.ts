import { describe, expect, it } from 'vitest'
import { parseLidlFlyerResponse, parseLidlFlyerSlugs } from '@/lib/ingestion/lidl-flyer'

// Fixtures are trimmed from lidl.cz's real current-flyers listing and the leaflets.schwarz API
// response for one flyer (checked live 2026-09-28).

describe('parseLidlFlyerSlugs', () => {
  it('reads each flyer slug linked from the listing page, once', () => {
    const html =
      'href="/l/cs/letak/akcni-letak-od-ctvrtka-1-10-4-10-2026/view/flyer/page/1?lf=HHZ" ' +
      'href="/l/cs/letak/akcni-letak-od-utery-29-9-30-9-2026/view/flyer/page/16?lf=HHZ" ' +
      'href="/l/cs/letak/akcni-letak-od-utery-29-9-30-9-2026/view/flyer/page/1?lf=HHZ"'
    expect(parseLidlFlyerSlugs(html)).toEqual(['akcni-letak-od-ctvrtka-1-10-4-10-2026', 'akcni-letak-od-utery-29-9-30-9-2026'])
  })

  it('is empty for a page with no flyer links', () => {
    expect(parseLidlFlyerSlugs('<html>no flyers here</html>')).toEqual([])
  })
})

describe('parseLidlFlyerResponse', () => {
  const raw = {
    success: true,
    flyer: {
      id: '01a0d37f-51dc-7e8b-969d-9628ced79a88',
      offerStartDate: '2026-09-28',
      offerEndDate: '2026-10-04',
      pages: [
        { number: 1, keyWords: 'Mléko Sýr 3990', zoom: 'https://imgproxy.leaflets.schwarz/zoom/page-1.jpg', image: 'https://imgproxy.leaflets.schwarz/mid/page-1.jpg' },
        { number: 2, keyWords: '', image: 'https://imgproxy.leaflets.schwarz/mid/page-2.jpg' }, // no `zoom` — falls back to `image`
      ],
    },
  }

  it('reads the flyer\'s validity from offerStartDate/offerEndDate (not startDate/endDate)', () => {
    const result = parseLidlFlyerResponse({ ...raw, flyer: { ...raw.flyer, startDate: '2026-09-25', endDate: '2026-10-11' } as typeof raw.flyer })
    expect(result).toMatchObject({ id: raw.flyer.id, validFrom: '2026-09-28', validUntil: '2026-10-04' })
  })

  it('prefers a page\'s `zoom` image (small print stays legible), falling back to `image`', () => {
    const result = parseLidlFlyerResponse(raw)
    expect(result?.pages).toEqual([
      { number: 1, text: 'Mléko Sýr 3990', imageUrl: 'https://imgproxy.leaflets.schwarz/zoom/page-1.jpg' },
      { number: 2, text: '', imageUrl: 'https://imgproxy.leaflets.schwarz/mid/page-2.jpg' },
    ])
  })

  it('is null when the API reports failure', () => {
    expect(parseLidlFlyerResponse({ success: false })).toBeNull()
  })

  it('is null without both offerStartDate and offerEndDate, rather than guessing a window', () => {
    expect(parseLidlFlyerResponse({ success: true, flyer: { id: 'x', offerStartDate: '2026-09-28' } })).toBeNull()
  })

  it('rejects a window that ends before it starts', () => {
    expect(parseLidlFlyerResponse({ success: true, flyer: { id: 'x', offerStartDate: '2026-10-04', offerEndDate: '2026-09-28' } })).toBeNull()
  })

  it('drops a page with no image at all', () => {
    const result = parseLidlFlyerResponse({ success: true, flyer: { id: 'x', offerStartDate: '2026-09-28', offerEndDate: '2026-10-04', pages: [{ number: 1, keyWords: 'text' }] } })
    expect(result?.pages).toEqual([])
  })
})
