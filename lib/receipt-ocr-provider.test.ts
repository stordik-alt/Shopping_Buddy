import { describe, expect, it } from 'vitest'
import { ocrProviderLabel } from '@/lib/receipt-ocr-provider'

describe('ocrProviderLabel', () => {
  it('names every provider the pipeline can record', () => {
    expect(ocrProviderLabel('pdf_text_layer')).toBe('Text přímo z PDF (bez OCR)')
    expect(ocrProviderLabel('azure_document_intelligence')).toBe('Azure Document Intelligence')
    expect(ocrProviderLabel('google_vision')).toBe('Google Cloud Vision')
  })

  it('shows an unknown or older value as the primary provider', () => {
    expect(ocrProviderLabel('something_else')).toBe('Google Cloud Vision')
  })
})
