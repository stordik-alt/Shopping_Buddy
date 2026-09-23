import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

// Real DB; only the session lookup is faked (no browser session in a unit test).
let currentHouseholdId: string | null = null
vi.mock('@/lib/auth/authorize', () => {
  class ForbiddenError extends Error {}
  return {
    ForbiddenError,
    requireHouseholdId: () => (currentHouseholdId ? Promise.resolve(currentHouseholdId) : Promise.reject(new ForbiddenError('Not signed in'))),
  }
})

import { GET } from '@/app/api/receipts/[id]/status/route'

const db = getDb()
let ownerHouseholdId: string
let otherHouseholdId: string
let receiptImportId: string

const call = (id: string) => GET(new Request('http://localhost/api/receipts/x/status'), { params: Promise.resolve({ id }) })

beforeAll(async () => {
  const [owner] = await db.insert(schema.households).values({ name: '__test_household_receipt_status_owner__' }).returning()
  const [other] = await db.insert(schema.households).values({ name: '__test_household_receipt_status_other__' }).returning()
  ownerHouseholdId = owner.id
  otherHouseholdId = other.id
  const [row] = await db.insert(schema.receiptImports).values({ householdId: ownerHouseholdId, status: 'parsing', source: 'ocr' }).returning()
  receiptImportId = row.id
})

afterAll(async () => {
  await db.delete(schema.households).where(eq(schema.households.id, ownerHouseholdId)) // cascades to receipt_imports
  await db.delete(schema.households).where(eq(schema.households.id, otherHouseholdId))
})

describe('GET /api/receipts/[id]/status', () => {
  it('reports the current pipeline status to the owning household, and only that', async () => {
    currentHouseholdId = ownerHouseholdId
    const response = await call(receiptImportId)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'parsing' })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('sees the status change as the pipeline advances', async () => {
    currentHouseholdId = ownerHouseholdId
    await db.update(schema.receiptImports).set({ status: 'validating' }).where(eq(schema.receiptImports.id, receiptImportId))
    expect(await (await call(receiptImportId)).json()).toEqual({ status: 'validating' })
  })

  it('rejects a signed-out request', async () => {
    currentHouseholdId = null
    expect((await call(receiptImportId)).status).toBe(401)
  })

  it('returns 404 for another household\'s import, an unknown id and a malformed id', async () => {
    currentHouseholdId = otherHouseholdId
    expect((await call(receiptImportId)).status).toBe(404)
    currentHouseholdId = ownerHouseholdId
    expect((await call(crypto.randomUUID())).status).toBe(404)
    expect((await call('not-a-uuid')).status).toBe(404)
  })
})
