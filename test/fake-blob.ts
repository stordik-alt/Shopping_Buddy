// In-memory stand-in for `@vercel/blob`, used by the receipt tests.
//
// Those tests used to write real (private) objects to the production Blob store on every run. That
// costs paid operations and, when the store hit its usage limit and was suspended
// ("This store has been suspended"), it made the whole suite fail for a reason unrelated to the code
// under test — while the same suspension also broke receipt upload in the live app. Tests now use
// this fake by default; set USE_REAL_BLOB=1 to run them against the real store deliberately.
//
// It implements only what the code under test calls: `put`, `get`, `del`, and `list` for completeness.
// The shapes mirror the real SDK's for those fields (`url`, `pathname`, `statusCode`, `stream`,
// `blob.contentType`), so the code cannot pass here by relying on something the real SDK lacks.

type StoredBlob = { pathname: string; contentType: string; bytes: Uint8Array }

const store = new Map<string, StoredBlob>()

const BASE_URL = 'https://fake-blob.invalid/'

type PutBody = string | Blob | ArrayBuffer | ArrayBufferView | Buffer

async function toBytes(body: PutBody): Promise<Uint8Array> {
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))
  return new Uint8Array(body.slice(0))
}

export async function put(pathname: string, body: PutBody, options: { access: 'private' | 'public'; contentType?: string }) {
  const bytes = await toBytes(body)
  // The real SDK adds a random suffix only when asked to; here every put gets a unique URL so two
  // tests writing the same path never see each other's data.
  const url = `${BASE_URL}${crypto.randomUUID()}/${pathname}`
  const contentType = options.contentType ?? 'application/octet-stream'
  store.set(url, { pathname, contentType, bytes })
  return { url, downloadUrl: url, pathname, contentType, contentDisposition: 'inline' }
}

export async function get(urlOrPathname: string, _options: { access: 'private' | 'public' }) {
  const found = store.get(urlOrPathname)
  if (!found) return null
  const copy = found.bytes.slice()
  return {
    statusCode: 200 as const,
    stream: new Response(copy).body as ReadableStream<Uint8Array>,
    headers: new Headers({ 'content-type': found.contentType }),
    blob: { url: urlOrPathname, pathname: found.pathname, contentType: found.contentType, size: found.bytes.byteLength },
  }
}

export async function del(urls: string | string[]) {
  for (const url of Array.isArray(urls) ? urls : [urls]) store.delete(url)
}

export async function list(options: { prefix?: string; limit?: number } = {}) {
  const blobs = [...store.entries()]
    .filter(([, blob]) => !options.prefix || blob.pathname.startsWith(options.prefix))
    .slice(0, options.limit ?? 1000)
    .map(([url, blob]) => ({ url, pathname: blob.pathname, size: blob.bytes.byteLength }))
  return { blobs, hasMore: false as const }
}

/** How many objects the fake currently holds — lets a test assert that cleanup happened. */
export const fakeBlobCount = () => store.size

export const fakeBlobModule = { put, get, del, list }
