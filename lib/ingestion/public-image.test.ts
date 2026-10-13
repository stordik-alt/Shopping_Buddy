import { describe, expect, it, vi } from 'vitest'
import { fetchPublicImage } from '@/lib/ingestion/public-image'

const publicHost = async () => [{ address: '93.184.216.34' }]
const image = (init: ResponseInit = {}, body = 'jpegbytes') => new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' }, ...init })

describe('fetchPublicImage', () => {
  it('returns the bytes and content type of a public https image, asking not to follow redirects itself', async () => {
    const get = vi.fn().mockResolvedValue(image())
    const result = await fetchPublicImage('https://cdn.example.com/p1.jpg', { 'User-Agent': 't' }, { get, resolve: publicHost })
    expect(new TextDecoder().decode(result.bytes)).toBe('jpegbytes')
    expect(result.contentType).toBe('image/jpeg')
    expect(get.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })

  it('refuses a URL in a private range before any request is made', async () => {
    const get = vi.fn()
    await expect(fetchPublicImage('https://169.254.169.254/latest/meta-data', {}, { get, resolve: publicHost })).rejects.toThrow('blocked')
    await expect(fetchPublicImage('http://cdn.example.com/p1.jpg', {}, { get, resolve: publicHost })).rejects.toThrow('HTTPS')
    expect(get).not.toHaveBeenCalled()
  })

  it('follows a redirect to another public host, and refuses one into the private network', async () => {
    const ok = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://img.example.net/p1.jpg' } })).mockResolvedValueOnce(image())
    await expect(fetchPublicImage('https://cdn.example.com/p1.jpg', {}, { get: ok, resolve: publicHost })).resolves.toBeDefined()
    expect(ok).toHaveBeenCalledTimes(2)

    const bad = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/admin' } }))
    await expect(fetchPublicImage('https://cdn.example.com/p1.jpg', {}, { get: bad, resolve: publicHost })).rejects.toThrow('blocked')
    expect(bad).toHaveBeenCalledTimes(1)
  })

  it('gives up on a redirect loop, a failed response and a body over the limit', async () => {
    const loop = vi.fn().mockImplementation(async () => new Response(null, { status: 301, headers: { location: 'https://cdn.example.com/again.jpg' } }))
    await expect(fetchPublicImage('https://cdn.example.com/p1.jpg', {}, { get: loop, resolve: publicHost })).rejects.toThrow('too many times')
    await expect(fetchPublicImage('https://cdn.example.com/p1.jpg', {}, { get: async () => new Response('x', { status: 404 }), resolve: publicHost })).rejects.toThrow('HTTP 404')
    await expect(fetchPublicImage('https://cdn.example.com/p1.jpg', {}, { get: async () => image({}, 'x'.repeat(20)), resolve: publicHost, maxBytes: 10 })).rejects.toThrow('too large')
    await expect(fetchPublicImage('https://cdn.example.com/p1.jpg', {}, { get: async () => image({ headers: { 'content-length': '999', 'content-type': 'image/jpeg' } }), resolve: publicHost, maxBytes: 10 })).rejects.toThrow('too large')
  })
})
