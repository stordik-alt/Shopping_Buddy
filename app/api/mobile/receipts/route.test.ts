import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) {
      super(code)
    }
  }
  return {
    mobileUserFromRequest: vi.fn(),
    mobileHouseholdForUser: vi.fn(),
    MobileRequestAuthError: AuthError,
    getPendingReceiptImports: vi.fn(),
    uploadReceiptForHousehold: vi.fn(),
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  mobileHouseholdForUser: mocks.mobileHouseholdForUser,
  MobileRequestAuthError: mocks.MobileRequestAuthError,
}))
vi.mock('@/lib/db/queries', () => ({ getPendingReceiptImports: mocks.getPendingReceiptImports }))
vi.mock('@/lib/receipt-upload-server', () => ({
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  uploadReceiptForHousehold: mocks.uploadReceiptForHousehold,
}))

import { GET, POST } from '@/app/api/mobile/receipts/route'

const authenticatedHeaders = { Authorization: ['Bearer', 'route-test'].join(' ') }
const receipt = { id: 'receipt-1', status: 'uploaded' }

describe('/api/mobile/receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'owner' })
    mocks.getPendingReceiptImports.mockResolvedValue([receipt])
    mocks.uploadReceiptForHousehold.mockResolvedValue({ ok: true, receipt })
  })

  it('requires verified auth and a server-resolved household before listing', async () => {
    mocks.mobileUserFromRequest.mockRejectedValueOnce(new mocks.MobileRequestAuthError('not_signed_in', 401))
    const noAuth = await GET(new Request('https://anitka.example/api/mobile/receipts'))
    expect(noAuth.status).toBe(401)
    expect(mocks.mobileUserFromRequest).toHaveBeenCalledOnce()

    mocks.mobileHouseholdForUser.mockResolvedValue(null)
    const noHousehold = await GET(new Request('https://anitka.example/api/mobile/receipts', { headers: authenticatedHeaders }))
    expect(noHousehold.status).toBe(409)
    expect(await noHousehold.json()).toEqual({ error: 'household_required' })
    expect(mocks.getPendingReceiptImports).not.toHaveBeenCalled()
  })

  it('returns pending imports without caching and scopes them to the verified household', async () => {
    const response = await GET(new Request('https://anitka.example/api/mobile/receipts', { headers: authenticatedHeaders }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ receipts: [receipt] })
    expect(mocks.getPendingReceiptImports).toHaveBeenCalledWith('household-1')
  })

  it('accepts the verified cookie session used by the local native app', async () => {
    const request = new Request('https://anitka.example/api/mobile/receipts', {
      headers: { Cookie: 'better-auth.session_token=local-session' },
    })

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mocks.mobileUserFromRequest).toHaveBeenCalledWith(request)
    expect(mocks.getPendingReceiptImports).toHaveBeenCalledWith('household-1')
  })

  it('rejects malformed uploads and passes valid multipart files to the shared R2 uploader', async () => {
    const invalid = await POST(new Request('https://anitka.example/api/mobile/receipts', {
      method: 'POST',
      headers: authenticatedHeaders,
      body: JSON.stringify({ file: 'not multipart' }),
    }))
    expect(invalid.status).toBe(400)
    expect(mocks.uploadReceiptForHousehold).not.toHaveBeenCalled()

    const form = new FormData()
    form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'receipt.jpg', { type: 'image/jpeg' }))
    const response = await POST(new Request('https://anitka.example/api/mobile/receipts', {
      method: 'POST',
      headers: authenticatedHeaders,
      body: form,
    }))
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ receipt })
    expect(mocks.uploadReceiptForHousehold).toHaveBeenCalledWith('household-1', expect.any(File))
  })

  it('preserves upload validation messages and appropriate HTTP status codes', async () => {
    mocks.uploadReceiptForHousehold.mockResolvedValue({
      ok: false,
      code: 'unsupported_format',
      error: 'Nepodporovaný formát.',
    })
    const form = new FormData()
    form.append('file', new File(['x'], 'receipt.heic', { type: 'image/heic' }))
    const response = await POST(new Request('https://anitka.example/api/mobile/receipts', {
      method: 'POST',
      headers: authenticatedHeaders,
      body: form,
    }))
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ error: 'unsupported_format', message: 'Nepodporovaný formát.' })
  })
})
