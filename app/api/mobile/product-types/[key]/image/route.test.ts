import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) {
      super(code)
    }
  }
  return {
    AuthError,
    mobileUserFromRequest: vi.fn(),
    findFirst: vi.fn(),
    r2GetObject: vi.fn(),
  }
})

vi.mock('@/lib/auth/mobile-request', () => ({
  mobileUserFromRequest: mocks.mobileUserFromRequest,
  MobileRequestAuthError: mocks.AuthError,
}))
vi.mock('@/lib/db/client', () => ({ getDb: () => ({ query: { productTypes: { findFirst: mocks.findFirst } } }) }))
vi.mock('@/lib/storage/r2', () => ({ r2GetObject: mocks.r2GetObject }))

import { GET } from '@/app/api/mobile/product-types/[key]/image/route'

const request = (authorization?: string) => new Request('https://anitka.example/api/mobile/product-types/mleko/image', {
  headers: authorization ? { Authorization: authorization } : {},
})
const context = { params: Promise.resolve({ key: 'mleko' }) }

describe('GET /api/mobile/product-types/[key]/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mocks.findFirst.mockResolvedValue({ imageRef: 'r2:product-types/mleko.webp' })
    mocks.r2GetObject.mockResolvedValue({ body: new Response('image-bytes').body, contentType: 'image/webp' })
  })

  it('serves a catalog photo to an authenticated mobile user', async () => {
    const response = await GET(request('Bearer unit-test-access'), context)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.r2GetObject).toHaveBeenCalledWith('r2:product-types/mleko.webp')
  })

  it('rejects unauthenticated requests before accessing the catalog', async () => {
    mocks.mobileUserFromRequest.mockRejectedValue(new mocks.AuthError('invalid_token', 401))
    expect((await GET(request('Bearer expired'), context)).status).toBe(401)
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.r2GetObject).not.toHaveBeenCalled()
  })

  it('returns not found for an invalid or image-less product type', async () => {
    expect((await GET(request('Bearer unit-test-access'), { params: Promise.resolve({ key: '../private' }) })).status).toBe(404)
    mocks.findFirst.mockResolvedValueOnce({ imageRef: null })
    expect((await GET(request('Bearer unit-test-access'), context)).status).toBe(404)
    expect(mocks.r2GetObject).not.toHaveBeenCalled()
  })
})
