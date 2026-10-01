import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.7',
  'User-Agent': 'ANITKA Recipe Importer/1.0 (+https://github.com/stordik-alt/Shopping_Buddy)',
}
const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal'])

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true
  const [a, b] = octets
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
}

function isBlockedIp(ip: string): boolean {
  return isIP(ip) === 4 ? isPrivateIpv4(ip) : isIP(ip) === 6 ? isPrivateIpv6(ip) : true
}

export async function assertSafeRecipeUrl(url: string, allowedDomains: readonly string[]): Promise<URL> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('Recipe source must use HTTPS')

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  const allowed = allowedDomains.some((domain) => hostname === domain || hostname.endsWith('.' + domain))
  if (!allowed || BLOCKED_HOSTNAMES.has(hostname)) throw new Error('Recipe source domain is not allowed')

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error('Recipe source IP is not allowed')
    return parsed
  }

  const addresses = await lookup(hostname, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error('Recipe source resolves to a blocked IP')
  }

  return parsed
}

export async function fetchRecipeHtml(
  url: string,
  allowedDomains: readonly string[],
  options: {
    timeoutMs?: number
    maxBytes?: number
    allowedContentTypes?: readonly string[]
  } = {},
): Promise<string> {
  let current = await assertSafeRecipeUrl(url, allowedDomains)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetch(current, {
        signal: controller.signal,
        headers: DEFAULT_HEADERS,
        redirect: 'manual',
        cache: 'no-store',
      })

      if (response.status >= 300 && response.status < 400) {
        if (redirectCount === MAX_REDIRECTS) throw new Error('Recipe source redirected too many times')
        const location = response.headers.get('location')
        if (!location) throw new Error('Recipe source returned a redirect without a location')
        current = await assertSafeRecipeUrl(new URL(location, current).toString(), allowedDomains)
        continue
      }

      if (!response.ok) throw new Error('Recipe source returned HTTP ' + response.status)

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    const allowedContentTypes = options.allowedContentTypes ?? ['text/html', 'application/xhtml+xml']
    if (!allowedContentTypes.some((allowedType) => contentType.includes(allowedType))) {
      throw new Error('Recipe source returned an unsupported content type')
    }

    const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error('Recipe source response is too large')
    }
    if (!response.body) throw new Error('Recipe source returned no body')

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('Recipe source response is too large')
      }
      chunks.push(value)
    }

    const result = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }

      return new TextDecoder().decode(result)
    }

    throw new Error('Recipe source redirect handling failed')
  } finally {
    clearTimeout(timeout)
  }
}
