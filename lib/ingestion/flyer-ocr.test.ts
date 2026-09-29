import { describe, expect, it, vi } from 'vitest'
import { fetchFlyerOffers, type ExtractedOffer, type FlyerPageCache, type FlyerSource } from '@/lib/ingestion/flyer'
import { extractTextWithFallback } from '@/lib/ingestion/flyer-ocr'
import type { ReceiptTextExtractor } from '@/lib/receipts'

const image = { base64: 'AAAA', mimeType: 'image/jpeg' }
const reads = (text: string): ReceiptTextExtractor => ({ extractText: vi.fn(async () => ({ fullText: text, lines: [text] })) })
const fails = (message: string): ReceiptTextExtractor => ({ extractText: vi.fn(async () => { throw new Error(message) }) })

describe('extractTextWithFallback', () => {
  it('uses the primary provider and never calls the fallback when it reads the page', async () => {
    const fallback = reads('azure')
    expect(await extractTextWithFallback(image, { primary: reads('google'), fallback })).toBe('google')
    expect(fallback.extractText).not.toHaveBeenCalled()
  })

  it('falls back to the second provider when the primary fails', async () => {
    expect(await extractTextWithFallback(image, { primary: fails('billing'), fallback: reads('azure') })).toBe('azure')
  })

  it('reports both reasons when neither provider can read the page', async () => {
    await expect(extractTextWithFallback(image, { primary: fails('billing'), fallback: fails('no key') })).rejects.toThrow(/billing.*no key/)
  })

  it('reports the primary failure when there is no fallback configured', async () => {
    await expect(extractTextWithFallback(image, { primary: fails('billing') })).rejects.toThrow('OCR failed: billing')
  })
})

describe('fetchFlyerOffers with page OCR text', () => {
  const flyer = { id: 'f1', locationType: 'SUPERMARKET', validFrom: '2026-09-28', validUntil: '2026-10-04' }
  const page = { number: 1, text: 'keyword bag', imageUrl: 'https://example.test/1.jpg' }
  const offer: ExtractedOffer = { brand: null, name: 'Camembert', packageSize: '150 g', offerPrice: 24.9, regularPrice: null, discountPercent: null, unitPriceText: null, condition: 'none', selectedVariants: false, ownValidity: null, category: 'Potraviny' }
  const source = (readPageText?: FlyerSource<typeof flyer>['readPageText']): FlyerSource<typeof flyer> => ({
    name: 'Test',
    listFlyers: async () => [flyer],
    loadPages: async () => [page],
    readPageText,
  })
  const extractor = () => ({ model: 'm', extract: vi.fn(async () => ({ offers: [offer] })) })
  const cacheWith = (initial?: { pageText: string | null }) => {
    const saved: (string | undefined)[] = []
    const cache: FlyerPageCache = {
      load: async () => new Map(initial ? [['f1|1', { offers: [offer], pageText: initial.pageText }]] : []),
      save: async (_f, _n, _e, _m, text) => { saved.push(text) },
      prune: async () => {},
    }
    return { cache, saved }
  }
  const run = (src: FlyerSource<typeof flyer>, cache: FlyerPageCache, model = extractor()) =>
    fetchFlyerOffers(src, () => true, { extractor: model, cache, today: '2026-09-29', fetch: vi.fn() })

  it('validates against the OCR text, and keeps it in the cache with the page', async () => {
    const { cache, saved } = cacheWith()
    const model = extractor()
    const offers = await run(source(async () => 'Camembert 24,90 Kč'), cache, model)
    expect(offers[0].pageText).toBe('Camembert 24,90 Kč')
    expect(saved).toEqual(['Camembert 24,90 Kč'])
    expect(model.extract).toHaveBeenCalledWith(expect.objectContaining({ text: 'Camembert 24,90 Kč' }))
  })

  it('takes a cached page with its kept text without reading it again', async () => {
    const readPageText = vi.fn(async () => 'new')
    const model = extractor()
    const offers = await run(source(readPageText), cacheWith({ pageText: 'kept text' }).cache, model)
    expect(offers[0].pageText).toBe('kept text')
    expect(readPageText).not.toHaveBeenCalled()
    expect(model.extract).not.toHaveBeenCalled()
  })

  it('reads again a cached page that has no OCR text (read before OCR existed)', async () => {
    const readPageText = vi.fn(async () => 'fresh text')
    const { cache, saved } = cacheWith({ pageText: null })
    const offers = await run(source(readPageText), cache)
    expect(offers[0].pageText).toBe('fresh text')
    expect(saved).toEqual(['fresh text'])
  })

  it('leaves the page for the next run when OCR fails, instead of caching it without text', async () => {
    const { cache, saved } = cacheWith()
    await expect(run(source(async () => { throw new Error('OCR failed') }), cache)).rejects.toThrow('OCR failed')
    expect(saved).toEqual([])
  })

  it('keeps the flyer\'s own text for a source without OCR', async () => {
    const offers = await run(source(), cacheWith().cache)
    expect(offers[0].pageText).toBe('keyword bag')
  })
})
