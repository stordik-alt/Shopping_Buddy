import { del, put } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Real DB and an in-memory fake of the (private) Blob store, same approach as
// app/actions/receipts.test.ts — the session lookup is faked too, because there is no browser session
// in a unit test.
vi.setConfig({ testTimeout: 20_000 })
// Receipt photos go to Vercel Blob. Tests use an in-memory fake (test/fake-blob.ts) so a run neither
// spends paid Blob operations nor fails when the real store is suspended; USE_REAL_BLOB=1 runs them
// against the real store on purpose.
vi.mock('@vercel/blob', async () => (process.env.USE_REAL_BLOB === '1' ? await vi.importActual('@vercel/blob') : (await import('@/test/fake-blob')).fakeBlobModule))

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
let blobUrl: string

const call = (id: string) => GET(new Request('http://localhost/api/receipts/x/image'), { params: Promise.resolve({ id }) })

beforeAll(async () => {
  const [owner] = await db.insert(schema.households).values({ name: '__test_household_receipt_image_owner__' }).returning()
  const [other] = await db.insert(schema.households).values({ name: '__test_household_receipt_image_other__' }).returning()
  ownerHouseholdId = owner.id
  otherHouseholdId = other.id

  const blob = await put(`receipts/__test__/${crypto.randomUUID()}.png`, IMAGE_BYTES, { access: 'private', contentType: 'image/png' })
  blobUrl = blob.url
  const [row] = await db.insert(schema.receiptImports).values({ householdId: ownerHouseholdId, status: 'review_required', source: 'ocr', imageUrl: blobUrl }).returning()
  receiptImportId = row.id
  const [noImage] = await db.insert(schema.receiptImports).values({ householdId: ownerHouseholdId, status: 'review_required', source: 'ocr' }).returning()
  receiptWithoutImageId = noImage.id
})

afterAll(async () => {
  // households cascade to receipt_imports
  await db.delete(schema.households).where(eq(schema.households.id, ownerHouseholdId))
  await db.delete(schema.households).where(eq(schema.households.id, otherHouseholdId))
  await del(blobUrl).catch(() => {})
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
