import { deleteReceiptFile, putReceiptFile } from '@/lib/storage'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Real DB and an in-memory fake of the (private) Blob store, same approach as
// app/actions/receipts.test.ts — the session lookup is faked too, because there is no browser session
// in a unit test.
vi.setConfig({ testTimeout: 20_000 })
// Receipt storage is exercised through the production R2 abstraction, with a local in-memory S3 stub.
process.env.R2_ACCOUNT_ID = 'test-account'
process.env.R2_ACCESS_KEY_ID = 'test-access-key'
process.env.R2_SECRET_ACCESS_KEY = 'test-secret'
process.env.R2_BUCKET_NAME = 'test-receipts'
const r2Objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
// Only the fake bucket is answered here. Everything else — notably the Neon HTTP driver, which sends
// SQL as POST requests through fetch — goes to the real fetch; answering it with 405 failed every
// database query in this file whenever the tests ran against Neon instead of a local PostgreSQL.
const passThroughFetch = globalThis.fetch
const R2_TEST_HOST = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = input instanceof Request ? input : new Request(input, init)
  if (new URL(request.url).hostname !== R2_TEST_HOST) return passThroughFetch(input, init)
  const key = new URL(request.url).pathname.split('/').slice(2).join('/')
  if (request.method === 'PUT') { r2Objects.set(key, { bytes: new Uint8Array(await request.arrayBuffer()), contentType: request.headers.get('content-type') ?? 'application/octet-stream' }); return new Response(null, { status: 200 }) }
  if (request.method === 'GET') { const object = r2Objects.get(key); return object ? new Response(object.bytes.slice(), { status: 200, headers: { 'content-type': object.contentType } }) : new Response(null, { status: 404 }) }
  if (request.method === 'DELETE') { r2Objects.delete(key); return new Response(null, { status: 204 }) }
  return new Response(null, { status: 405 })
}))

let currentHouseholdId: string | null = null
vi.mock('@/lib/auth/authorize', () => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    requireHouseholdId: () => (currentHouseholdId ? Promise.resolve(currentHouseholdId) : Promise.reject(new ForbiddenError('Not signed in'))),
  }
})

import { GET } from '@/app/api/receipts/[id]/image/route'

const db = getDb()
const IMAGE_BYTES = Buffer.from('test-image-bytes')
let ownerHouseholdId: string
let otherHouseholdId: string
let receiptImportId: string
let receiptWithoutImageId: string
let receiptRef: string

const call = (id: string) => GET(new Request('http://localhost/api/receipts/x/image'), { params: Promise.resolve({ id }) })

beforeAll(async () => {
  const [owner] = await db.insert(schema.households).values({ name: '__test_household_receipt_image_owner__' }).returning()
  const [other] = await db.insert(schema.households).values({ name: '__test_household_receipt_image_other__' }).returning()
  ownerHouseholdId = owner.id
  otherHouseholdId = other.id

  receiptRef = await putReceiptFile(ownerHouseholdId, IMAGE_BYTES, { extension: 'png', mimeType: 'image/png' })
  const [row] = await db.insert(schema.receiptImports).values({ householdId: ownerHouseholdId, status: 'review_required', source: 'ocr', imageUrl: receiptRef }).returning()
  receiptImportId = row.id
  const [noImage] = await db.insert(schema.receiptImports).values({ householdId: ownerHouseholdId, status: 'review_required', source: 'ocr' }).returning()
  receiptWithoutImageId = noImage.id
})

afterAll(async () => {
  // households cascade to receipt_imports
  await db.delete(schema.households).where(eq(schema.households.id, ownerHouseholdId))
  await db.delete(schema.households).where(eq(schema.households.id, otherHouseholdId))
  await deleteReceiptFile(receiptRef).catch(() => {})
  vi.unstubAllGlobals()
  r2Objects.clear()
})

describe('GET /api/receipts/[id]/image', () => {
  it('streams the stored image to a member of the owning household', async () => {
    currentHouseholdId = ownerHouseholdId
    const response = await call(receiptImportId)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(Buffer.from(await response.arrayBuffer()).equals(IMAGE_BYTES)).toBe(true)
  })

  it('rejects a signed-out request', async () => {
    currentHouseholdId = null
    expect((await call(receiptImportId)).status).toBe(401)
  })

  it('returns 404 — not the image — for another household\'s receipt', async () => {
    currentHouseholdId = otherHouseholdId
    expect((await call(receiptImportId)).status).toBe(404)
  })

  it('returns 404 for an import with no stored image, an unknown id, and a malformed id', async () => {
    currentHouseholdId = ownerHouseholdId
    expect((await call(receiptWithoutImageId)).status).toBe(404)
    expect((await call(crypto.randomUUID())).status).toBe(404)
    expect((await call('not-a-uuid')).status).toBe(404)
  })
})
