import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertSafeRecipeUrl, fetchRecipeHtml } from '@/lib/recipes/fetch'

afterEach(() => vi.restoreAllMocks())

describe('recipe URL safety', () => {
  it('rejects non-HTTPS URLs', async () => {
    await expect(assertSafeRecipeUrl('http://example.com/recept', ['example.com'])).rejects.toThrow('HTTPS')
  })

  it('rejects hosts outside the allowlist', async () => {
    await expect(assertSafeRecipeUrl('https://example.net/recept', ['example.com'])).rejects.toThrow('domain is not allowed')
  })

  it('rejects localhost before any network lookup', async () => {
    await expect(assertSafeRecipeUrl('https://localhost/recept', ['localhost'])).rejects.toThrow('domain is not allowed')
  })

  it('rejects private IP literals', async () => {
    await expect(assertSafeRecipeUrl('https://127.0.0.1/recept', ['127.0.0.1'])).rejects.toThrow('IP is not allowed')
  })
})

describe('fetchRecipeHtml', () => {
  it('rejects unsupported content types', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(fetchRecipeHtml('https://93.184.216.34/recept', ['93.184.216.34'])).rejects.toThrow('unsupported content type')
  })

  it('enforces the response byte limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('12345'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })))

    await expect(fetchRecipeHtml('https://93.184.216.34/recept', ['93.184.216.34'], { maxBytes: 4 })).rejects.toThrow('too large')
  })
})
