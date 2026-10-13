import { describe, expect, it } from 'vitest'
import { assertPublicHttpsUrl, isBlockedIp } from '@/lib/ssrf'

describe('isBlockedIp', () => {
  it.each([
    '0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '100.64.0.1', '100.127.255.255', '198.18.0.1', '198.19.255.255', '192.0.0.8', '192.0.2.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'febf::1', 'fec0::1', 'ff02::1', '2001:db8::1',
    '::ffff:169.254.169.254', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '::ffff:7f00:1', '::ffff:10.0.0.1', '::127.0.0.1',
    '64:ff9b::a9fe:a9fe', '2002:a9fe:a9fe::1', '[::1]', 'not-an-ip', '1.2.3', '256.1.1.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1', '198.17.255.255', '198.20.0.1', '2606:4700:4700::1111', '2a00:1450:4001::200e', '::ffff:8.8.8.8', '64:ff9b::808:808'])('allows %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false)
  })
})

describe('assertPublicHttpsUrl', () => {
  const publicHost = async () => [{ address: '93.184.216.34' }]

  it('accepts an https URL on a public host and returns it parsed', async () => {
    const url = await assertPublicHttpsUrl('https://cdn.example.com/page-1.jpg', publicHost)
    expect(url.hostname).toBe('cdn.example.com')
  })

  it('refuses a URL that is not https, has credentials, or is not a URL', async () => {
    await expect(assertPublicHttpsUrl('http://cdn.example.com/a.jpg', publicHost)).rejects.toThrow('HTTPS')
    await expect(assertPublicHttpsUrl('https://user:pw@cdn.example.com/a.jpg', publicHost)).rejects.toThrow('credentials')
    await expect(assertPublicHttpsUrl('nonsense', publicHost)).rejects.toThrow('not valid')
  })

  it('refuses IP literals in blocked ranges, including IPv4 wrapped in IPv6', async () => {
    for (const host of ['169.254.169.254', '127.0.0.1', '[::1]', '[::ffff:169.254.169.254]', '100.64.0.1']) {
      await expect(assertPublicHttpsUrl(`https://${host}/x`, publicHost)).rejects.toThrow('blocked')
    }
    await expect(assertPublicHttpsUrl('https://8.8.8.8/x', publicHost)).resolves.toBeInstanceOf(URL)
  })

  it('refuses a name that resolves to a blocked address, also when only one answer is blocked, or none', async () => {
    await expect(assertPublicHttpsUrl('https://evil.example.com/x', async () => [{ address: '10.0.0.5' }])).rejects.toThrow('blocked')
    await expect(assertPublicHttpsUrl('https://evil.example.com/x', async () => [{ address: '93.184.216.34' }, { address: '::ffff:169.254.169.254' }])).rejects.toThrow('blocked')
    await expect(assertPublicHttpsUrl('https://evil.example.com/x', async () => [])).rejects.toThrow('blocked')
  })
})
