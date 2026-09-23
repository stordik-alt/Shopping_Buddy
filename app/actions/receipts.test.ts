import { del, put } from '@vercel/blob'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
  items: [{ name: 'Mléko', category: 'Potraviny', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: 0, confidence: 0.96 }],
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

// The product catalog is global, not household-scoped, and `products.name` is unique — so any test
// that causes a product row to be created (directly, or via upsertProductCatalogDefaults learning
// from a confirmed import) must not leave it behind, or a later run hits a unique-constraint
// violation on the same name, or — worse — silently changes a *different* test's behavior (a
// leftover catalog entry can make an item confidently placeable that a test expects to be
// ambiguous). Tracking every name by hand is error-prone once many tests use the same default
// fixture names, so instead: snapshot which product ids exist before this file's tests run, and
// delete whatever ids exist afterward that weren't in that snapshot — catches every one of them
// regardless of which test (or which of `upsertProductCatalogDefaults`'s two paths) created it.
let existingProductIds: Set<string>
let existingStoreLocationIds: Set<string>

beforeAll(async () => {
  const rows = await db.query.products.findMany({ columns: { id: true } })
  existingProductIds = new Set(rows.map((row) => row.id))
  const storeLocations = await db.query.storeLocations.findMany({ columns: { id: true } })
  existingStoreLocationIds = new Set(storeLocations.map((row) => row.id))
})

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
  const rows = await db.query.products.findMany({ columns: { id: true } })
  const newProductIds = rows.filter((row) => !existingProductIds.has(row.id)).map((row) => row.id)
  if (newProductIds.length > 0) {
    await db.delete(schema.products).where(inArray(schema.products.id, newProductIds))
  }
  const storeLocations = await db.query.storeLocations.findMany({ columns: { id: true } })
  const newStoreLocationIds = storeLocations.filter((row) => !existingStoreLocationIds.has(row.id)).map((row) => row.id)
  if (newStoreLocationIds.length > 0) {
    await db.delete(schema.storeLocations).where(inArray(schema.storeLocations.id, newStoreLocationIds))
  }
  await del(uploadedBlobUrls).catch(() => {})
})

// resolveReceiptPurchaseDate() (app/actions/receipts.ts) requires an explicit, validly-formatted
// date and never falls back to "today" — real manual entry always supplies one from the form's
// date input, so tests that don't care about the specific value pass this constant instead.
const TEST_DATE = '2026-09-22'

describe('importReceiptAction (manual entry)', () => {
  it('rejects an empty receipt', async () => {
    await expect(importReceiptAction([])).rejects.toThrow('Receipt has no items')
  })

  it('creates a real purchase from manually-entered line items', async () => {
    const { purchase } = await importReceiptAction(
      [item({ name: 'Rýže', price: 40, quantity: 2 }), item({ name: 'Chleba', price: 25, quantity: 1 })],
      { date: TEST_DATE },
    )
    expect(purchase.total).toBe(40 * 2 + 25)
    expect(purchase.items.map((i) => i.name).sort()).toEqual(['Chleba', 'Rýže'])

    const purchaseRow = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchase.id) })
    expect(purchaseRow?.householdId).toBe(householdId)
  })

  it('uses the catalog category when a manually imported product is known', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    expect(category).toBeDefined()
    const productName = `__test_catalog_product_${crypto.randomUUID()}`
    const [product] = await db.insert(schema.products).values({ name: productName, categoryId: category!.id, defaultUnit: 'ks' }).returning()

    try {
      await importReceiptAction([item({ name: productName, category: 'Ostatní' })], { date: TEST_DATE })
      const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.productId, product.id) })
      expect(pantryRow?.category).toBe('Potraviny')
    } finally {
      await db.delete(schema.products).where(eq(schema.products.id, product.id))
    }
  })

  it('preserves decimal quantities for weighted receipt items', async () => {
    const { purchase } = await importReceiptAction(
      [
        item({ name: 'Pomeranče', quantity: 0.436, unit: 'kg', price: 29.9 }),
        item({ name: 'Hovězí', quantity: 0.444, unit: 'kg', price: 409 }),
      ],
      { date: TEST_DATE },
    )

    expect(purchase.items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ['Pomeranče', 0.436, 'kg'],
      ['Hovězí', 0.444, 'kg'],
    ])

    const rows = await db.query.purchaseItems.findMany({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })
    expect(rows.map((row) => Number(row.quantity)).sort()).toEqual([0.436, 0.444])
  })

  it('restocks the pantry for every imported item', async () => {
    await importReceiptAction([item({ name: 'Mléko polotučné', category: 'Potraviny', quantity: 2 })], { date: TEST_DATE })
    const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRow?.name).toBe('Mléko polotučné')
    expect(pantryRow?.quantity).toBe(2)
    expect(pantryRow?.location).toBe('Lednice')
  })

  it('records a receipt_imports row linked to the created purchase', async () => {
    const { purchase } = await importReceiptAction([item()], { date: TEST_DATE })
    const receiptRow = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.householdId, householdId) })
    expect(receiptRow?.source).toBe('manual')
    expect(receiptRow?.status).toBe('imported')
    expect(receiptRow?.purchaseId).toBe(purchase.id)
    expect(JSON.parse(receiptRow!.items!)).toEqual([item()])
  })

  it('preserves a fractional quantity end to end (purchase_items and pantry_items are both numeric, not integer)', async () => {
    const { purchase } = await importReceiptAction([item({ name: 'Kuřecí prsa', category: 'Potraviny', quantity: 0.582, unit: 'kg', price: 189.9 })], {
      date: TEST_DATE,
    })
    expect(purchase.items[0].quantity).toBe(0.582)

    const purchaseItemRow = await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, purchase.id) })
    expect(purchaseItemRow?.quantity).toBe(0.582)

    const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRow?.quantity).toBe(0.582)
  })

  it('remembers a human-confirmed category/unit/location in the product catalog for next time', async () => {
    await importReceiptAction([item({ name: 'Bio kuře', category: 'Potraviny', unit: 'kg' })], { date: TEST_DATE })
    const productRow = await db.query.products.findFirst({ where: eq(schema.products.name, 'Bio kuře'), with: { category: true } })
    expect(productRow?.category.name).toBe('Potraviny')
    expect(productRow?.defaultUnit).toBe('kg')
    expect(productRow?.defaultLocation).toBe('Spíž') // "kuře" doesn't match the "kuřecí" keyword, and manual entry has no location field — falls back to 'Spíž'
  })

  it('does not let an already-cataloged product\'s unit be overwritten by how a later purchase happened to be rung up', async () => {
    const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
    const productName = `__test_unit_protected_${crypto.randomUUID()}`
    const [product] = await db.insert(schema.products).values({ name: productName, categoryId: category!.id, defaultUnit: 'l' }).returning()

    try {
      // A manual-entry form defaults new rows to 'ks' — this purchase doesn't correct the unit,
      // it's just how this particular buy happened to be recorded. The catalog's remembered 'l'
      // must survive it (category/location, genuine corrections, still update as normal).
      await importReceiptAction([item({ name: productName, category: 'Potraviny', unit: 'ks' })], { date: TEST_DATE })
      const productRow = await db.query.products.findFirst({ where: eq(schema.products.id, product.id) })
      expect(productRow?.defaultUnit).toBe('l')
    } finally {
      await db.delete(schema.products).where(eq(schema.products.id, product.id))
    }
  })
})

describe('processReceiptImport — OCR pipeline orchestration (fake OCR/AI, real Blob/DB)', () => {
  it('goes uploaded → completed and creates a real purchase for a clean, consistent extraction', async () => {
    const receiptImportId = await createUploadedReceipt()
    const row = await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt()))

    expect(row.status).toBe('completed')
    expect(row.purchaseId).not.toBeNull()
    expect(row.rawOcrText).toBe('FAKE OCR TEXT')
    expect(row.ocrProvider).toBe('google_vision')
    expect(row.storeId).not.toBeNull()
    expect(row.storeLocationId).toBeNull()

    const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
    expect(Number(purchase?.total)).toBe(49.8)
    expect(purchase?.storeId).not.toBeNull()
    const store = await db.query.stores.findFirst({ where: eq(schema.stores.id, purchase!.storeId!) })
    expect(store?.chain).toBe('Lidl')

    const second = await createUploadedReceipt()
    // Different date than the first receipt — same date+total would otherwise trip the (separate,
    // unrelated) duplicate-detection check before this ever reaches store resolution, which isn't
    // what this test is verifying.
    const secondRow = await processReceiptImport(second, fakeProviders(extractedReceipt({ date: '2026-09-23', store: { name: 'LIDL Česká republika', confidence: 0.95 } })))
    expect(secondRow.status).toBe('completed')
    expect(secondRow.storeId).toBe(purchase?.storeId)
    const stores = await db.query.stores.findMany()
    expect(stores.filter((store) => store.chain === 'Lidl')).toHaveLength(1)
  })

  it('creates a new store when OCR discovers an unknown retailer', async () => {
    const receiptImportId = await createUploadedReceipt()
    const row = await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ store: { name: 'Tesco Express', confidence: 0.95 } })))
    expect(row.status).toBe('completed')
    expect(row.storeId).not.toBeNull()
    const store = await db.query.stores.findFirst({ where: eq(schema.stores.id, row.storeId!) })
    expect(store?.chain).toBe('Tesco Express')
  })

  it('creates a new branch when OCR provides an address that is not yet in the store directory', async () => {
    const address = `OCR Testovací ${crypto.randomUUID()} 12`
    const city = 'Brno'
    const receiptImportId = await createUploadedReceipt()
    const row = await processReceiptImport(
      receiptImportId,
      fakeProviders(extractedReceipt({
        date: '2026-09-24',
        store: { name: 'Lidl', address, city, confidence: 0.95 },
      })),
    )

    expect(row.status).toBe('completed')
    expect(row.storeId).not.toBeNull()
    expect(row.storeLocationId).not.toBeNull()

    const location = await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.id, row.storeLocationId!) })
    expect(row.storeId).toBe(location?.storeId)
    expect(location?.storeId).toBe(row.storeId)
    expect(location?.address).toBe(address)
    expect(location?.city).toBe(city)
    expect(location?.lat).toBeNull()
    expect(location?.lng).toBeNull()
    expect(location?.hours).toBeNull()

    const secondReceiptImportId = await createUploadedReceipt()
    const secondRow = await processReceiptImport(
      secondReceiptImportId,
      fakeProviders(extractedReceipt({
        date: '2026-09-25',
        store: { name: 'LIDL Česká republika', address: `  ${address.toUpperCase()}  `, city: '  brno ', confidence: 0.95 },
      })),
    )

    expect(secondRow.status).toBe('completed')
    expect(secondRow.storeLocationId).toBe(row.storeLocationId)

    const matchingLocations = (await db.query.storeLocations.findMany({ where: eq(schema.storeLocations.storeId, row.storeId!) }))
      .filter((candidate) => candidate.address.toLocaleLowerCase('cs-CZ') === address.toLocaleLowerCase('cs-CZ'))
    expect(matchingLocations).toHaveLength(1)
  })

  it('routes to review_required when the receipt fails the consistency check', async () => {
    const receiptImportId = await createUploadedReceipt()
    const inconsistent = extractedReceipt({ total: 999 }) // items sum to 49.80, nowhere near 999
    const row = await processReceiptImport(receiptImportId, fakeProviders(inconsistent))

    expect(row.status).toBe('review_required')
    expect(row.purchaseId).toBeNull()
    expect(row.storeId).not.toBeNull()
    expect(row.storeLocationId).toBeNull()
  })

  it('routes to review_required when a required field (store) is missing', async () => {
    const receiptImportId = await createUploadedReceipt()
    const missingStore = extractedReceipt({ store: { name: null, confidence: null } })
    const row = await processReceiptImport(receiptImportId, fakeProviders(missingStore))

    expect(row.status).toBe('review_required')
  })

  it('routes to review_required when an item category is missing', async () => {
    const receiptImportId = await createUploadedReceipt()
    const missingCategory = extractedReceipt({ items: [{ name: 'Mléko', category: null, quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: 0, confidence: 0.96 }] })
    const row = await processReceiptImport(receiptImportId, fakeProviders(missingCategory))

    expect(row.status).toBe('review_required')
    expect(row.purchaseId).toBeNull()
  })

  it('routes to review_required when the purchase date is missing', async () => {
    const receiptImportId = await createUploadedReceipt()
    const missingDate = extractedReceipt({ date: null })
    const row = await processReceiptImport(receiptImportId, fakeProviders(missingDate))

    expect(row.status).toBe('review_required')
    expect(row.date).toBeNull()
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

  it('uses the configured Azure fallback when the primary OCR provider fails', async () => {
    const receiptImportId = await createUploadedReceipt()
    const previousEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
    const previousKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test.cognitiveservices.azure.com'
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'test-key'

    try {
      const row = await processReceiptImport(receiptImportId, {
        textExtractor: {
          extractText: async () => {
            throw new Error('Vision billing unavailable')
          },
        },
        fallbackTextExtractor: {
          extractText: async () => ({ fullText: 'AZURE FALLBACK OCR', lines: ['AZURE FALLBACK OCR'] }),
        },
        structuringProvider: fakeProviders(extractedReceipt()).structuringProvider,
      })

      expect(row.status).toBe('completed')
      expect(row.rawOcrText).toBe('AZURE FALLBACK OCR')
      expect(row.ocrProvider).toBe('azure_document_intelligence')
    } finally {
      if (previousEndpoint === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
      else process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = previousEndpoint
      if (previousKey === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
      else process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = previousKey
    }
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

  it('routes to review_required when a line item has an unrecognized unit, rather than silently saving it as "ks"', async () => {
    const receiptImportId = await createUploadedReceipt()
    const unknownUnit = extractedReceipt({ items: [{ name: 'Mléko', quantity: 2, unit: 'furlongs', unitPrice: 24.9, totalPrice: 49.8, discount: 0, category: 'Potraviny', confidence: 0.9 }] })
    const row = await processReceiptImport(receiptImportId, fakeProviders(unknownUnit))

    expect(row.status).toBe('review_required')
    expect(row.purchaseId).toBeNull()
  })

  it('routes to review_required when an item\'s category/storage location can\'t be placed confidently, even though the receipt is otherwise consistent', async () => {
    const receiptImportId = await createUploadedReceipt()
    // no category from the AI, and the name matches no pantry-location keyword — genuinely unplaceable
    const unplaceable = extractedReceipt({
      items: [{ name: 'Naprosto neznámá věc', quantity: 1, unit: 'ks', unitPrice: 49.8, totalPrice: 49.8, discount: 0, category: null, confidence: 0.3 }],
    })
    const row = await processReceiptImport(receiptImportId, fakeProviders(unplaceable))

    expect(row.status).toBe('review_required')
    expect(row.purchaseId).toBeNull()
  })

  it('auto-completes using the catalog\'s remembered location even when the AI suggests a different category for this receipt', async () => {
    const [category] = await db.query.productCategories.findMany({ where: eq(schema.productCategories.name, 'Potraviny') })
    await db.insert(schema.products).values({ name: 'Bio kuře catalog test', categoryId: category.id, defaultUnit: 'kg', defaultLocation: 'Mrazák' })

    const receiptImportId = await createUploadedReceipt()
    // AI guesses "Drogerie" for this one receipt — the catalog's own category/location must win instead
    const extracted = extractedReceipt({
      items: [{ name: 'Bio kuře catalog test', quantity: 1, unit: 'kg', unitPrice: 49.8, totalPrice: 49.8, discount: 0, category: 'Drogerie', confidence: 0.6 }],
    })
    const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))

    expect(row.status).toBe('completed')
    const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRow?.category).toBe('Potraviny')
    expect(pantryRow?.location).toBe('Mrazák')
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

    const { purchase } = await confirmReceiptReviewAction(receiptImportId, [item({ name: 'Opravená položka', price: 49.8 })], { date: '2026-09-18' })
    expect(purchase.total).toBe(49.8)
    expect(purchase.date).toBe('2026-09-18')

    const purchaseRow = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, purchase.id) })
    expect(purchaseRow?.date).toBe('2026-09-18')

    const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
    expect(row?.status).toBe('completed')
    expect(row?.purchaseId).toBe(purchase.id)
  })

  it('rejects confirming a review for an import that is not awaiting review', async () => {
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt())) // → completed
    await expect(confirmReceiptReviewAction(receiptImportId, [item()])).rejects.toThrow('nečeká na kontrolu')
  })

  it('rejects confirming without a date when the receipt never had one — must never silently fall back to today', async () => {
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ date: null }))) // → review_required, no date known
    await expect(confirmReceiptReviewAction(receiptImportId, [item()])).rejects.toThrow('Datum nákupu je povinné')
  })

  it('accepts an explicitly-supplied date when the receipt never had one', async () => {
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ date: null })))
    const { purchase } = await confirmReceiptReviewAction(receiptImportId, [item()], { date: '2026-09-10' })
    expect(purchase.date).toBe('2026-09-10')
  })

  it('remembers the reviewer\'s correction in the product catalog, so the next receipt of the same product resolves automatically', async () => {
    const receiptImportId = await createUploadedReceipt()
    const unplaceable = extractedReceipt({
      items: [{ name: 'BIO KUŘE review test', quantity: 1, unit: 'ks', unitPrice: 49.8, totalPrice: 49.8, discount: 0, category: null, confidence: 0.4 }],
    })
    await processReceiptImport(receiptImportId, fakeProviders(unplaceable)) // → review_required (unplaceable)

    await confirmReceiptReviewAction(receiptImportId, [item({ name: 'BIO KUŘE review test', category: 'Potraviny', location: 'Mrazák', unit: 'kg' })])

    const productRow = await db.query.products.findFirst({ where: eq(schema.products.name, 'BIO KUŘE review test'), with: { category: true } })
    expect(productRow?.category.name).toBe('Potraviny')
    expect(productRow?.defaultUnit).toBe('kg')
    expect(productRow?.defaultLocation).toBe('Mrazák')

    // A second receipt of the same product now resolves automatically, even though the AI still can't classify it.
    // (Different date so the duplicate-detection check — a separate concern — doesn't also match.)
    const secondReceiptImportId = await createUploadedReceipt()
    const secondExtraction = extractedReceipt({
      date: '2026-09-23',
      items: [{ name: 'BIO KUŘE review test', quantity: 1, unit: 'kg', unitPrice: 49.8, totalPrice: 49.8, discount: 0, category: null, confidence: 0.4 }],
    })
    const secondRow = await processReceiptImport(secondReceiptImportId, fakeProviders(secondExtraction))
    expect(secondRow.status).toBe('completed')
    const pantryRow = await db.query.pantryItems.findFirst({ where: eq(schema.pantryItems.householdId, householdId) })
    expect(pantryRow?.location).toBe('Mrazák')
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