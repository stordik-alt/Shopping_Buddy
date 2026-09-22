import { del, put } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import type { ExtractedReceipt, ReceiptLineItem, ReceiptStructuringProvider, ReceiptTextExtractor } from '@/lib/receipts'

// Continues the Server Action test coverage started in app/actions/shopping.test.ts.
// This file makes real network calls to Vercel Blob (createUploadedReceipt below) — some tests
// do two sequential uploads, which can exceed vitest's 5s default under real network latency. A
// timed-out test doesn't actually cancel its in-flight work, so a too-short timeout risks a
// zombie continuation mutating the shared currentHouseholdId/db state a later test relies on —
// worse than just being slow. Raised file-wide rather than per-test since most tests here upload
// at least once.
vi.setConfig({ testTimeout: 20_000 })

let currentHouseholdId = ''
vi.mock('@/lib/auth/authorize', () => ({ requireHouseholdId: () => Promise.resolve(currentHouseholdId) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { confirmReceiptReviewAction, importReceiptAction, processReceiptImport, resolveDuplicateReceiptAction, retryReceiptImportAction } from '@/app/actions/receipts'

const db = getDb()
const createdHouseholdIds: string[] = []
const uploadedBlobUrls: string[] = []
let householdId: string

const item = (overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem => ({
  name: 'Rýže',
  category: 'Potraviny',
  quantity: 1,
  unit: 'ks',
  price: 40,
  ...overrides,
})

const extractedReceipt = (overrides: Partial<ExtractedReceipt> = {}): ExtractedReceipt => ({
  store: { name: 'Lidl', confidence: 0.95 },
  date: '2026-09-22',
  time: '17:42',
  receiptNumber: null,
  currency: 'CZK',
  items: [{ name: 'Mléko', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: 0, confidence: 0.96 }],
  subtotal: 49.8,
  discountTotal: 0,
  total: 49.8,
  confidence: 0.95,
  ...overrides,
})

// processReceiptImport always fetches the row's stored image from Blob first, regardless of which
// text/structuring providers are injected — so tests upload a real (tiny, throwaway) image to the
// real Blob store rather than faking that step too. Vision/Gemini are the only faked pieces here;
// everything else (Blob storage, the receipt_imports state machine, validation, duplicate
// detection) runs for real.
async function createUploadedReceipt(): Promise<string> {
  const blob = await put(`receipts/__test__/${crypto.randomUUID()}.png`, Buffer.from('test-image-bytes'), { access: 'private', contentType: 'image/png' })
  uploadedBlobUrls.push(blob.url)
  const [row] = await db.insert(schema.receiptImports).values({ householdId, status: 'uploaded', source: 'ocr', imageUrl: blob.url }).returning()
  return row.id
}

function fakeProviders(extracted: ExtractedReceipt): { textExtractor: ReceiptTextExtractor; structuringProvider: ReceiptStructuringProvider } {
  return {
    textExtractor: { extractText: async () => ({ fullText: 'FAKE OCR TEXT', lines: ['FAKE OCR TEXT'] }) },
    structuringProvider: { structure: async () => extracted },
  }
}

beforeEach(async () => {
  const [household] = await db.insert(schema.households).values({ name: '__test_household_receipts__' }).returning()
  householdId = household.id
  createdHouseholdIds.push(householdId)
  currentHouseholdId = householdId
})

afterAll(async () => {
  // households cascades to purchases/purchase_items/pantry_items/receipt_imports (all onDelete: 'cascade').
  for (const id of createdHouseholdIds) {
    await db.delete(schema.households).where(eq(schema.households.id, id))
  }
  await del(uploadedBlobUrls).catch(() => {})
})

describe('importReceiptAction (manual entry)', () => {
  it('rejects an empty receipt', async () => {
    await expect(importReceiptAction([])).rejects.toThrow('Receipt has no items')
  })

  it('creates a real purchase from manually-entered line items', async () => {
    const { purchase } = await importReceiptAction([item({ name: 'Rýže', price: 40, quantity: 2 }), item({ name: 'Chleba', price: 25, quantity: 1 })])
    expect(purchase.total).toBe(40 * 2 + 25)
    expect(purchase.items.map((i) => i.name).sort()).toEqual(['Chleba', 'Rýže'])

    const purchaseRow = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchase.id) })
    expect(purchaseRow?.householdId).toBe(householdId)
  })

  it('restocks the pantry for every imported item', async () => {
    await importReceiptAction([item({ name: 'Mléko polotučné', category: 'Potraviny', quantity: 2 })])
    const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRow?.name).toBe('Mléko polotučné')
    expect(pantryRow?.quantity).toBe(2)
    expect(pantryRow?.location).toBe('Lednice')
  })

  it('records a receipt_imports row linked to the created purchase', async () => {
    const { purchase } = await importReceiptAction([item()])
    const receiptRow = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.householdId, householdId) })
    expect(receiptRow?.source).toBe('manual')
    expect(receiptRow?.status).toBe('imported')
    expect(receiptRow?.purchaseId).toBe(purchase.id)
    expect(JSON.parse(receiptRow!.items!)).toEqual([item()])
  })
})

describe('processReceiptImport — OCR pipeline orchestration (fake OCR/AI, real Blob/DB)', () => {
  it('goes uploaded → completed and creates a real purchase for a clean, consistent extraction', async () => {
    const receiptImportId = await createUploadedReceipt()
    const row = await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt()))

    expect(row.status).toBe('completed')
    expect(row.purchaseId).not.toBeNull()
    expect(row.rawOcrText).toBe('FAKE OCR TEXT')

    const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
    expect(Number(purchase?.total)).toBe(49.8)
  })

  it('routes to review_required when the receipt fails the consistency check', async () => {
    const receiptImportId = await createUploadedReceipt()
    const inconsistent = extractedReceipt({ total: 999 }) // items sum to 49.80, nowhere near 999
    const row = await processReceiptImport(receiptImportId, fakeProviders(inconsistent))

    expect(row.status).toBe('review_required')
    expect(row.purchaseId).toBeNull()
  })

  it('routes to review_required when a required field (store) is missing', async () => {
    const receiptImportId = await createUploadedReceipt()
    const missingStore = extractedReceipt({ store: { name: null, confidence: null } })
    const row = await processReceiptImport(receiptImportId, fakeProviders(missingStore))

    expect(row.status).toBe('review_required')
  })

  it('records ocr_failed with an error message when OCR throws, without touching parsing', async () => {
    const receiptImportId = await createUploadedReceipt()
    const row = await processReceiptImport(receiptImportId, {
      textExtractor: {
        extractText: async () => {
          throw new Error('Vision unavailable')
        },
      },
      structuringProvider: fakeProviders(extractedReceipt()).structuringProvider,
    })

    expect(row.status).toBe('ocr_failed')
    expect(row.errorMessage).toContain('Vision unavailable')
  })

  it('records parsing_failed with an error message when the structuring model throws', async () => {
    const receiptImportId = await createUploadedReceipt()
    const row = await processReceiptImport(receiptImportId, {
      textExtractor: fakeProviders(extractedReceipt()).textExtractor,
      structuringProvider: {
        structure: async () => {
          throw new Error('model overloaded')
        },
      },
    })

    expect(row.status).toBe('parsing_failed')
    expect(row.errorMessage).toContain('model overloaded')
  })

  it('routes to duplicate_review when a matching completed receipt already exists', async () => {
    const first = await createUploadedReceipt()
    await processReceiptImport(first, fakeProviders(extractedReceipt()))

    const second = await createUploadedReceipt()
    const row = await processReceiptImport(second, fakeProviders(extractedReceipt())) // same store/date/total

    expect(row.status).toBe('duplicate_review')
    expect(row.purchaseId).toBeNull()
  })
})

describe('retryReceiptImportAction', () => {
  it('rejects retrying an import that is not in a failure state', async () => {
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt())) // → completed
    await expect(retryReceiptImportAction(receiptImportId)).rejects.toThrow('nelze znovu spustit')
  })

  it('rejects a receipt import belonging to a different household', async () => {
    const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_receipts_other__' }).returning()
    createdHouseholdIds.push(otherHousehold.id)
    const [otherRow] = await db.insert(schema.receiptImports).values({ householdId: otherHousehold.id, status: 'ocr_failed', source: 'ocr' }).returning()
    await expect(retryReceiptImportAction(otherRow.id)).rejects.toThrow('Receipt import not found')
  })
})

describe('confirmReceiptReviewAction', () => {
  it('creates a purchase from corrected items and marks the import completed', async () => {
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ total: 999 }))) // → review_required

    const { purchase } = await confirmReceiptReviewAction(receiptImportId, [item({ name: 'Opravená položka', price: 49.8 })])
    expect(purchase.total).toBe(49.8)

    const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
    expect(row?.status).toBe('completed')
    expect(row?.purchaseId).toBe(purchase.id)
  })

  it('rejects confirming a review for an import that is not awaiting review', async () => {
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt())) // → completed
    await expect(confirmReceiptReviewAction(receiptImportId, [item()])).rejects.toThrow('nečeká na kontrolu')
  })
})

describe('resolveDuplicateReceiptAction', () => {
  it('"use_existing" cancels the import without creating a second purchase', async () => {
    const first = await createUploadedReceipt()
    await processReceiptImport(first, fakeProviders(extractedReceipt()))
    const second = await createUploadedReceipt()
    await processReceiptImport(second, fakeProviders(extractedReceipt())) // → duplicate_review

    const { purchase } = await resolveDuplicateReceiptAction(second, 'use_existing')
    expect(purchase).toBeNull()

    const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, second) })
    expect(row?.status).toBe('cancelled')
  })

  it('"save_new" creates a purchase despite the duplicate match', async () => {
    const first = await createUploadedReceipt()
    await processReceiptImport(first, fakeProviders(extractedReceipt()))
    const second = await createUploadedReceipt()
    await processReceiptImport(second, fakeProviders(extractedReceipt())) // → duplicate_review

    const { purchase } = await resolveDuplicateReceiptAction(second, 'save_new')
    expect(purchase).not.toBeNull()

    const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, second) })
    expect(row?.status).toBe('completed')
  })
})
