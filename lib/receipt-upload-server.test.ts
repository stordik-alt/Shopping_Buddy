import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
  }
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
  }
  return {
    db,
    query,
    putReceiptFile: vi.fn(),
    toReceiptImportState: vi.fn(),
  }
})

vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }))
vi.mock('@/lib/db/queries', () => ({ toReceiptImportState: mocks.toReceiptImportState }))
vi.mock('@/lib/storage', () => ({ putReceiptFile: mocks.putReceiptFile }))

import { MAX_IMAGE_BYTES, uploadReceiptForHousehold } from './receipt-upload-server'

const row = { id: 'receipt-1', status: 'uploaded' }
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'receipt.jpg', { type: 'text/plain' })

describe('uploadReceiptForHousehold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.select.mockReturnValue(mocks.query)
    mocks.db.insert.mockReturnValue(mocks.query)
    mocks.query.from.mockReturnValue(mocks.query)
    mocks.query.where.mockResolvedValue([{ recent: 0 }])
    mocks.query.values.mockReturnValue(mocks.query)
    mocks.query.returning.mockResolvedValue([row])
    mocks.putReceiptFile.mockResolvedValue('r2:receipts/household-1/photo.jpg')
    mocks.toReceiptImportState.mockReturnValue(row)
  })

  it('rejects missing, empty, and oversized files before database or storage access', async () => {
    await expect(uploadReceiptForHousehold('household-1', null)).resolves.toMatchObject({ ok: false, code: 'invalid_file' })
    await expect(uploadReceiptForHousehold('household-1', new File([], 'empty.jpg'))).resolves.toMatchObject({ ok: false, code: 'empty_file' })
    await expect(
      uploadReceiptForHousehold('household-1', new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.jpg')),
    ).resolves.toMatchObject({ ok: false, code: 'image_too_large' })
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.putReceiptFile).not.toHaveBeenCalled()
  })

  it('detects the real file format, stores it in the household R2 path, and creates the existing upload state', async () => {
    await expect(uploadReceiptForHousehold('household-1', jpeg())).resolves.toEqual({ ok: true, receipt: row })
    expect(mocks.putReceiptFile).toHaveBeenCalledWith(
      'household-1',
      Buffer.from([0xff, 0xd8, 0xff]),
      { kind: 'supported', mimeType: 'image/jpeg', extension: 'jpg' },
    )
    expect(mocks.query.values).toHaveBeenCalledWith({
      householdId: 'household-1',
      status: 'uploaded',
      source: 'ocr',
      imageUrl: 'r2:receipts/household-1/photo.jpg',
    })
  })

  it('rejects HEIC and unknown bytes using byte detection, not the declared MIME type', async () => {
    const heic = new File([Buffer.from('0000ftypheic')], 'receipt.jpg', { type: 'image/jpeg' })
    await expect(uploadReceiptForHousehold('household-1', heic)).resolves.toMatchObject({
      ok: false,
      code: 'unsupported_format',
      error: expect.stringContaining('HEIC/HEIF'),
    })
    await expect(uploadReceiptForHousehold('household-1', new File(['not an image'], 'receipt.jpg', { type: 'image/jpeg' })))
      .resolves.toMatchObject({ ok: false, code: 'unsupported_format' })
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.putReceiptFile).not.toHaveBeenCalled()
  })

  it('preserves the household upload limit without storing or importing another file', async () => {
    mocks.query.where.mockResolvedValue([{ recent: 30 }])
    await expect(uploadReceiptForHousehold('household-1', jpeg())).resolves.toMatchObject({ ok: false, code: 'upload_limit' })
    expect(mocks.putReceiptFile).not.toHaveBeenCalled()
    expect(mocks.db.insert).not.toHaveBeenCalled()
  })
})
