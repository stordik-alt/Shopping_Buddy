import { describe, expect, it } from 'vitest'
import { attentionItems } from '@/lib/attention'
import type { ReceiptImportState } from '@/lib/db/queries'
import type { PricePoint, ProductPrice } from '@/lib/prices'

const receipt = (status: ReceiptImportState['status'], stalled = false): ReceiptImportState => ({
  id: crypto.randomUUID(),
  status,
  hasImage: true,
  rawOcrText: null,
  ocrProvider: null,
  errorMessage: null,
  extracted: null,
  purchaseId: null,
  stalled,
})

const product = (productName: string, prices: Partial<PricePoint>[]): ProductPrice => ({
  productName,
  category: 'Potraviny',
  prices: prices.map((price) => ({ store: 'Lidl', regularPrice: 40, unit: 'ks', unitPrice: 40, recordedAt: '2026-09-20', ...price })),
})

const base = { today: '2026-09-25', receipts: [], productPrices: [], listNames: [] }

describe('attentionItems', () => {
  it('has nothing to report on a quiet day', () => {
    expect(attentionItems(base)).toEqual([])
  })

  it('counts receipts that wait on the household, not ones still processing', () => {
    const receipts = [receipt('review_required'), receipt('duplicate_review'), receipt('ocr_failed'), receipt('parsing'), receipt('uploaded', true)]
    const items = attentionItems({ ...base, receipts })
    expect(items).toEqual([{ id: 'receipts', kind: 'receipt', text: '4 účtenky čekají na vaši kontrolu', tab: 'Rozpočet' }])
    expect(attentionItems({ ...base, receipts: [receipt('review_required')] })[0].text).toBe('1 účtenka čeká na vaši kontrolu')
  })

  it('lists deals on list items that end today or tomorrow, earliest first', () => {
    const productPrices = [
      product('Mléko', [{ dealPrice: 30, dealValidUntil: '2026-09-26' }]),
      product('Máslo', [{ dealPrice: 30, dealValidUntil: '2026-09-25', store: 'Penny' }]),
      product('Káva', [{ dealPrice: 30, dealValidUntil: '2026-09-30' }]), // ends later
      product('Chléb', [{ dealPrice: 30, dealValidUntil: '2026-09-25' }]), // not on the list
    ]
    const items = attentionItems({ ...base, productPrices, listNames: ['mléko', 'Máslo', 'Káva'] })
    expect(items.map((item) => item.text)).toEqual(['Akce na Máslo končí dnes · Penny', 'Akce na Mléko končí zítra · Lidl'])
    expect(items.every((item) => item.tab === 'Nákup')).toBe(true)
  })

  it('shows one line per product, for its earliest-ending deal, and ignores ended ones', () => {
    const productPrices = [product('Mléko', [{ dealPrice: 30, dealValidUntil: '2026-09-26' }, { store: 'Penny', dealPrice: 28, dealValidUntil: '2026-09-25' }, { store: 'Billa', dealPrice: 25, dealValidUntil: '2026-09-24' }])]
    expect(attentionItems({ ...base, productPrices, listNames: ['Mléko'] }).map((item) => item.text)).toEqual(['Akce na Mléko končí dnes · Penny'])
  })

  it('treats the last day of a month correctly', () => {
    const productPrices = [product('Mléko', [{ dealPrice: 30, dealValidUntil: '2026-10-01' }])]
    expect(attentionItems({ ...base, today: '2026-09-30', productPrices, listNames: ['Mléko'] })[0].text).toBe('Akce na Mléko končí zítra · Lidl')
  })
})
