import { fetchWithTimeout } from '@/lib/ingestion/http'
import { assertPublicHttpsUrl, type HostResolver } from '@/lib/ssrf'

// Downloads an image whose URL came out of a retailer's flyer data (docs/35_SECURITY_AUDIT.md, S20): the
// page images are named by the source, so the URL is checked before it is fetched — https, a public address —
// every redirect is checked again instead of followed blindly, and the body has a size limit.
// No host allowlist: the image hosts differ between retailers and their CDNs change; the address check is
// what keeps the server away from its own network.

/** A flyer page image is some hundred kilobytes; far above that is not a page. */
export const MAX_FLYER_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_REDIRECTS = 3

export type PublicImage = { bytes: Uint8Array; contentType: string }

export async function fetchPublicImage(
  url: string,
  headers: HeadersInit,
  options: { get?: typeof fetchWithTimeout; resolve?: HostResolver; maxBytes?: number } = {},
): Promise<PublicImage> {
  const get = options.get ?? fetchWithTimeout
  const maxBytes = options.maxBytes ?? MAX_FLYER_IMAGE_BYTES
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checked = await assertPublicHttpsUrl(current, options.resolve)
    const response = await get(checked.toString(), { headers, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`flyer image redirect without a location: HTTP ${response.status}`)
      current = new URL(location, checked).toString()
      continue
    }
    if (!response.ok) throw new Error(`flyer image failed: HTTP ${response.status}`)
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error('flyer image is too large')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new Error('flyer image is too large')
    return { bytes, contentType: response.headers.get('content-type')?.split(';')[0] || 'image/jpeg' }
  }
  throw new Error('flyer image redirected too many times')
}
