import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const storageFiles = vi.hoisted(() => new Map<string, { body: Buffer; contentType: string }>())
vi.mock('@/lib/storage', () => ({
  putReceiptFile: async (householdId: string, body: Buffer, file: { extension: string; mimeType: string }) => {
    const ref = `r2:receipts/${householdId}/${crypto.randomUUID()}.${file.extension}`
    storageFiles.set(ref, { body: Buffer.from(body), contentType: file.mimeType })
    return ref
  },
  getReceiptFile: async (ref: string) => {
    const file = storageFiles.get(ref)
    if (!file) return null
    return { body: new Response(file.body).body!, contentType: file.contentType }
  },
  deleteReceiptFile: async (ref: string) => { storageFiles.delete(ref) },
}))
import { putReceiptFile } from '@/lib/storage'

// Real DB and in-memory R2 storage; the session lookup is faked too, because there is no browser session in a unit test.
vi.setConfig({ testTimeout: 20_000 })

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
let imageRef: string

const call = (id: string) => GET(new Request('http://localhost/api/receipts/x/image'), { params: Promise.resolve({ id }) })

beforeAll(async () => {
  const [owner] = await db.insert(schema.households).values({ name: '__test_household_receipt_image_owner__' }).returning()
  const [other] = await db.insert(schema.households).values({ name: '__test_household_receipt_image_other__' }).returning()
  ownerHouseholdId = owner.id
  otherHouseholdId = other.id

  imageRef = await putReceiptFile(ownerHouseholdId, IMAGE_BYTES, { extension: 'png', mimeType: 'image/png' })
  const [row] = await db.insert(schema.receiptImports).values({ householdId: ownerHouseholdId, status: 'review_required', source: 'ocr', imageUrl: imageRef }).returning()
  receiptImportId = row.id
  const [noImage] = await db.insert(schema.receiptImports).values({ householdId: ownerHouseholdId, status: 'review_required', source: 'ocr' }).returning()
  receiptWithoutImageId = noImage.id
})

afterAll(async () => {
  // households cascade to receipt_imports
  await db.delete(schema.households).where(eq(schema.households.id, ownerHouseholdId))
  await db.delete(schema.households).where(eq(schema.households.id, otherHouseholdId))
  storageFiles.clear()
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
