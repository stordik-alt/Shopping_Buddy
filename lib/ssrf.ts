import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Guards for fetching a URL that came from outside the app (a flyer page image named in a retailer's JSON, a
// recipe image) — docs/35_SECURITY_AUDIT.md, S20 and S21. Without them such a URL could point the server at
// its own network: cloud metadata (169.254.169.254), localhost services, a private address behind a DNS name.

/** The four bytes of a dotted IPv4 address, or null when it is not one. */
function ipv4Bytes(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN))
  return bytes.every((value) => value >= 0 && value <= 255) ? bytes : null
}

/** The eight 16-bit groups of an IPv6 address (an embedded dotted IPv4 tail included), or null. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0]
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const bytes = ipv4Bytes(dotted[2])
    if (!bytes) return null
    text = `${dotted[1]}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN))
  return groups.length === 8 && groups.every((group) => Number.isInteger(group)) ? groups : null
}

function blockedIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "this" network
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT, 100.64.0.0/10
    a === 127 ||
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // documentation
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking, 198.18.0.0/15
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast and reserved
  )
}

/** Whether a server must not connect to this address: loopback, private, link-local, carrier-grade NAT,
 *  documentation, multicast and reserved ranges, and an IPv6 address that only wraps one of those
 *  (`::ffff:169.254.169.254`, NAT64, 6to4). Anything that is not an IP address counts as blocked. */
export function isBlockedIp(ip: string): boolean {
  const address = ip.replace(/^\[|\]$/g, '')
  const version = isIP(address)
  if (version === 4) {
    const bytes = ipv4Bytes(address)
    return bytes === null || blockedIpv4(bytes)
  }
  if (version !== 6) return true
  const groups = ipv6Groups(address)
  if (!groups) return true
  const embedded = (high: number, low: number) => blockedIpv4([high >> 8, high & 255, low >> 8, low & 255])
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) return embedded(groups[6], groups[7]) // ::ffff:a.b.c.d
  if (groups.slice(0, 6).every((group) => group === 0)) return true // ::, ::1 and the deprecated IPv4-compatible form
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) return embedded(groups[6], groups[7]) // NAT64
  if (groups[0] === 0x2002) return embedded(groups[1], groups[2]) // 6to4
  if ((groups[0] & 0xfe00) === 0xfc00) return true // unique local, fc00::/7
  if ((groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xffc0) === 0xfec0) return true // link-local and site-local
  if ((groups[0] & 0xff00) === 0xff00) return true // multicast
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true // documentation
  return false
}

export type HostResolver = (hostname: string) => Promise<{ address: string }[]>

const defaultResolver: HostResolver = (hostname) => lookup(hostname, { all: true })

/** Parses `value` and refuses it unless it is an https URL whose host is a public address — an IP literal
 *  that is not blocked, or a name whose every resolved address is not blocked. The caller still fetches the
 *  URL itself, so a name that changes its answer between this check and the fetch (DNS rebinding) is not
 *  covered; a redirect must be checked again before it is followed (`fetchPublicImage` does). */
export async function assertPublicHttpsUrl(value: string, resolve: HostResolver = defaultResolver): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('URL is not valid')
  }
  if (parsed.protocol !== 'https:') throw new Error('URL must use HTTPS')
  if (parsed.username || parsed.password) throw new Error('URL must not carry credentials')
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error('URL points to a blocked address')
    return parsed
  }
  const addresses = await resolve(hostname)
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) throw new Error('URL host resolves to a blocked address')
  return parsed
}
