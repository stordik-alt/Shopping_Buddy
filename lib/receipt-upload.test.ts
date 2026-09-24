import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertReceiptFitsUpload, MAX_RECEIPT_UPLOAD_BYTES, optimizeReceiptImage } from './receipt-upload'

describe('optimizeReceiptImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    class FakeImage {
      naturalWidth = 4000
      naturalHeight = 3000
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
      })),
      toBlob: vi.fn((callback: BlobCallback, _type?: string, quality?: number) => {
        const ratio = quality ?? 1
        const size = Math.round(2_000_000 + ratio * 2_000_000)
        callback(new Blob([new Uint8Array(size)]))
      }),
    }

    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:receipt'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('leaves a small image untouched', async () => {
    const file = new File([new Uint8Array(100)], 'receipt.jpg', { type: 'image/jpeg' })

    await expect(optimizeReceiptImage(file)).resolves.toBe(file)
  })

  it('leaves PDFs untouched even when they are large', async () => {
    const file = new File([new Uint8Array(MAX_RECEIPT_UPLOAD_BYTES + 1)], 'receipt.pdf', {
      type: 'application/pdf',
    })

    await expect(optimizeReceiptImage(file)).resolves.toBe(file)
  })

  it('resizes and compresses a large camera image below the upload target', async () => {
    const file = new File([new Uint8Array(MAX_RECEIPT_UPLOAD_BYTES + 1)], 'receipt.png', {
      type: 'image/png',
      lastModified: 123,
    })

    const optimized = await optimizeReceiptImage(file)

    expect(optimized).not.toBe(file)
    expect(optimized.type).toBe('image/jpeg')
    expect(optimized.name).toBe('receipt.jpg')
    expect(optimized.size).toBeLessThanOrEqual(MAX_RECEIPT_UPLOAD_BYTES)
    expect(optimized.lastModified).toBe(123)
  })

  it('keeps the base64 request body under the 4.5 MB platform limit', async () => {
    const file = new File([new Uint8Array(MAX_RECEIPT_UPLOAD_BYTES + 1)], 'receipt.png', { type: 'image/png' })

    const optimized = await optimizeReceiptImage(file)

    // Base64 encodes 3 bytes as 4 characters.
    expect(Math.ceil(optimized.size / 3) * 4).toBeLessThan(4.5 * 1000 * 1000)
  })
})

describe('assertReceiptFitsUpload', () => {
  it('accepts a file within the limit', () => {
    const file = new File([new Uint8Array(MAX_RECEIPT_UPLOAD_BYTES)], 'receipt.pdf', { type: 'application/pdf' })

    expect(() => assertReceiptFitsUpload(file)).not.toThrow()
  })

  it('rejects an oversized file with a readable message', () => {
    const file = new File([new Uint8Array(MAX_RECEIPT_UPLOAD_BYTES + 1)], 'receipt.pdf', { type: 'application/pdf' })

    expect(() => assertReceiptFitsUpload(file)).toThrow(/příliš velký/)
  })
})
