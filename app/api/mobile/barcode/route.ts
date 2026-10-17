import { NextResponse } from 'next/server'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { isValidGtin, openFoodFactsProductName } from '@/lib/barcode'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_UPSTREAM_RESPONSE_BYTES = 32 * 1024
const LOOKUP_TIMEOUT_MS = 5_000
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing upstream response body')

  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_UPSTREAM_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('Upstream response too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export async function POST(request: Request) {
  try {
    const user = await mobileUserFromRequest(request)
    const household = await mobileHouseholdForUser(user.id)
    if (!household) return json({ error: 'household_required' }, 409)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    const barcode = body && typeof body === 'object' && 'barcode' in body ? body.barcode : null
    if (typeof barcode !== 'string' || !isValidGtin(barcode)) return json({ error: 'invalid_barcode' }, 400)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
    try {
      const upstream = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,status,product_name,product_name_cs`,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'ANITKA/0.1 (mobile barcode lookup)' },
          signal: controller.signal,
          cache: 'no-store',
          redirect: 'error',
        },
      )
      if (!upstream.ok || !upstream.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        return json({ error: 'lookup_unavailable' }, 502)
      }

      let upstreamData: unknown
      try {
        upstreamData = await readBoundedJson(upstream)
      } catch {
        return json({ error: 'lookup_unavailable' }, 502)
      }
      const name = openFoodFactsProductName(upstreamData, barcode)
      if (!name) {
        const status = upstreamData && typeof upstreamData === 'object' && 'status' in upstreamData ? upstreamData.status : null
        if (status === 0) return json({ error: 'product_not_found' }, 404)
        return json({ error: 'lookup_unavailable' }, 502)
      }
      return json({ name })
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        return json({ error: 'lookup_timeout' }, 504)
      }
      console.error('[mobile barcode lookup]', error)
      return json({ error: 'lookup_unavailable' }, 502)
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    if (error instanceof MobileRequestAuthError) return json({ error: error.code }, error.status)
    console.error('[mobile barcode]', error)
    return json({ error: 'request_failed' }, 500)
  }
}
