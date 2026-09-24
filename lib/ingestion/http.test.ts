import { afterEach, describe, expect, it, vi } from 'vitest'
import { FETCH_TIMEOUT_MS, fetchWithTimeout } from '@/lib/ingestion/http'

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes the request through with a timeout signal', async () => {
    const response = { ok: true } as Response
    const fetchMock = vi.fn(async () => response)
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchWithTimeout('https://example.test/x', { headers: { Accept: 'application/json' } })).toBe(response)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.test/x')
    expect(init.headers).toEqual({ Accept: 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('turns a timeout into a descriptive error naming the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }),
    )
    await expect(fetchWithTimeout('https://example.test/slow')).rejects.toThrow(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: https://example.test/slow`)
  })

  it('lets other failures through unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    await expect(fetchWithTimeout('https://example.test/x')).rejects.toThrow('fetch failed')
  })

  it('actually aborts a request that never answers', async () => {
    // AbortSignal.timeout uses a native timer that fake timers don't control, so a short real one
    // stands in for the 20 s limit; what is verified is the wiring: the signal reaches fetch, and a
    // request that never answers is cut off and reported as a timeout.
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), 10)
      return controller.signal
    })
    // A fetch that only settles when its signal aborts — like a server that accepts and stalls.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)))),
    )
    await expect(fetchWithTimeout('https://example.test/stall')).rejects.toThrow('Request timed out')
    expect(timeoutSpy).toHaveBeenCalledWith(FETCH_TIMEOUT_MS)
    timeoutSpy.mockRestore()
  })
})
