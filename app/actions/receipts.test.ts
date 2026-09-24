import { del, get, put } from '@vercel/blob'
import sharp from 'sharp'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

import { confirmReceiptReviewAction, importReceiptAction, processReceiptImport, processUploadedReceiptAction, resolveDuplicateReceiptAction, retryReceiptImportAction, uploadReceiptAction } from '@/app/actions/receipts'
import { RECEIPT_STALE_MS } from '@/lib/receipt-progress'

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

  describe('discounts', () => {
    it('stores what was paid: net item price, total after the discount, and the amount saved', async () => {
      const receiptImportId = await createUploadedReceipt()
      // 2 × 24.90 = 49.80 on the item line, 5.00 taken off that line, 44.80 paid.
      const extracted = extractedReceipt({
        items: [{ name: 'Mléko', category: 'Potraviny', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: 5, confidence: 0.96 }],
        discountTotal: 5,
        total: 44.8,
      })
      const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))

      expect(row.status).toBe('completed')
      const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
      expect(Number(purchase?.total)).toBe(44.8)
      expect(Number(purchase?.discount)).toBe(5)
      const purchaseItem = await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, row.purchaseId!) })
      expect(Number(purchaseItem?.price)).toBe(22.4) // (49.80 − 5.00) / 2
    })

    it('reduces the total by a receipt-wide discount (coupon) that belongs to no single line', async () => {
      const receiptImportId = await createUploadedReceipt()
      const extracted = extractedReceipt({ discountTotal: 10, total: 39.8 }) // item line has no discount of its own
      const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))

      expect(row.status).toBe('completed')
      const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
      expect(Number(purchase?.total)).toBe(39.8)
      expect(Number(purchase?.discount)).toBe(10)
      const purchaseItem = await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, row.purchaseId!) })
      expect(Number(purchaseItem?.price)).toBe(24.9) // nothing attributable to the line
    })

    // Regression: an Albert receipt whose printed line prices are already the reduced ones and whose
    // "Díky akcím jste ušetřili 168 Kč" is only a summary was recorded as 886,96 Kč instead of the
    // 1 055,00 Kč paid — the summary was subtracted from lines that already included it — and sent to
    // manual review first because the lines did not add up to the total minus that summary.
    it('does not subtract a receipt-wide savings summary that is already in the line prices', async () => {
      const receiptImportId = await createUploadedReceipt()
      const extracted = extractedReceipt({
        items: [
          { name: 'Albert mléko', category: 'Potraviny', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: null, confidence: 0.96 },
          { name: 'Albert mléko polotučné', category: 'Potraviny', quantity: 1, unit: 'ks', unitPrice: 50.2, totalPrice: 50.2, discount: null, confidence: 0.96 },
        ],
        discountTotal: 20,
        total: 100,
      })
      const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))

      expect(row.status).toBe('completed') // consistent, so no needless manual review
      const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
      expect(Number(purchase?.total)).toBe(100) // what was paid, not 80
      expect(Number(purchase?.discount)).toBe(20) // the saving stays as information
    })

    it('keeps the stated total when a review is confirmed on such a receipt', async () => {
      const receiptImportId = await createUploadedReceipt()
      // A wrong stated total sends the receipt to review first ...
      await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ discountTotal: 20, total: 999 })))
      // ... the reviewer then corrects the stated total to what the receipt says. (Simulated by
      // updating the import row, as the review form does not edit the receipt's own total.)
      await db.update(schema.receiptImports).set({ total: '49.8' }).where(eq(schema.receiptImports.id, receiptImportId))
      const { purchase } = await confirmReceiptReviewAction(receiptImportId, [item({ name: 'Mléko potvrzené', price: 24.9, quantity: 2 })], { date: TEST_DATE })
      expect(purchase.total).toBe(49.8) // paid, not 29.8
      expect(purchase.discount).toBe(20)
    })

    it('does not import a rounding line as a purchased item', async () => {
      const receiptImportId = await createUploadedReceipt()
      const extracted = extractedReceipt({
        items: [
          { name: 'Albert mléko', category: 'Potraviny', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: null, confidence: 0.96 },
          { name: 'ZAOKROUHLENÍ PŘÍJEM', category: 'Ostatní', quantity: 1, unit: 'ks', unitPrice: 0.2, totalPrice: 0.2, discount: null, confidence: 0.9 },
        ],
        discountTotal: 0,
        total: 50,
      })
      const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))

      expect(row.status).toBe('completed')
      const items = await db.query.purchaseItems.findMany({ where: eq(schema.purchaseItems.purchaseId, row.purchaseId!) })
      expect(items.map((purchaseItem) => purchaseItem.name)).toEqual(['Albert mléko'])
      const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
      expect(Number(purchase?.total)).toBe(50) // the rounding is part of what was paid
      const pantry = await db.query.pantryItems.findMany({ where: eq(schema.pantryItems.householdId, householdId) })
      expect(pantry.some((pantryItem) => /zaokrouhlen/i.test(pantryItem.name))).toBe(false)
    })

    // Regression: on the real Albert receipt the OCR had dropped the "0.43 x 34.90 Kč" line of the
    // weighed apples, leaving only "15.00 Kč". The line was stored as 1 ks and, for a catalog product,
    // 15,00 Kč was recorded as its unit price; and the weighed paprika (0.37 × 69,90 Kč/kg) was
    // stored as 0.37 "ks".
    describe('weighed lines', () => {
      async function withCatalogProduct<T>(run: (name: string, productId: string) => Promise<T>): Promise<T> {
        const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
        const name = `__test_weighed_${crypto.randomUUID()}`
        const [product] = await db.insert(schema.products).values({ name, categoryId: category!.id, defaultUnit: 'kg', defaultLocation: 'Spíž' }).returning()
        try {
          return await run(name, product.id)
        } finally {
          await db.delete(schema.products).where(eq(schema.products.id, product.id)) // prices cascade
        }
      }

      it('keeps the spending but records no unit price when the weight and price per kilo are missing', async () => {
        await withCatalogProduct(async (name, productId) => {
          const receiptImportId = await createUploadedReceipt()
          const extracted = extractedReceipt({
            items: [{ name, category: 'Potraviny', quantity: null, unit: null, unitPrice: null, totalPrice: 15, discount: null, confidence: 0.8 }],
            discountTotal: 0,
            total: 15,
          })
          const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))
          expect(row.status).toBe('completed')

          const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
          expect(Number(purchase?.total)).toBe(15) // what was spent is right
          expect(await db.query.prices.findMany({ where: eq(schema.prices.productId, productId) })).toHaveLength(0) // 15 Kč is not a price per piece
        })
      })

      it('stores a weight with a price per kilo as kilograms and records the per-kilo price', async () => {
        await withCatalogProduct(async (name, productId) => {
          const receiptImportId = await createUploadedReceipt()
          const extracted = extractedReceipt({
            items: [{ name, category: 'Potraviny', quantity: 0.37, unit: null, unitPrice: 69.9, totalPrice: 25.9, discount: null, confidence: 0.9 }],
            discountTotal: 0,
            total: 25.9,
          })
          const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))
          expect(row.status).toBe('completed')

          const purchaseItem = await db.query.purchaseItems.findFirst({ where: eq(schema.purchaseItems.purchaseId, row.purchaseId!) })
          expect(purchaseItem).toMatchObject({ unit: 'kg', quantity: 0.37 })
          expect(Number(purchaseItem?.price)).toBe(69.9)
          const observations = await db.query.prices.findMany({ where: eq(schema.prices.productId, productId) })
          expect(observations).toHaveLength(1)
          expect(observations[0]).toMatchObject({ unit: 'kg' })
          expect(Number(observations[0].unitPrice)).toBe(69.9)
        })
      })
    })

    it('leaves purchases.discount empty when nothing was discounted', async () => {
      const receiptImportId = await createUploadedReceipt()
      const row = await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt()))
      const purchase = await db.query.purchases.findFirst({ where: eq(schema.purchases.id, row.purchaseId!) })
      expect(purchase?.discount).toBeNull()
    })

    it('routes to review_required when a discount was emitted as its own negative item', async () => {
      const receiptImportId = await createUploadedReceipt()
      const extracted = extractedReceipt({
        items: [
          { name: 'Mléko', category: 'Potraviny', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: null, confidence: 0.96 },
          { name: 'Sleva', category: null, quantity: 1, unit: 'ks', unitPrice: -5, totalPrice: -5, discount: null, confidence: 0.5 },
        ],
        discountTotal: 0,
        total: 44.8,
      })
      const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))

      expect(row.status).toBe('review_required')
      expect(row.purchaseId).toBeNull()
    })

    it('records the pre-discount shelf price as the price observation, not the discounted amount', async () => {
      const category = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.name, 'Potraviny') })
      const productName = `__test_discount_observation_${crypto.randomUUID()}`
      const [product] = await db.insert(schema.products).values({ name: productName, categoryId: category!.id, defaultUnit: 'ks', defaultLocation: 'Spíž' }).returning()

      try {
        const receiptImportId = await createUploadedReceipt()
        const extracted = extractedReceipt({
          items: [{ name: productName, category: 'Potraviny', quantity: 2, unit: 'ks', unitPrice: 24.9, totalPrice: 49.8, discount: 5, confidence: 0.96 }],
          discountTotal: 5,
          total: 44.8,
        })
        const row = await processReceiptImport(receiptImportId, fakeProviders(extracted))
        expect(row.status).toBe('completed')

        const observations = await db.query.prices.findMany({ where: eq(schema.prices.productId, product.id) })
        expect(observations).toHaveLength(1)
        expect(observations[0].sourceType).toBe('RECEIPT')
        expect(Number(observations[0].regularPrice)).toBe(24.9)
      } finally {
        await db.delete(schema.products).where(eq(schema.products.id, product.id)) // prices cascade
      }
    })
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

describe('receipt file handling: type detection and OCR preparation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  })

  /** A small real photo-like PNG (thin strokes on paper) so the preparation step has something to decode. */
  const realImage = () => {
    const strokes = Array.from({ length: 40 }, (_, k) => `<rect x="${40 + k * 7}" y="60" width="2" height="12" fill="#111"/>`).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="100%" height="100%" fill="#fff"/>${strokes}</svg>`
    return sharp(Buffer.from(svg)).png().toBuffer()
  }

  async function storeReceiptBytes(bytes: Buffer, extension: string, contentType: string): Promise<string> {
    const blob = await put(`receipts/__test__/${crypto.randomUUID()}.${extension}`, bytes, { access: 'private', contentType })
    uploadedBlobUrls.push(blob.url)
    const [row] = await db.insert(schema.receiptImports).values({ householdId, status: 'uploaded', source: 'ocr', imageUrl: blob.url }).returning()
    return row.id
  }

  describe('uploadReceiptAction', () => {
    const upload = async (bytes: Buffer, declaredMimeType: string) => uploadReceiptAction(bytes.toString('base64'), declaredMimeType)

    it('decides the type from the file\'s bytes: a PNG declared as JPEG is stored as a PNG', async () => {
      const state = await upload(await realImage(), 'image/jpeg') // wrong on purpose
      const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, state.id) })
      uploadedBlobUrls.push(row!.imageUrl!)
      expect(row?.imageUrl).toMatch(/\.png$/)
      expect(row?.status).toBe('uploaded')
      expect(state.hasImage).toBe(true)
    })

    it('rejects a file that is not an image or PDF, even when it claims to be one', async () => {
      await expect(upload(Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg')).rejects.toThrow('Nepodporovaný formát')
      const rows = await db.query.receiptImports.findMany({ where: eq(schema.receiptImports.householdId, householdId) })
      expect(rows).toHaveLength(0) // nothing stored, nothing created
    })

    it('rejects HEIC with an instruction the user can act on', async () => {
      const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(32)])
      await expect(upload(heic, 'image/heic')).rejects.toThrow('Nastavení › Fotoaparát › Formáty › Nejkompatibilnější')
    })

    it('rejects an empty file', async () => {
      await expect(upload(Buffer.alloc(0), 'image/jpeg')).rejects.toThrow('prázdný')
    })
  })

  describe('processReceiptImport', () => {
    const capturingProviders = () => {
      const seen: Array<{ base64: string; mimeType: string }> = []
      return {
        seen,
        providers: {
          textExtractor: { extractText: async (image: { base64: string; mimeType: string }) => { seen.push(image); return { fullText: 'FAKE OCR TEXT', lines: ['FAKE OCR TEXT'] } } },
          structuringProvider: fakeProviders(extractedReceipt()).structuringProvider,
        },
      }
    }

    it('sends the OCR a cleaned-up grayscale JPEG, not the raw upload, and logs what was done', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {})
      const original = await realImage()
      const receiptImportId = await storeReceiptBytes(original, 'png', 'image/png')
      const { seen, providers } = capturingProviders()

      const row = await processReceiptImport(receiptImportId, providers)

      expect(row.status).toBe('completed')
      expect(seen).toHaveLength(1)
      expect(seen[0].mimeType).toBe('image/jpeg')
      const sent = Buffer.from(seen[0].base64, 'base64')
      expect(sent.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true) // JPEG, whereas the upload was a PNG
      expect(sent.equals(original)).toBe(false)

      const entry = JSON.parse(info.mock.calls.map((call) => String(call[0])).find((line) => line.includes('"event":"receipt_import"'))!)
      expect(entry.imagePrep.status).toBe('ok')
      expect(entry.imagePrep.steps).toEqual(expect.arrayContaining(['auto-rotate', 'grayscale', 'contrast']))
      expect(entry.imagePrep.bytesBefore).toBe(original.length)
    })

    it('never modifies the stored original', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {})
      const original = await realImage()
      const receiptImportId = await storeReceiptBytes(original, 'png', 'image/png')
      await processReceiptImport(receiptImportId, capturingProviders().providers)

      const stored = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
      const blob = await get(stored!.imageUrl!, { access: 'private' })
      const bytes = Buffer.from(await new Response(blob!.stream!).arrayBuffer())
      expect(bytes.equals(original)).toBe(true)
    })

    it('falls back to the original bytes when preparation fails, instead of failing the import', async () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {})
      const garbage = Buffer.from('not-a-decodable-image')
      const receiptImportId = await storeReceiptBytes(garbage, 'png', 'image/png')
      const { seen, providers } = capturingProviders()

      const row = await processReceiptImport(receiptImportId, providers)

      expect(row.status).toBe('completed') // OCR was still attempted, and (faked) succeeded
      expect(Buffer.from(seen[0].base64, 'base64').equals(garbage)).toBe(true)
      const entry = JSON.parse(info.mock.calls.map((call) => String(call[0])).find((line) => line.includes('"event":"receipt_import"'))!)
      expect(entry.imagePrep.status).toBe('failed')
      expect(entry.imagePrep.note).toBeTruthy()
    })

    /** Runs an import whose primary OCR always fails, recording what each provider was sent. */
    async function runWithFailingPrimary(bytes: Buffer) {
      vi.spyOn(console, 'info').mockImplementation(() => {})
      process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://example.invalid'
      process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'not-a-real-key'
      const receiptImportId = await storeReceiptBytes(bytes, 'png', 'image/png')
      const primarySeen: Array<{ base64: string; mimeType: string }> = []
      const fallbackSeen: Array<{ base64: string; mimeType: string }> = []

      const row = await processReceiptImport(receiptImportId, {
        textExtractor: { extractText: async (image) => { primarySeen.push(image); throw new Error('primary down') } },
        fallbackTextExtractor: { extractText: async (image) => { fallbackSeen.push(image); return { fullText: 'AZURE TEXT', lines: ['AZURE TEXT'] } } },
        structuringProvider: fakeProviders(extractedReceipt()).structuringProvider,
      })
      return { row, primarySeen, fallbackSeen }
    }

    it('gives the Azure fallback the same cleaned-up image as the primary OCR, not the raw upload', async () => {
      const original = await realImage()
      const { row, primarySeen, fallbackSeen } = await runWithFailingPrimary(original)

      expect(row.ocrProvider).toBe('azure_document_intelligence')
      expect(fallbackSeen).toHaveLength(1)
      expect(fallbackSeen[0]).toEqual(primarySeen[0])
      expect(fallbackSeen[0].mimeType).toBe('image/jpeg') // the upload was a PNG
      expect(Buffer.from(fallbackSeen[0].base64, 'base64').equals(original)).toBe(false)
    })

    it('gives both providers the original when preparation fails', async () => {
      const garbage = Buffer.from('not-a-decodable-image')
      const { primarySeen, fallbackSeen } = await runWithFailingPrimary(garbage)

      expect(Buffer.from(primarySeen[0].base64, 'base64').equals(garbage)).toBe(true)
      expect(fallbackSeen[0]).toEqual(primarySeen[0])
    })

    it('stops with the HEIC instruction for a stored HEIC and never calls the OCR', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(32)])
      const receiptImportId = await storeReceiptBytes(heic, 'heic', 'image/heic')
      const { seen, providers } = capturingProviders()

      const row = await processReceiptImport(receiptImportId, providers)

      expect(row.status).toBe('ocr_failed')
      expect(row.errorMessage).toContain('HEIC')
      expect(seen).toHaveLength(0)
    })
  })
})

describe('processReceiptImport — access control', () => {
  it('refuses to process another household\'s import (the function is reachable as a Server Action)', async () => {
    const receiptImportId = await createUploadedReceipt()
    const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_receipts_other2__' }).returning()
    createdHouseholdIds.push(otherHousehold.id)
    currentHouseholdId = otherHousehold.id

    await expect(processReceiptImport(receiptImportId, fakeProviders(extractedReceipt()))).rejects.toThrow('Receipt import not found')

    const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
    expect(row?.status).toBe('uploaded') // untouched
  })
})

describe('receipt import logging (docs/08 section 19)', () => {
  const logLines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('"event":"receipt_import"'))
  afterEach(() => vi.restoreAllMocks())

  it('writes one structured line per run with stage statuses, timing and token usage — and no receipt content', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const receiptImportId = await createUploadedReceipt()
    const providers = {
      textExtractor: { extractText: async () => ({ fullText: 'SECRET RECEIPT TEXT Mléko', lines: ['SECRET RECEIPT TEXT Mléko'] }) },
      structuringProvider: {
        structure: async (_text: string, options?: { onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void }) => {
          options?.onUsage?.({ inputTokens: 123, outputTokens: 45 })
          return extractedReceipt()
        },
      },
    }

    const row = await processReceiptImport(receiptImportId, providers)
    expect(row.status).toBe('completed')

    const lines = logLines(info)
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0])
    expect(entry).toMatchObject({
      importId: receiptImportId,
      householdId,
      ocr: { status: 'ok', provider: 'google_vision' },
      parser: { status: 'ok', inputTokens: 123, outputTokens: 45 },
      validation: 'passed',
      finalStatus: 'completed',
      error: null,
    })
    expect(typeof entry.timestamp).toBe('string')
    expect(typeof entry.totalMs).toBe('number')
    expect(typeof entry.ocr.ms).toBe('number')
    expect(typeof entry.parser.ms).toBe('number')
    // Personal financial data stays out of the logs.
    expect(lines[0]).not.toContain('SECRET RECEIPT TEXT')
    expect(lines[0]).not.toContain('Mléko')
  })

  it('logs a receipt sent to review with that validation outcome', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ total: 999 })))
    expect(JSON.parse(logLines(info)[0])).toMatchObject({ validation: 'review_required', finalStatus: 'review_required' })
  })

  it('logs an OCR failure via console.error, with the credential redacted from the error', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, {
      textExtractor: { extractText: async () => { throw new Error('fetch failed: https://vision.googleapis.com/v1/images:annotate?key=SUPERSECRETKEY') } },
      structuringProvider: fakeProviders(extractedReceipt()).structuringProvider,
    })

    const lines = logLines(error)
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0])
    expect(entry).toMatchObject({ ocr: { status: 'failed' }, parser: { status: 'not_run' }, validation: 'not_run', finalStatus: 'ocr_failed' })
    expect(lines[0]).not.toContain('SUPERSECRETKEY')
  })

  it('logs a parser failure with its stage status', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, {
      textExtractor: fakeProviders(extractedReceipt()).textExtractor,
      structuringProvider: { structure: async () => { throw new Error('model overloaded') } },
    })
    expect(JSON.parse(logLines(error)[0])).toMatchObject({ ocr: { status: 'ok' }, parser: { status: 'failed' }, finalStatus: 'parsing_failed' })
  })
})

describe('claiming an import for processing (processUploadedReceiptAction / retryReceiptImportAction)', () => {
  // These actions use the real default providers, so the OCR call is made to fail without touching
  // the network: no Azure fallback, and any Google request answered locally with an error. What is
  // under test is the claim (state machine + concurrency), not OCR.
  const realFetch = globalThis.fetch
  const savedAzure = { endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, key: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY }
  beforeEach(() => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
    process.env.GOOGLE_VISION_API_KEY = 'test-key-not-real'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('googleapis.com')
        ? Promise.resolve(new Response(JSON.stringify({ error: { message: 'stubbed Vision failure' } }), { status: 500 }))
        : realFetch(input, init),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (savedAzure.endpoint !== undefined) process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = savedAzure.endpoint
    if (savedAzure.key !== undefined) process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = savedAzure.key
  })

  it('processes a freshly uploaded import once and refuses a second run', async () => {
    const receiptImportId = await createUploadedReceipt()
    const state = await processUploadedReceiptAction(receiptImportId)
    expect(state.status).toBe('ocr_failed')
    expect(state.errorMessage).toContain('stubbed Vision failure')
    await expect(processUploadedReceiptAction(receiptImportId)).rejects.toThrow('se už zpracovává nebo je zpracovaný')
  })

  it('lets exactly one of two concurrent requests process the same import (no double purchase)', async () => {
    const receiptImportId = await createUploadedReceipt()
    const results = await Promise.allSettled([processUploadedReceiptAction(receiptImportId), processUploadedReceiptAction(receiptImportId)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  })

  it('refuses another household\'s import', async () => {
    const receiptImportId = await createUploadedReceipt()
    const [otherHousehold] = await db.insert(schema.households).values({ name: '__test_household_receipts_other3__' }).returning()
    createdHouseholdIds.push(otherHousehold.id)
    currentHouseholdId = otherHousehold.id
    await expect(processUploadedReceiptAction(receiptImportId)).rejects.toThrow('Receipt import not found')
    await expect(retryReceiptImportAction(receiptImportId)).rejects.toThrow('Receipt import not found')
  })

  it('retry re-runs a failed import and clears the previous error instead of keeping it', async () => {
    const receiptImportId = await createUploadedReceipt()
    await db.update(schema.receiptImports).set({ status: 'ocr_failed', errorMessage: 'PREVIOUS FAILURE' }).where(eq(schema.receiptImports.id, receiptImportId))

    const state = await retryReceiptImportAction(receiptImportId)
    expect(state.status).toBe('ocr_failed') // the stubbed OCR fails again, with a fresh message
    expect(state.errorMessage).not.toContain('PREVIOUS FAILURE')
    expect(state.errorMessage).toContain('stubbed Vision failure')
  })

  it('retry also starts an import that was uploaded but never processed', async () => {
    const receiptImportId = await createUploadedReceipt()
    const state = await retryReceiptImportAction(receiptImportId)
    expect(state.status).toBe('ocr_failed')
  })

  it('does not take over an import that is actively running, but does once it has been silent for too long', async () => {
    const receiptImportId = await createUploadedReceipt()
    await db.update(schema.receiptImports).set({ status: 'parsing', updatedAt: new Date() }).where(eq(schema.receiptImports.id, receiptImportId))
    await expect(retryReceiptImportAction(receiptImportId)).rejects.toThrow('nelze znovu spustit')

    const abandoned = new Date(Date.now() - (RECEIPT_STALE_MS + 60_000))
    await db.update(schema.receiptImports).set({ status: 'parsing', updatedAt: abandoned }).where(eq(schema.receiptImports.id, receiptImportId))
    const state = await retryReceiptImportAction(receiptImportId)
    expect(state.status).toBe('ocr_failed')
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

  it('applies a reviewed line discount and the receipt\'s own discount total, without counting a line discount twice', async () => {
    const receiptImportId = await createUploadedReceipt()
    // Parsed discountTotal is 10 (→ review_required because the stated total is wrong).
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ discountTotal: 10, total: 999 })))

    // Reviewer keeps a 3.00 line discount. Of the 10.00 saved in total, 3.00 is on the line and
    // the remaining 7.00 (a coupon) is not, so the amount paid is 40 − 3 − 7 = 30.
    const { purchase } = await confirmReceiptReviewAction(receiptImportId, [item({ name: 'Rýže', price: 40, quantity: 1, discount: 3 })], { date: TEST_DATE })
    expect(purchase.total).toBe(30)
    expect(purchase.discount).toBe(10)
    expect(purchase.items[0].price).toBe(37)
  })

  it('rejects a reviewed line discount that is larger than the line', async () => {
    const receiptImportId = await createUploadedReceipt()
    await processReceiptImport(receiptImportId, fakeProviders(extractedReceipt({ total: 999 })))
    await expect(confirmReceiptReviewAction(receiptImportId, [item({ price: 10, quantity: 1, discount: 50 })], { date: TEST_DATE })).rejects.toThrow('vyšší než její cena')
    await expect(confirmReceiptReviewAction(receiptImportId, [item({ discount: -1 })], { date: TEST_DATE })).rejects.toThrow('záporná')
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