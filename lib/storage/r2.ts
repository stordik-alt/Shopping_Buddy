import { AwsClient } from 'aws4fetch'
import type { ReceiptFileStore } from '@/lib/storage/types'

// Cloudflare R2 through its S3-compatible API. The app runs on Vercel, where there is no R2 Worker
// binding, so requests are signed with an R2 API token (SigV4). `aws4fetch` is used instead of the
// AWS SDK: it only signs `fetch` requests (a few kB, no dependencies) and also runs on Workers,
// should hosting move there later. The bucket is private; nothing here produces a public URL.
// Credentials are server-only environment variables and are never logged.

const R2_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'] as const

type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }

// Values are trimmed: a value pasted into the Vercel dashboard with a trailing newline made R2 reject
// the first production upload ("InvalidBucketName ... shoppingbuddyprod\n"). None of these values can
// legitimately contain surrounding whitespace.
const env = (name: (typeof R2_ENV)[number]) => process.env[name]?.trim() ?? ''

function readConfig(): R2Config {
  const missing = R2_ENV.filter((name) => !env(name))
  if (missing.length > 0) throw new Error(`R2 storage is not configured. Missing: ${missing.join(', ')}`)
  return {
    accountId: env('R2_ACCOUNT_ID'),
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    bucket: env('R2_BUCKET_NAME'),
  }
}

/** Object URL on R2's S3 endpoint. Each key segment is encoded, the separators are kept. */
export function r2ObjectUrl(config: Pick<R2Config, 'accountId' | 'bucket'>, key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}/${path}`
}

let cached: { config: R2Config; client: AwsClient } | null = null

function client(): { config: R2Config; client: AwsClient } {
  const config = readConfig()
  // Rebuild when the environment changed (tests switch it); normally built once per instance.
  if (!cached || JSON.stringify(cached.config) !== JSON.stringify(config)) {
    cached = {
      config,
      client: new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: 's3', region: 'auto' }),
    }
  }
  return cached
}

async function failure(action: string, response: Response): Promise<Error> {
  // R2 answers errors with a small S3 XML document (code + message, no secrets). Keep a bounded
  // excerpt so the server log says why, e.g. AccessDenied or NoSuchBucket.
  const detail = (await response.text().catch(() => '')).slice(0, 300)
  return new Error(`R2 ${action} failed (${response.status}): ${detail}`)
}

/** Signs a request and sends it with a plain `fetch(url, init)`.
 *
 *  `aws4fetch`'s own `fetch()` wraps the request in a `Request` object, whose body is a stream. On
 *  Vercel, Next.js's patched `fetch` re-sends such a body as a stream with chunked transfer encoding
 *  and no `Content-Length`, and R2 rejects every PUT without one (411 MissingContentLength — the
 *  second production upload). So only the signature comes from `aws4fetch`; the body goes out as
 *  bytes with an explicit length. */
async function send(method: 'PUT' | 'GET' | 'DELETE', key: string, upload?: { body: Buffer; contentType: string }): Promise<Response> {
  const { config, client: aws } = client()
  const body = upload ? new Uint8Array(upload.body) : undefined
  const headers: Record<string, string> = upload ? { 'Content-Type': upload.contentType, 'Content-Length': String(upload.body.byteLength) } : {}
  const signed = await aws.sign(r2ObjectUrl(config, key), { method, headers, body })
  return fetch(signed.url, { method, headers: signed.headers, body })
}

export const r2Store: ReceiptFileStore = {
  provider: 'r2',

  async put(key, body, contentType) {
    const response = await send('PUT', key, { body, contentType })
    if (!response.ok) throw await failure('upload', response)
    return key
  },

  async get(key) {
    const response = await send('GET', key)
    if (response.status === 404) return null
    if (!response.ok || !response.body) throw await failure('read', response)
    return { body: response.body, contentType: response.headers.get('content-type') ?? 'application/octet-stream' }
  },

  async delete(key) {
    const response = await send('DELETE', key)
    // S3 DELETE of a missing key is a success (204); a 404 means the same thing.
    if (!response.ok && response.status !== 404) throw await failure('delete', response)
  },
}

/** Size and SHA-256 of an R2 object, or null when it does not exist. Used by the Blob → R2 copy
 *  script to verify a copy before switching a receipt to it. */
export async function r2ObjectDigest(key: string): Promise<{ size: number; sha256: string } | null> {
  const file = await r2Store.get(key)
  if (!file) return null
  const bytes = new Uint8Array(await new Response(file.body).arrayBuffer())
  return { size: bytes.byteLength, sha256: await sha256Hex(bytes) }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Buffer.from(digest).toString('hex')
}
