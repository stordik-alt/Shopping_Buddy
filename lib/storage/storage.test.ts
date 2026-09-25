import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Vercel Blob is the in-memory fake (test/fake-blob.ts); R2 requests go to a stubbed `fetch` that
// behaves like a tiny S3 bucket. Nothing reaches a real store.
vi.mock('@vercel/blob', async () => (await import('@/test/fake-blob')).fakeBlobModule)

import { put as fakeBlobPut } from '@/test/fake-blob'
import { deleteReceiptFile, getReceiptFile, isValidReceiptKey, parseStorageRef, putReceiptFile, r2Ref, uploadProvider } from '@/lib/storage'
import { r2ObjectDigest, r2ObjectUrl, sha256Hex } from '@/lib/storage/r2'

const HOUSEHOLD = '0b9d7c3e-1f2a-4b5c-8d6e-7f8091a2b3c4'
const OTHER = '11111111-2222-4333-8444-555555555555'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

type SeenRequest = { method: string; url: string; headers: Headers; input: unknown; body: unknown }

/** A fake R2 bucket behind `fetch`: PUT stores, GET returns (404 when missing), DELETE removes. */
function stubR2() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
  const requests: SeenRequest[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push({ method: request.method, url: request.url, headers: request.headers, input, body: init?.body })
    const path = new URL(request.url).pathname
    if (request.method === 'PUT') {
      objects.set(path, { bytes: new Uint8Array(await request.arrayBuffer()), contentType: request.headers.get('content-type') ?? '' })
      return new Response(null, { status: 200 })
    }
    if (request.method === 'GET') {
      const found = objects.get(path)
      if (!found) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
      return new Response(found.bytes.slice(), { status: 200, headers: { 'content-type': found.contentType } })
    }
    if (request.method === 'DELETE') {
      objects.delete(path)
      return new Response(null, { status: 204 })
    }
    return new Response(null, { status: 405 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { objects, requests }
}

beforeEach(() => {
  process.env.R2_ACCOUNT_ID = 'acc123'
  process.env.R2_ACCESS_KEY_ID = 'test-access-key'
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret'
  process.env.R2_BUCKET_NAME = 'receipts-test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.STORAGE_PROVIDER
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) delete process.env[name]
})

describe('storage references', () => {
  it('reads the provider from the reference', () => {
    expect(parseStorageRef('https://abc.private.blob.vercel-storage.com/receipts/x/y.jpg')).toEqual({
      provider: 'vercel_blob',
      id: 'https://abc.private.blob.vercel-storage.com/receipts/x/y.jpg',
    })
    const key = `receipts/${HOUSEHOLD}/${OTHER}.pdf`
    expect(parseStorageRef(`r2:${key}`)).toEqual({ provider: 'r2', id: key })
  })

  it('refuses R2 references outside the receipt key layout', () => {
    for (const bad of [
      'r2:receipts/../secrets.txt',
      `r2:receipts/${HOUSEHOLD}/../${OTHER}/x.jpg`,
      `r2:other/${HOUSEHOLD}/${OTHER}.jpg`,
      `r2:receipts/${HOUSEHOLD}/${OTHER}.exe`,
      'r2:',
    ]) {
      expect(() => parseStorageRef(bad)).toThrow('Invalid R2 receipt reference')
    }
    expect(() => parseStorageRef('http://insecure.example/receipts/a.jpg')).toThrow('Unknown receipt storage reference')
    expect(() => r2Ref('receipts/not-a-uuid/x.jpg')).toThrow()
  })

  it('accepts only receipts/{uuid}/{uuid}.{jpg|png|webp|pdf}', () => {
    expect(isValidReceiptKey(`receipts/${HOUSEHOLD}/${OTHER}.webp`)).toBe(true)
    expect(isValidReceiptKey(`receipts/${HOUSEHOLD}/${OTHER}.heic`)).toBe(false)
    expect(isValidReceiptKey(`receipts/${HOUSEHOLD}/sub/${OTHER}.jpg`)).toBe(false)
  })
})

describe('uploadProvider', () => {
  it('defaults to Vercel Blob and accepts r2', () => {
    expect(uploadProvider()).toBe('vercel_blob')
    process.env.STORAGE_PROVIDER = 'r2'
    expect(uploadProvider()).toBe('r2')
    process.env.STORAGE_PROVIDER = ' VERCEL '
    expect(uploadProvider()).toBe('vercel_blob')
  })

  it('rejects an unknown value instead of silently falling back', () => {
    process.env.STORAGE_PROVIDER = 'r3'
    expect(() => uploadProvider()).toThrow('Unknown STORAGE_PROVIDER')
  })
})

describe('R2 store', () => {
  it('uploads under the household folder, reads back the same bytes and type, and deletes', async () => {
    const { objects, requests } = stubR2()
    process.env.STORAGE_PROVIDER = 'r2'

    const ref = await putReceiptFile(HOUSEHOLD, JPEG, { extension: 'jpg', mimeType: 'image/jpeg' })
    expect(ref).toMatch(new RegExp(`^r2:receipts/${HOUSEHOLD}/[0-9a-f-]{36}\\.jpg$`))

    const put = requests[0]
    expect(put.method).toBe('PUT')
    expect(put.url).toBe(`https://acc123.r2.cloudflarestorage.com/receipts-test/${ref.slice(3)}`)
    // Signed with SigV4 for R2's "auto" region; the secret itself never appears in the request.
    expect(put.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/auto\/s3\/aws4_request/)
    expect(JSON.stringify([...put.headers])).not.toContain('test-secret')
    // R2 rejects a PUT without Content-Length (411). The body must go out as bytes with an explicit
    // length, not as a Request whose stream body Next's fetch re-sends chunked.
    expect(put.headers.get('content-length')).toBe(String(JPEG.byteLength))
    expect(put.input).toBe(put.url)
    expect(put.body).toBeInstanceOf(Uint8Array)
    expect(objects.size).toBe(1)

    const file = await getReceiptFile(ref)
    expect(file?.contentType).toBe('image/jpeg')
    expect(Buffer.from(await new Response(file!.body).arrayBuffer())).toEqual(JPEG)

    await deleteReceiptFile(ref)
    expect(objects.size).toBe(0)
    expect(await getReceiptFile(ref)).toBeNull()
  })

  it('reports a missing configuration by variable name', async () => {
    stubR2()
    process.env.STORAGE_PROVIDER = 'r2'
    delete process.env.R2_SECRET_ACCESS_KEY
    await expect(putReceiptFile(HOUSEHOLD, JPEG, { extension: 'jpg', mimeType: 'image/jpeg' })).rejects.toThrow('Missing: R2_SECRET_ACCESS_KEY')
  })

  it('surfaces an R2 error with its status instead of pretending the upload worked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })))
    process.env.STORAGE_PROVIDER = 'r2'
    await expect(putReceiptFile(HOUSEHOLD, JPEG, { extension: 'jpg', mimeType: 'image/jpeg' })).rejects.toThrow('R2 upload failed (403): <Error><Code>AccessDenied')
  })

  it('computes size and SHA-256 of a stored object for copy verification', async () => {
    stubR2()
    process.env.STORAGE_PROVIDER = 'r2'
    const ref = await putReceiptFile(HOUSEHOLD, JPEG, { extension: 'jpg', mimeType: 'image/jpeg' })
    expect(await r2ObjectDigest(ref.slice(3))).toEqual({ size: JPEG.byteLength, sha256: await sha256Hex(JPEG) })
    expect(await r2ObjectDigest(`receipts/${HOUSEHOLD}/${OTHER}.jpg`)).toBeNull()
  })

  it('ignores whitespace pasted around the configuration values', async () => {
    const { requests } = stubR2()
    process.env.STORAGE_PROVIDER = 'r2'
    process.env.R2_BUCKET_NAME = 'receipts-test\n'
    process.env.R2_ACCOUNT_ID = ' acc123 '
    process.env.R2_ACCESS_KEY_ID = 'test-access-key\r\n'
    const ref = await putReceiptFile(HOUSEHOLD, JPEG, { extension: 'jpg', mimeType: 'image/jpeg' })
    expect(requests[0].url).toBe(`https://acc123.r2.cloudflarestorage.com/receipts-test/${ref.slice(3)}`)
    expect(requests[0].headers.get('authorization')).toContain('Credential=test-access-key/')
  })

  it('treats a whitespace-only value as missing', async () => {
    stubR2()
    process.env.STORAGE_PROVIDER = 'r2'
    process.env.R2_BUCKET_NAME = '  \n'
    await expect(putReceiptFile(HOUSEHOLD, JPEG, { extension: 'jpg', mimeType: 'image/jpeg' })).rejects.toThrow('Missing: R2_BUCKET_NAME')
  })

  it('encodes key segments but keeps the separators', () => {
    expect(r2ObjectUrl({ accountId: 'a', bucket: 'b' }, 'receipts/x y/z.jpg')).toBe('https://a.r2.cloudflarestorage.com/b/receipts/x%20y/z.jpg')
  })
})

describe('Vercel Blob store (old receipts and STORAGE_PROVIDER=vercel)', () => {
  it('still reads a receipt uploaded to Blob before the switch to R2', async () => {
    process.env.STORAGE_PROVIDER = 'r2' // new uploads go to R2 ...
    const old = await fakeBlobPut(`receipts/${HOUSEHOLD}/${OTHER}.jpg`, JPEG, { access: 'private', contentType: 'image/jpeg' })
    const file = await getReceiptFile(old.url) // ... but the old Blob reference is read from Blob
    expect(file?.contentType).toBe('image/jpeg')
    expect(Buffer.from(await new Response(file!.body).arrayBuffer())).toEqual(JPEG)
    await deleteReceiptFile(old.url)
    expect(await getReceiptFile(old.url)).toBeNull()
  })

  it('uploads to Blob by default and returns the blob URL as the reference', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ref = await putReceiptFile(HOUSEHOLD, JPEG, { extension: 'jpg', mimeType: 'image/jpeg' })
    expect(parseStorageRef(ref).provider).toBe('vercel_blob')
    expect(fetchMock).not.toHaveBeenCalled() // no R2 request
  })
})
