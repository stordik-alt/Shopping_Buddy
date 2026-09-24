import { describe, expect, it } from 'vitest'
import { isUsableReceiptText, readPdfTextLayer } from '@/lib/receipt-pdf'
import { ALBERT_STYLE_RECEIPT_LINES, makeTextPdf } from '@/lib/receipt-pdf.test-helpers'

const base64 = (buffer: Buffer) => buffer.toString('base64')

describe('isUsableReceiptText', () => {
  it('accepts text with enough characters and several two-decimal amounts', () => {
    expect(isUsableReceiptText(ALBERT_STYLE_RECEIPT_LINES.join('\n'))).toBe(true)
    expect(isUsableReceiptText('Mleko polotucne 1 x 24,90 Kc\nChleb konzumni 1 x 39,90 Kc\nMaslo 250g 1 x 59,90 Kc\nCelkem 124,70 Kc')).toBe(true)
  })

  it('rejects text that is too short', () => {
    expect(isUsableReceiptText('1.00 2.00 3.00')).toBe(false)
    expect(isUsableReceiptText('')).toBe(false)
  })

  it('rejects long text without amounts (a page of prose, a footer)', () => {
    expect(isUsableReceiptText('Podminky pouziti a ochrana osobnich udaju. '.repeat(10))).toBe(false)
  })

  it('does not count integers or numbers with three decimals as amounts', () => {
    expect(isUsableReceiptText('Polozka jedna dva tri ctyri pet sest sedm osm devet deset 12 345 0.935 1.234'.padEnd(120, ' x'))).toBe(false)
  })
})

describe('readPdfTextLayer', () => {
  it('reads the embedded text of a digital PDF, line by line, weights included', async () => {
    const result = await readPdfTextLayer(base64(makeTextPdf(ALBERT_STYLE_RECEIPT_LINES)))
    expect(result.text).not.toBeNull()
    const lines = (result.text as string).split('\n').map((line) => line.trim())
    expect(lines).toContain('JABLKA GALA')
    expect(lines).toContain('0.43 x 34.90 Kc') // the line the OCR fallback dropped on the real receipt
    expect(lines).toContain('0.935 x 19.90 Kc')
    expect(lines).toContain('Celkem 47.50 Kc')
  })

  it('reports no usable text layer for a page without text (an image-only scan)', async () => {
    const result = await readPdfTextLayer(base64(makeTextPdf([], { withText: false })))
    expect(result).toEqual({ text: null, reason: 'the PDF has no usable text layer (scanned or image-only)' })
  })

  it('reports no usable text layer when the text is not receipt-like', async () => {
    const result = await readPdfTextLayer(base64(makeTextPdf(['Page 1 of 1'])))
    expect(result.text).toBeNull()
  })

  it('does not throw on bytes that are not a PDF; it reports why so OCR can take over', async () => {
    const result = await readPdfTextLayer(base64(Buffer.from('this is not a pdf at all')))
    expect(result.text).toBeNull()
    expect((result as { reason: string }).reason).toContain('could not be read')
  })

  it('does not throw on an empty file', async () => {
    expect((await readPdfTextLayer('')).text).toBeNull()
  })
})
