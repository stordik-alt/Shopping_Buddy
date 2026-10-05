import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { RECEIPT_READING_PROMPT_VERSION } from '@/lib/receipt-reading-prompt'
import {
  clampConfidence,
  createLunaReceiptReader,
  receiptDecision,
  receiptReadingMessage,
  receiptReadingSchema,
  toExtractedReceipt,
  type ReceiptReading,
} from '@/lib/receipt-reading'
import { needsReview } from '@/lib/receipts'

function reading(overrides: Partial<ReceiptReading['receipt']> = {}, items?: Partial<ReceiptReading['items'][number]>[]): ReceiptReading {
  const item = (values: Partial<ReceiptReading['items'][number]>): ReceiptReading['items'][number] => ({
    rawName: 'KUŘ.PRSA 500G',
    normalizedName: 'Kuřecí prsa',
    quantity: 1,
    unit: 'ks',
    packageSize: 500,
    packageUnit: 'g',
    unitPrice: 119.8,
    lineTotal: 119.8,
    discount: 20,
    categoryHint: 'Potraviny',
    ean: null,
    confidence: 0.96,
    imageIndex: 0,
    ...values,
  })
  return {
    receipt: {
      merchant: 'Albert',
      storeAddress: 'Masarykova 1',
      storeCity: 'Brno',
      date: '2026-10-05',
      time: '18:42',
      receiptNumber: '4471',
      currency: 'CZK',
      subtotal: 119.8,
      discountTotal: 20,
      total: 99.8,
      confidence: 0.95,
      ...overrides,
    },
    items: (items ?? [{}]).map(item),
    images: [{ index: 0, readable: true, note: null }],
  }
}

describe('toExtractedReceipt', () => {
  it('keeps the printed text as the name and maps the rest onto the existing pipeline shape', () => {
    const extracted = toExtractedReceipt(reading())
    expect(extracted.store).toEqual({ name: 'Albert', address: 'Masarykova 1', city: 'Brno', confidence: 0.95 })
    expect(extracted.items[0]).toEqual({ name: 'KUŘ.PRSA 500G', category: 'Potraviny', quantity: 1, unit: 'ks', unitPrice: 119.8, totalPrice: 119.8, discount: 20, confidence: 0.96 })
    expect(extracted.total).toBe(99.8)
    // The app's own checks accept it: 119,80 − 20,00 = 99,80.
    expect(needsReview(extracted)).toBe(false)
  })

  it('drops a date that is not a real calendar date, which sends the receipt to review', () => {
    expect(toExtractedReceipt(reading({ date: '2026-02-30' })).date).toBeNull()
    expect(toExtractedReceipt(reading({ date: '5.10.2026' })).date).toBeNull()
    expect(needsReview(toExtractedReceipt(reading({ date: '05.10.2026' })))).toBe(true)
  })

  it('clamps confidence to 0–1 and treats nonsense as none', () => {
    expect(clampConfidence(1.4)).toBe(1)
    expect(clampConfidence(-0.2)).toBe(0)
    expect(clampConfidence(Number.NaN)).toBe(0)
  })
})

describe('receiptDecision', () => {
  it('imports on its own only when every check passes and everything is confident', () => {
    expect(receiptDecision(reading(), { checksPassed: true }).decision).toBe('auto')
    expect(receiptDecision(reading(), { checksPassed: false }).decision).toBe('review')
    expect(receiptDecision(reading({ confidence: 0.85 }), { checksPassed: true }).decision).toBe('review')
    expect(receiptDecision(reading({}, [{}, { confidence: 0.8 }]), { checksPassed: true }).decision).toBe('review')
    expect(receiptDecision(reading({}, []), { checksPassed: true }).decision).toBe('review')
  })

  it('points out doubtful items and asks for a new photo when the whole receipt is unreadable', () => {
    expect(receiptDecision(reading({}, [{}, { confidence: 0.5 }]), { checksPassed: true })).toEqual({ decision: 'review', doubtfulItems: [1] })
    expect(receiptDecision(reading({ confidence: 0.6 }), { checksPassed: true }).decision).toBe('retake')
    const blurred = { ...reading(), images: [{ index: 0, readable: false, note: 'rozmazané' }] }
    expect(receiptDecision(blurred, { checksPassed: true }).decision).toBe('retake')
  })
})

describe('receipt reading request', () => {
  it('sends the instructions and every photo in order, or the text layer', () => {
    const message = receiptReadingMessage({ images: [{ base64: Buffer.from('a').toString('base64'), mimeType: 'image/jpeg' }, { base64: Buffer.from('b').toString('base64'), mimeType: 'image/png' }] })
    expect(message.content[0]).toMatchObject({ type: 'text' })
    expect(message.content[0].type === 'text' && message.content[0].text).toContain('2 photo(s)')
    expect(message.content.slice(1).map((part) => part.type === 'file' && [part.mediaType, Buffer.from(part.data).toString()])).toEqual([
      ['image/jpeg', 'a'],
      ['image/png', 'b'],
    ])
    const text = receiptReadingMessage({ text: 'CELKEM 99,80' })
    expect(text.content).toHaveLength(1)
    expect(text.content[0].type === 'text' && text.content[0].text).toContain('CELKEM 99,80')
    expect(() => receiptReadingMessage({ images: [] })).toThrow()
  })

  it('calls GPT-6 Luna with the schema and the chosen reasoning effort, and reports usage', async () => {
    const generate = vi.fn().mockResolvedValue({ object: reading(), usage: { inputTokens: 1200, outputTokens: 300 } })
    const reader = createLunaReceiptReader({ reasoningEffort: 'none', generate: generate as never })
    const onUsage = vi.fn()
    expect(await reader.read({ text: 'x' }, { onUsage })).toEqual(reading())
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'openai/gpt-6-luna', schema: receiptReadingSchema, providerOptions: { openai: { reasoningEffort: 'none' } } }))
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 1200, outputTokens: 300 })
    expect(reader.id).toBe(`openai/gpt-6-luna:none:${RECEIPT_READING_PROMPT_VERSION}`)
  })

  it('has a strict schema: every key required, unknowns as null', () => {
    const jsonSchema = z.toJSONSchema(receiptReadingSchema) as { required: string[]; properties: Record<string, { required?: string[]; items?: { required?: string[]; properties: object } }> }
    expect(jsonSchema.required).toEqual(['receipt', 'items', 'images'])
    const item = jsonSchema.properties.items.items!
    expect(item.required).toEqual(Object.keys(item.properties))
    expect(receiptReadingSchema.safeParse({ ...reading(), receipt: { ...reading().receipt, total: undefined } }).success).toBe(false)
  })
})
