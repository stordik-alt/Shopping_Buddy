import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeNuxtPayload, parseTetaDetailPayload, parseTetaListingPayload } from '@/lib/ingestion/teta-payload'

// The fixtures are real pages of tetadrogerie.cz, captured with
// `pnpm teta:capture-fixture` and stored gzipped. They are the ground truth for the devalue
// encoding: a hand-written fixture would only prove that the decoder matches our own guess.
function fixture(name: string): string {
  const buffer = readFileSync(join(__dirname, 'fixtures', name))
  const values = JSON.parse(gunzipSync(buffer).toString('utf8')) as unknown[]
  // The decoder reads the payload out of the page, so the fixture is wrapped back into a page.
  return `<html><body><script id="__NUXT_DATA__" type="application/json">${JSON.stringify(values)}</script></body></html>`
}

describe('Teta Nuxt payload decoder', () => {
  it('reads a slot as a value, not as another index', () => {
    const values = [
      ['ShallowReactive', 1],
      { data: 2, state: 3 },
      { 'thing/x': 4 },
      { pinia: 5 },
      { price: 6, name: 7 },
      {},
      1790,
      'Tip Line kapesníky',
    ]
    const html = `<script id="__NUXT_DATA__">${JSON.stringify(values)}</script>`
    const payload = decodeNuxtPayload(html)
    // Slot 6 holds the number 1790. Reading it as an index would return the unrelated slot 1790.
    expect(payload.data()).toEqual({ 'thing/x': { price: 1790, name: 'Tip Line kapesníky' } })
  })

  it('keeps a number in a container an index, but a number in a slot a value', () => {
    const values = [
      ['ShallowReactive', 1],
      { data: 2, state: 3 },
      { item: 4 },
      {},
      { flag: 5, count: 6 },
      true,
      24,
    ]
    const html = `<script id="__NUXT_DATA__">${JSON.stringify(values)}</script>`
    expect(decodeNuxtPayload(html).data()).toEqual({ item: { flag: true, count: 24 } })
  })

  it('survives a payload that references itself', () => {
    // Slot 2 points at slot 3 and slot 3 points back at slot 2.
    const values = [['ShallowReactive', 1], { data: 2, state: 4 }, { self: 3 }, { parent: 2 }, {}]
    const html = `<script id="__NUXT_DATA__">${JSON.stringify(values)}</script>`
    const data = decodeNuxtPayload(html).data() as Record<string, unknown>
    expect(data).toHaveProperty('self')
    expect(JSON.stringify(data)).toContain('cycle')
  })

  it('reads the real category listing payload', () => {
    const listing = parseTetaListingPayload(fixture('teta-listing-payload.json.gz'))
    expect(listing.pagination.currentPage).toBe(1)
    expect(listing.pagination.itemsPerPage).toBe(40)
    expect(listing.pagination.totalItems).toBeGreaterThan(0)
    expect(listing.items).toHaveLength(40)
    for (const item of listing.items) {
      // Teta's own code is 15 digits; the shopper sees a shorter article number.
      expect(item.code).toMatch(/^\d{15}$/)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.price.amount).toBeGreaterThan(0)
      expect(item.currency).toBe('CZK')
      expect(item.categoryPath.length).toBeGreaterThan(0)
      // A brand taxon is not a category and must not end up in the category path.
      for (const part of item.categoryPath) {
        expect(item.brand ?? '').not.toBe(part)
      }
    }
  })

  it('keeps the brand out of the category path and reads the price in Kč', () => {
    const listing = parseTetaListingPayload(fixture('teta-listing-payload.json.gz'))
    const tissues = listing.items.find((item) => item.articleNumber === '196442')
    expect(tissues).toBeDefined()
    expect(tissues?.code).toBe('000000000196442')
    expect(tissues?.brand).toBe('Tip Line')
    expect(tissues?.categoryPath).toEqual(['Hygiena', 'Kapesníčky a ubrousky', 'Papírové kapesníčky a ubrousky'])
    // The payload holds 1790 haléře; the app stores 17,90 Kč.
    expect(tissues?.price.amount).toBeCloseTo(17.9, 2)
    expect(tissues?.price.unitAmount).toBeCloseTo(0.18, 2)
    expect(tissues?.price.unit).toBe('KS')
  })

  it('reads the discounted price pair of the real listing payload', () => {
    const listing = parseTetaListingPayload(fixture('teta-listing-payload.json.gz'))
    const toiletPaper = listing.items.find((item) => item.articleNumber === '151261')
    // The price the shopper pays is the action price; the everyday price is the base price the
    // action discounts, and the retailer states the discount in percent.
    expect(toiletPaper?.price.amount).toBeCloseTo(59.9, 2)
    expect(toiletPaper?.price.regularAmount).toBeCloseTo(69.9, 2)
    expect(toiletPaper?.price.discountPercent).toBe(14)
  })

  it('reads the real product page payload', () => {
    const detail = parseTetaDetailPayload(fixture('teta-detail-payload.json.gz'))
    expect(detail.product.code).toBe('000000000196442')
    expect(detail.product.name).toBe('Tip Line kosmetické kapesníky 2vrstvé 100 ks')
    expect(detail.product.price.amount).toBeCloseTo(17.9, 2)
    expect(detail.product.categoryPath).toEqual(['Hygiena', 'Kapesníčky a ubrousky', 'Papírové kapesníčky a ubrousky'])
    expect(detail.product.brand).toBe('Tip Line')
    expect(detail.product.updatedAt).toBe('2026-08-22 01:28:12')
    expect(detail.attributes.length).toBeGreaterThan(0)
    for (const attribute of detail.attributes) {
      expect(attribute.code.length).toBeGreaterThan(0)
    }
    // The package size and the brand come from the product's own attributes.
    expect(detail.attributes.find((attribute) => attribute.code === 'OBSAH_BALENI')?.value).toBe('100 ks')
    expect(detail.attributes.find((attribute) => attribute.code === 'ZNACKA')?.value).toBe('Tip Line')
    expect(detail.attributes.find((attribute) => attribute.code === 'POCET_JEDNOTEK_V_BALENI')?.value).toBe('100')
  })
})
