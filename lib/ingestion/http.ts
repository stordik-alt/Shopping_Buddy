// Shared HTTP settings for the store connectors.

// Upper bound for a single request to a retailer. Without one, a source that accepts the connection
// and then stalls would hold the whole cron invocation until the platform kills it, taking every
// other store's ingestion (and the response) down with it (CLAUDE.md section 32: a failing source
// must not take the rest of the application down). 20 s is far above the ~0.1-2 s real responses.
export const FETCH_TIMEOUT_MS = 20_000

/** Well above undici's ~16 KB default — lidl.cz's own full pages (not its JSON/XML endpoints) send a
 *  multi-KB Content-Security-Policy header that trips the default limit (`UND_ERR_HEADERS_OVERFLOW`,
 *  found live 2026-09-28 fetching its flyer listing page for lib/ingestion/lidl-flyer.ts). */
const FALLBACK_MAX_HEADER_SIZE = 262_144

/** `node:https`, for the one retry path above — dynamically imported so nothing else pays for it. */
async function fetchWithLargerHeaders(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const { request } = await import('node:https')
  const headers = init.headers ? Object.fromEntries(new Headers(init.headers)) : undefined
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET', headers, maxHeaderSize: FALLBACK_MAX_HEADER_SIZE, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0, headers: Object.entries(res.headers).flatMap(([k, v]) => (v == null ? [] : [[k, String(v)] as [string, string]])) })))
    })
    req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`)))
    req.on('error', reject)
    req.end()
  })
}

/** `fetch` with a hard timeout. A timeout is rethrown as a plain, descriptive Error (the raw
 *  `TimeoutError` says only "The operation was aborted due to timeout"), so the failing source and
 *  URL show up in the cron response. Non-timeout failures propagate unchanged, except an oversized
 *  response header (`UND_ERR_HEADERS_OVERFLOW`), retried once via `node:https` with a higher limit
 *  rather than failing a source outright over a header undici's default is simply too small for.
 *  `timeoutMs` is for a source that is slow by nature (a whole-country map query), not for retailers. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`)
    }
    const code = (err as { cause?: { code?: string } })?.cause?.code
    if (code === 'UND_ERR_HEADERS_OVERFLOW') return fetchWithLargerHeaders(url, init, timeoutMs)
    throw err
  }
}
