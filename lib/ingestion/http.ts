// Shared HTTP settings for the store connectors.

// Upper bound for a single request to a retailer. Without one, a source that accepts the connection
// and then stalls would hold the whole cron invocation until the platform kills it, taking every
// other store's ingestion (and the response) down with it (CLAUDE.md section 32: a failing source
// must not take the rest of the application down). 20 s is far above the ~0.1-2 s real responses.
export const FETCH_TIMEOUT_MS = 20_000

/** `fetch` with a hard timeout. A timeout is rethrown as a plain, descriptive Error (the raw
 *  `TimeoutError` says only "The operation was aborted due to timeout"), so the failing source and
 *  URL show up in the cron response. Non-timeout failures propagate unchanged. `timeoutMs` is for a
 *  source that is slow by nature (a whole-country map query), not for retailers. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`)
    }
    throw err
  }
}
