import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mobileUserFromRequest, mobileHouseholdForUser, MobileRequestAuthError } = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(readonly code: string, readonly status: 401 | 403) {
      super(code)
    }
  }
  return { mobileUserFromRequest: vi.fn(), mobileHouseholdForUser: vi.fn(), MobileRequestAuthError: AuthError }
})

vi.mock('@/lib/auth/mobile-request', () => ({ mobileUserFromRequest, mobileHouseholdForUser, MobileRequestAuthError }))

import { POST } from '@/app/api/mobile/barcode/route'

const barcode = '4006381333931'
const request = (body: unknown = { barcode }) =>
  new Request('https://anitka.example/api/mobile/barcode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/mobile/barcode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue({ householdId: 'household-1', role: 'owner' })
  })

  it('requires an authenticated household before making an external request', async () => {
    mobileUserFromRequest.mockRejectedValue(new MobileRequestAuthError('not_signed_in', 401))
    expect((await POST(request())).status).toBe(401)

    mobileUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mobileHouseholdForUser.mockResolvedValue(null)
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'household_required' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([{ barcode: '4006381333932' }, { barcode: 'ABC' }, { barcode: '123456789' }, {}, null])(
    'rejects invalid input before lookup: %j',
    async (body) => {
      const response = await POST(request(body))
      expect(response.status).toBe(400)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('looks up a valid GTIN with a fixed Open Food Facts URL and returns the Czech name without caching', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        code: barcode,
        status: 1,
        product: { product_name: 'Generic name', product_name_cs: 'Český název' },
      }),
    )
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ name: 'Český název' })
    expect(fetch).toHaveBeenCalledWith(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=code,status,product_name,product_name_cs`,
      expect.objectContaining({
        cache: 'no-store',
        redirect: 'error',
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('ANITKA') }),
      }),
    )
  })

  it('distinguishes an unknown barcode from an unusable upstream response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ code: barcode, status: 0, product: null }))
    expect((await POST(request())).status).toBe(404)

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ code: 'different', status: 1, product: { product_name: 'Wrong' } }))
    expect((await POST(request())).status).toBe(502)
  })

  it('rejects oversized or non-JSON upstream responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array(32 * 1024 + 1), { headers: { 'content-type': 'application/json' } }),
    )
    expect((await POST(request())).status).toBe(502)

    vi.mocked(fetch).mockResolvedValueOnce(new Response('not json', { headers: { 'content-type': 'text/html' } }))
    expect((await POST(request())).status).toBe(502)
  })

  it('returns a retryable timeout response when the lookup is aborted', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const response = await POST(request())
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ error: 'lookup_timeout' })
  })
})
