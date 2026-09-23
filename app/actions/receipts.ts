'use server'

import { del, get, put } from '@vercel/blob'
import { and, eq, gte, inArray, lt, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { TODAY } from '@/lib/budget'
import { getDb } from '@/lib/db/client'
import { getProductCatalog, recordPriceObservation, restockPantryItem, toReceiptImportState, upsertProductCatalogDefaults, type ReceiptImportState } from '@/lib/db/queries'
import * as schema from '@/lib/db/schema'
import { inferPantryLocation } from '@/lib/pantry'
import { logReceiptImport, newReceiptTrace, type ReceiptTrace } from '@/lib/receipt-log'
import { detectReceiptFileType, prepareReceiptImageForOcr } from '@/lib/receipt-image'
import { RECEIPT_STALE_MS } from '@/lib/receipt-progress'
import { matchProductByName } from '@/lib/products'
import {
  azureReceiptTextExtractor,
  geminiStructuringProvider,
  googleVisionPdfTextExtractor,
  googleVisionTextExtractor,
  isAzureReceiptFallbackConfigured,
  isPotentialDuplicate,
  needsReview,
  netUnitPrice,
  normalizeOcrText,
  receiptDiscounts,
  receiptTotal,
  resolveItemPlacement,
  normalizeStoreName,
  storeNameMatchKey,
  toReceiptLineItems,
  type ExtractedReceipt,
  type ReceiptLineItem,
  type ReceiptStructuringProvider,
  type ReceiptTextExtractor,
} from '@/lib/receipts'
import type { PurchaseRecord } from '@/lib/types'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

const HEIC_UNSUPPORTED_MESSAGE =
  'Formát HEIC není podporovaný. V iPhonu zvolte Nastavení › Fotoaparát › Formáty › Nejkompatibilnější, nebo fotku před nahráním uložte jako JPEG.'

/** Fallback for a stored file whose bytes are not recognisable (see detectReceiptFileType) — the
 *  upload action now rejects those, so this only matters for imports created earlier. */
function mimeTypeFromExtension(url: string): 'application/pdf' | 'image/png' | 'image/webp' | 'image/jpeg' {
  const lower = url.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

async function assertOwnsReceiptImport(householdId: string, receiptImportId: string) {
  const db = getDb()
  const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
  if (!row || row.householdId !== householdId) throw new Error('Receipt import not found')
  return row
}

/** The one place a `ReceiptLineItem[]` actually becomes a real purchase — shared by manual entry
 *  (`importReceiptAction`), a fully-automatic OCR pass, and a human-reviewed/corrected OCR result,
 *  so the purchase-creation/pantry-restocking rule lives in exactly one place per CLAUDE.md
 *  section 6. Does not touch `receipt_imports` — callers own that record's lifecycle. */
async function findOrCreateStore(storeName: string | null | undefined): Promise<string | null> {
  if (!storeName?.trim()) return null
  const canonicalName = normalizeStoreName(storeName)
  const matchKey = storeNameMatchKey(canonicalName)
  if (!matchKey) return null
  const db = getDb()
  const existing = (await db.query.stores.findMany()).find((store) => storeNameMatchKey(store.chain) === matchKey)
  if (existing) return existing.id
  try {
    const [created] = await db.insert(schema.stores).values({ chain: canonicalName }).returning({ id: schema.stores.id })
    return created.id
  } catch (error) {
    const raced = (await db.query.stores.findMany()).find((store) => storeNameMatchKey(store.chain) === matchKey)
    if (raced) return raced.id
    throw error
  }
}

function resolveReceiptPurchaseDate(optionsDate: string | undefined, storedDate: string | null): string {
  const date = optionsDate?.trim() || storedDate?.trim() || ''
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Datum nákupu je povinné a musí být ve formátu YYYY-MM-DD.')
  }
  const parsed = new Date(date + 'T00:00:00Z')
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Datum nákupu není platné.')
  }
  return date
}

/** `source` decides how each item's category/pantry-location gets resolved, and whether the
 *  catalog learns from it:
 *  - `'confirmed'`: a human directly typed or reviewed every item (manual entry, or a completed
 *    review). A known catalog product's category still wins even over what was typed this time —
 *    consistent with every other entry path (e.g. `addShoppingItemAction`) — since the catalog
 *    *is* the remembered correction; there's simply no catalog entry to override for a genuinely
 *    new product, so the typed value always applies there. Missing a `location` (manual entry has
 *    no location field) falls back to the catalog's remembered one, then `inferPantryLocation()`,
 *    then 'Spíž' as an absolute last resort. Every item is then written back into the product
 *    catalog (`upsertProductCatalogDefaults`) so the *next* receipt of the same product resolves
 *    automatically — the whole point of section 10's "remember the correction" rule.
 *  - `'auto'`: a fully-automatic OCR pass with no human involved — catalog priority is enforced via
 *    `resolveItemPlacement()` (the same function `processReceiptImport()` already used to decide
 *    this receipt didn't need review), and nothing gets written back to the catalog, since nothing
 *    here was actually verified by a person. */
function normalizeStoreLocationPart(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase('cs-CZ').replace(/\s+/g, ' ') ?? ''
}

/** Resolves an OCR address to an existing branch, or creates the branch when OCR has enough
 *  physical-location data. Missing coordinates/opening hours stay NULL until a trusted store
 *  directory source enriches the branch; receipt OCR must never invent geographic data. */
async function findOrCreateStoreLocation(storeId: string | null, address?: string | null, city?: string | null): Promise<string | null> {
  if (!storeId) return null
  const wantedAddress = normalizeStoreLocationPart(address)
  const wantedCity = normalizeStoreLocationPart(city)
  if (!wantedAddress) return null

  const db = getDb()
  const locations = await db.query.storeLocations.findMany({ where: eq(schema.storeLocations.storeId, storeId) })
  const exact = locations.find((location) =>
    normalizeStoreLocationPart(location.address) === wantedAddress &&
    normalizeStoreLocationPart(location.city) === wantedCity,
  )
  if (exact) return exact.id

  const [store] = await db.query.stores.findMany({ where: eq(schema.stores.id, storeId) })
  if (!store) return null

  try {
    const [created] = await db
      .insert(schema.storeLocations)
      .values({
        storeId,
        name: address!.trim(),
        address: address!.trim(),
        city: city?.trim() ?? '',
      })
      .returning({ id: schema.storeLocations.id })
    return created.id
  } catch (error) {
    // The unique normalized chain/address/city index makes concurrent OCR imports converge on
    // the same branch instead of creating duplicates. Re-read after a uniqueness race.
    const raced = await db.query.storeLocations.findMany({ where: eq(schema.storeLocations.storeId, storeId) })
    const match = raced.find((location) =>
      normalizeStoreLocationPart(location.address) === wantedAddress &&
      normalizeStoreLocationPart(location.city) === wantedCity,
    )
    if (match) return match.id
    throw error
  }
}

async function recordReceiptPriceObservations(
  items: Array<ReceiptLineItem & { productId?: string | null }>,
  storeId: string | null | undefined,
  storeLocationId: string | null | undefined,
  date: string,
  currency?: string | null,
): Promise<void> {
  if (!storeId) return
  await Promise.all(
    items
      .filter((item) => item.productId && item.quantity > 0 && item.price >= 0)
      .map((item) => {
        // Deliberately the pre-discount shelf price, not what the household paid: a receipt
        // discount may be a personal coupon or loyalty rebate, not a shelf promotion, and
        // recording the discounted amount as the product's regular price would understate it
        // (CLAUDE.md section 18: a discount is not automatically a promotion).
        const unitPrice = item.price
        return recordPriceObservation({
          productId: item.productId!,
          storeId,
          storeLocationId,
          regularPrice: unitPrice,
          currency: currency ?? 'CZK',
          unit: item.unit,
          unitPrice,
          observedAt: date,
          validFrom: date,
          priceScope: 'STORE',
          sourceType: 'RECEIPT',
          locationResolution: storeLocationId ? 'RESOLVED' : 'UNKNOWN',
        })
      }),
  )
}

async function createPurchaseFromReceiptItems(
  householdId: string,
  items: ReceiptLineItem[],
  options: {
    date?: string
    storedDate?: string | null
    storeLocationId?: string | null
    storeName?: string | null
    storeId?: string | null
    currency?: string | null
    /** The receipt's stated total discount (per-line + receipt-wide), when known. */
    receiptDiscountTotal?: number | null
    source: 'confirmed' | 'auto'
  },
): Promise<PurchaseRecord> {
  if (items.length === 0) throw new Error('Receipt has no items')
  // Reject impossible discounts explicitly (a reviewer can type anything) instead of storing a
  // negative price or silently clamping it.
  for (const item of items) {
    const discount = item.discount ?? 0
    if (discount < 0) throw new Error(`Sleva u položky „${item.name}“ nemůže být záporná.`)
    if (discount > item.price * item.quantity + 0.005) throw new Error(`Sleva u položky „${item.name}“ je vyšší než její cena.`)
  }
  const db = getDb()
  const date = resolveReceiptPurchaseDate(options.date, options.storedDate ?? null)

  const catalog = await getProductCatalog()
  const resolvedItems = items.map((item) => {
    const catalogEntry = matchProductByName(catalog, item.name)
    if (options.source === 'auto') {
      // processReceiptImport() already verified every item resolves before calling this, so
      // `placement` is never null here — but fall back to the item's own values rather than a
      // non-null assertion, in case a future caller passes source: 'auto' without that guarantee.
      const placement = resolveItemPlacement(catalogEntry, item.category, item.name)
      return { ...item, productId: catalogEntry?.id ?? null, category: placement?.category ?? item.category, location: placement?.location ?? item.location }
    }
    // 'confirmed': a known catalog product's category is still authoritative (consistent with
    // every other entry path in the app — e.g. addShoppingItemAction) even over what was typed
    // this time, since the catalog itself is how a correction gets remembered in the first place
    // (see upsertProductCatalogDefaults below) — for a *new* product, there's no catalog entry to
    // override, so the typed category always applies. Location, which manual entry has no field
    // for at all, still prefers an explicit value (from a review form) before falling back.
    const location = item.location ?? catalogEntry?.defaultLocation ?? inferPantryLocation(item.category, item.name) ?? 'Spíž'
    return { ...item, productId: catalogEntry?.id ?? null, category: catalogEntry?.category ?? item.category, location }
  })

  // `purchases.total` is what was actually paid: line totals net of their own discounts, minus any
  // receipt-wide discount no line carries. `purchases.discount` records how much was saved, so the
  // history can show "sleva X Kč" without the total being overstated for spending analytics.
  const { discount, unallocated } = receiptDiscounts(resolvedItems, options.receiptDiscountTotal ?? null)
  const total = Math.max(0, Math.round((receiptTotal(resolvedItems) - unallocated) * 100) / 100)
  const storeId = options.storeId ?? await findOrCreateStore(options.storeName)
  const [purchaseRow] = await db
    .insert(schema.purchases)
    .values({ householdId, storeId, storeLocationId: options.storeLocationId ?? undefined, date, total: total.toString(), discount: discount > 0 ? discount.toString() : undefined })
    .returning()

  const itemRows = await db
    .insert(schema.purchaseItems)
    .values(
      resolvedItems.map((item) => ({
        purchaseId: purchaseRow.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        // Net per-unit price actually paid; the pre-discount price is kept on the price
        // observation below and, for reviewed imports, in receipt_imports.items.
        price: netUnitPrice(item).toString(),
      })),
    )
    .returning()

  for (const item of resolvedItems) {
    await restockPantryItem(householdId, { productId: item.productId, name: item.name, category: item.category, quantity: item.quantity, unit: item.unit, location: item.location })
  }

  await recordReceiptPriceObservations(resolvedItems, storeId, options.storeLocationId, date, options.currency)

  if (options.source === 'confirmed') {
    for (const item of resolvedItems) {
      // Always concrete for 'confirmed' items (resolved above) — the `?? 'Spíž'` here only
      // satisfies the type checker, which can't see that per-branch guarantee across the shared
      // `resolvedItems` array type.
      await upsertProductCatalogDefaults({ name: item.name, category: item.category, unit: item.unit, location: item.location ?? 'Spíž' })
    }
  }

  const storeLocation = options.storeLocationId
    ? await db.query.storeLocations.findFirst({ where: eq(schema.storeLocations.id, options.storeLocationId), with: { store: true } })
    : null

  return {
    id: purchaseRow.id,
    storeId: purchaseRow.storeId ?? undefined,
    date: purchaseRow.date,
    store: storeLocation?.store.chain ?? (storeId ? (await db.query.stores.findFirst({ where: eq(schema.stores.id, storeId) }))?.chain : undefined),
    total: Number(purchaseRow.total),
    discount: purchaseRow.discount != null ? Number(purchaseRow.discount) : undefined,
    items: itemRows.map((row) => ({ name: row.name, quantity: row.quantity, unit: row.unit, price: Number(row.price) })),
  }
}

/** Turns a manually-entered receipt into a real purchase, and keeps a `receipt_imports` record so
 *  a future OCR provider's output stays auditable/reprocessable, extending CLAUDE.md section 16's
 *  price/deal provenance rule to purchases too. Every manual import goes straight to `imported` —
 *  there's no OCR/AI step to fail or need review. */
export async function importReceiptAction(
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string; storeName?: string; currency?: string } = {},
): Promise<{ purchase: PurchaseRecord }> {
  const householdId = await requireHouseholdId()
  const purchase = await createPurchaseFromReceiptItems(householdId, items, { ...options, source: 'confirmed' })

  const db = getDb()
  await db.insert(schema.receiptImports).values({
    householdId,
    status: 'imported',
    storeId: options.storeName ? await findOrCreateStore(options.storeName) : null,
    storeLocationId: options.storeLocationId,
    date: options.date ?? TODAY,
    source: 'manual',
    items: JSON.stringify(items),
    purchaseId: purchase.id,
    processedAt: new Date(),
  })

  revalidatePath('/')
  return { purchase }
}

// --- OCR pipeline (docs/08_OCR_RECEIPT_PIPELINE.md) ---------------------------------------------

/** Runs the OCR pipeline's automated stages (docs/08_OCR_RECEIPT_PIPELINE.md sections 3–9) against
 *  an already-uploaded receipt image, updating the same `receipt_imports` row throughout rather
 *  than creating a new one per stage. `textExtractor`/`structuringProvider` are injectable so the
 *  orchestration logic itself — the state transitions, validation gate, and duplicate check — can
 *  be integration-tested with fakes, independently of whether real Google Vision/Gemini
 *  credentials are configured. Never throws: every failure is recorded on the row as
 *  `ocr_failed`/`parsing_failed` with an `errorMessage`, so the caller always gets back a row to
 *  show the household, per section 19 ("show the specific reason, not a bare error"). */
export async function processReceiptImport(
  receiptImportId: string,
  deps: {
    textExtractor: ReceiptTextExtractor
    structuringProvider: ReceiptStructuringProvider
    fallbackTextExtractor?: ReceiptTextExtractor
  } = {
    textExtractor: googleVisionTextExtractor,
    structuringProvider: geminiStructuringProvider,
    fallbackTextExtractor: azureReceiptTextExtractor,
  },
): Promise<typeof schema.receiptImports.$inferSelect> {
  // One structured log line per run (docs/08_OCR_RECEIPT_PIPELINE.md section 19), written even when
  // the pipeline throws — the trace is filled in by runReceiptPipeline as each stage completes.
  // This function is exported from a 'use server' module, so it is reachable from the client as an
  // action — the caller must own the import, like every other action here.
  await assertOwnsReceiptImport(await requireHouseholdId(), receiptImportId)
  const startedAt = Date.now()
  const trace = newReceiptTrace(receiptImportId)
  try {
    const finalRow = await runReceiptPipeline(receiptImportId, deps, trace)
    trace.finalStatus = finalRow.status
    trace.error = finalRow.errorMessage
    return finalRow
  } catch (error) {
    trace.finalStatus = 'threw'
    trace.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    trace.totalMs = Date.now() - startedAt
    logReceiptImport(trace)
  }
}

async function runReceiptPipeline(
  receiptImportId: string,
  deps: {
    textExtractor: ReceiptTextExtractor
    structuringProvider: ReceiptStructuringProvider
    fallbackTextExtractor?: ReceiptTextExtractor
  },
  trace: ReceiptTrace,
): Promise<typeof schema.receiptImports.$inferSelect> {
  const db = getDb()
  const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
  if (!row) throw new Error('Receipt import not found')
  trace.householdId = row.householdId
  if (!row.imageUrl) throw new Error('Receipt import has no image to process')

  async function update(values: Partial<typeof schema.receiptImports.$inferInsert>) {
    const [updated] = await db
      .update(schema.receiptImports)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.receiptImports.id, receiptImportId))
      .returning()
    return updated
  }

  await update({ status: 'ocr_processing' })

  const ocrStartedAt = Date.now()
  let original: Buffer
  try {
    const result = await get(row.imageUrl, { access: 'private' })
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error('Photo not found in storage')
    original = Buffer.from(await new Response(result.stream).arrayBuffer())
  } catch (error) {
    trace.ocr = { status: 'failed', provider: null, ms: Date.now() - ocrStartedAt }
    return update({ status: 'ocr_failed', errorMessage: `Nepodařilo se načíst uloženou fotografii: ${error instanceof Error ? error.message : String(error)}` })
  }

  // What the file really is comes from its bytes, not its name or the client's claim.
  const detected = detectReceiptFileType(original)
  if (detected.kind === 'heic') {
    trace.ocr = { status: 'failed', provider: null, ms: Date.now() - ocrStartedAt }
    return update({ status: 'ocr_failed', errorMessage: HEIC_UNSUPPORTED_MESSAGE })
  }
  const storedMimeType = detected.kind === 'supported' ? detected.mimeType : mimeTypeFromExtension(row.imageUrl)

  // Clean the photo up for OCR (orientation, lighting, contrast, tilt — see lib/receipt-image.ts).
  // The stored original is never modified, and preparation is strictly best-effort: if it fails the
  // original is sent instead, so this step can only ever help, never block an import. PDFs are sent
  // as they are.
  let ocrInput: { base64: string; mimeType: string } = { base64: original.toString('base64'), mimeType: storedMimeType }
  if (storedMimeType !== 'application/pdf') {
    const prepStartedAt = Date.now()
    try {
      const prepared = await prepareReceiptImageForOcr(original)
      ocrInput = { base64: prepared.buffer.toString('base64'), mimeType: prepared.mimeType }
      trace.imagePrep = {
        status: 'ok',
        ms: Date.now() - prepStartedAt,
        steps: prepared.steps,
        width: prepared.width,
        height: prepared.height,
        bytesBefore: prepared.bytesBefore,
        bytesAfter: prepared.bytesAfter,
        note: null,
      }
    } catch (error) {
      trace.imagePrep = { ...trace.imagePrep, status: 'failed', ms: Date.now() - prepStartedAt, note: error instanceof Error ? error.message : String(error) }
    }
  }

  let ocrText: string
  let ocrProvider: 'google_vision' | 'azure_document_intelligence' | null = null
  try {
    const extractor = storedMimeType === 'application/pdf' ? googleVisionPdfTextExtractor : deps.textExtractor
    try {
      const ocrResult = await extractor.extractText(ocrInput)
      ocrText = ocrResult.fullText
      ocrProvider = 'google_vision'
    } catch (primaryError) {
      // Google remains primary. Azure runs only after a real OCR failure and only when configured.
      if (!isAzureReceiptFallbackConfigured()) throw primaryError

      try {
        const fallbackTextExtractor = deps.fallbackTextExtractor ?? azureReceiptTextExtractor
        // The fallback gets the untouched original, not the cleaned-up copy: it is a second,
        // independent attempt, so it should not share a failure caused by the preparation itself.
        const azureResult = await fallbackTextExtractor.extractText({ base64: original.toString('base64'), mimeType: storedMimeType })
        ocrText = azureResult.fullText
        ocrProvider = 'azure_document_intelligence'
      } catch (azureError) {
        throw new Error(
          `Primary OCR failed: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}; Azure fallback failed: ${azureError instanceof Error ? azureError.message : String(azureError)}`,
        )
      }
    }
  } catch (error) {
    trace.ocr = { status: 'failed', provider: null, ms: Date.now() - ocrStartedAt }
    return update({ status: 'ocr_failed', errorMessage: `Nepodařilo se přečíst účtenku. Zkuste nahrát ostřejší fotografii. (${error instanceof Error ? error.message : String(error)})` })
  }
  trace.ocr = { status: 'ok', provider: ocrProvider, ms: Date.now() - ocrStartedAt }

  await update({ status: 'ocr_completed', ocrProvider, rawOcrText: ocrText })
  await update({ status: 'parsing' })

  const parseStartedAt = Date.now()
  let extracted: ExtractedReceipt
  try {
    const normalized = normalizeOcrText(ocrText)
    extracted = await deps.structuringProvider.structure(normalized, {
      onUsage: (usage) => {
        trace.parser.inputTokens = usage.inputTokens ?? null
        trace.parser.outputTokens = usage.outputTokens ?? null
      },
    })
    trace.parser.status = 'ok'
    trace.parser.ms = Date.now() - parseStartedAt
  } catch (error) {
    trace.parser.status = 'failed'
    trace.parser.ms = Date.now() - parseStartedAt
    return update({ status: 'parsing_failed', errorMessage: `Nepodařilo se rozpoznat položky na účtence. (${error instanceof Error ? error.message : String(error)})` })
  }

  // Fetched once and reused below both to pre-fill each item's category/location for the review
  // form (via toReceiptLineItems) and to decide whether an item's placement is actually resolvable
  // (via resolveItemPlacement) — see that function's doc comment for the catalog-first priority.
  const catalog = await getProductCatalog()

  const parsedRow = await update({
    status: 'parsed',
    parserResult: JSON.stringify(extracted),
    date: extracted.date,
    receiptTime: extracted.time,
    receiptNumber: extracted.receiptNumber,
    currency: extracted.currency ?? 'CZK',
    subtotal: extracted.subtotal?.toString(),
    discountTotal: extracted.discountTotal?.toString(),
    total: extracted.total?.toString(),
    confidence: extracted.confidence?.toString(),
    items: JSON.stringify(toReceiptLineItems(extracted, catalog)),
  })

  // Resolve the retailer and physical branch immediately after parsing. This keeps the
  // receipt_imports row authoritative even when later validation sends the receipt to review.
  // The same IDs are then reused by the purchase and price-observation writes below.
  const parsedStoreId = await findOrCreateStore(extracted.store.name)
  const parsedStoreLocationId = await findOrCreateStoreLocation(
    parsedStoreId,
    extracted.store.address,
    extracted.store.city,
  )
  const enrichedParsedRow = await update({
    storeId: parsedStoreId,
    storeLocationId: parsedStoreLocationId ?? undefined,
  })

  await update({ status: 'validating' })

  if (needsReview(extracted)) {
    trace.validation = 'review_required'
    return update({ status: 'review_required' })
  }

  // Storage-location/category gate: even a mathematically-consistent, complete receipt must go to
  // review if any item's category+pantry-location can't be resolved confidently — never guess
  // where a product lives (docs/08_OCR_RECEIPT_PIPELINE.md's "NEHÁDEJ" rule, extended per the
  // product owner's pantry-tracking request).
  const unplaceable = extracted.items.some(
    (item) => item.name.trim().length > 0 && resolveItemPlacement(matchProductByName(catalog, item.name), item.category, item.name) == null,
  )
  if (unplaceable) {
    trace.validation = 'review_required'
    return update({ status: 'review_required' })
  }

  // Duplicate check: same household, same date, matched by receipt number or by store+total.
  const extractedDate = extracted.date
  const extractedTotal = extracted.total
  if (extractedDate && extractedTotal != null) {
    const candidates = await db.query.receiptImports.findMany({
      where: and(eq(schema.receiptImports.householdId, row.householdId), gte(schema.receiptImports.date, extractedDate)),
    })
    const duplicate = candidates.find(
      (candidate) =>
        candidate.id !== receiptImportId &&
        candidate.purchaseId != null &&
        candidate.date != null &&
        candidate.total != null &&
        isPotentialDuplicate(
          { storeLocationId: candidate.storeLocationId, date: candidate.date, total: Number(candidate.total), receiptNumber: candidate.receiptNumber },
          { storeLocationId: enrichedParsedRow.storeLocationId, date: extractedDate, total: extractedTotal, receiptNumber: extracted.receiptNumber },
        ),
    )
    if (duplicate) {
      trace.validation = 'duplicate_review'
      return update({ status: 'duplicate_review' })
    }
  }
  trace.validation = 'passed'

  const lineItems = toReceiptLineItems(extracted, catalog)
  const storeId = enrichedParsedRow.storeId ?? parsedStoreId
  const resolvedStoreLocationId = enrichedParsedRow.storeLocationId ?? parsedStoreLocationId
  const purchase = await createPurchaseFromReceiptItems(row.householdId, lineItems, {
    date: extracted.date ?? undefined,
    storeLocationId: resolvedStoreLocationId,
    storeId,
    currency: extracted.currency,
    receiptDiscountTotal: extracted.discountTotal,
    source: 'auto',
  })
  return update({ status: 'completed', purchaseId: purchase.id, processedAt: new Date() })
}

/** Upload step (docs/08_OCR_RECEIPT_PIPELINE.md section 2): validates the image, stores it in
 *  Vercel Blob (private — a household's receipts are personal financial data) and creates the
 *  `receipt_imports` row in `uploaded`. Processing is a separate call
 *  (`processUploadedReceiptAction`) so the client knows the import id while the pipeline runs and
 *  can show its real progress via `/api/receipts/[id]/status` (section 20). The pipeline still runs
 *  synchronously inside that one request — at the target volume (~1,500/month per section 18) a
 *  background job queue would be over-engineering for a few-second round trip. */
export async function uploadReceiptAction(base64Image: string, _declaredMimeType?: string): Promise<ReceiptImportState> {
  const householdId = await requireHouseholdId()

  const buffer = Buffer.from(base64Image, 'base64')
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Fotografie je příliš velká (max. 10 MB).')
  if (buffer.byteLength === 0) throw new Error('Nahraný soubor je prázdný.')

  // The type is decided from the file's own bytes; the client-declared MIME type
  // (`_declaredMimeType`, kept only so existing callers still compile) is ignored because it is
  // attacker-controlled and phones sometimes mislabel files. The stored extension and content type
  // come from the detection.
  const fileType = detectReceiptFileType(buffer)
  if (fileType.kind === 'heic') throw new Error(HEIC_UNSUPPORTED_MESSAGE)
  if (fileType.kind !== 'supported') throw new Error('Nepodporovaný formát. Použijte JPEG, PNG, WEBP nebo PDF.')

  const blob = await put(`receipts/${householdId}/${crypto.randomUUID()}.${fileType.extension}`, buffer, {
    access: 'private',
    contentType: fileType.mimeType,
  })

  const db = getDb()
  const [row] = await db
    .insert(schema.receiptImports)
    .values({ householdId, status: 'uploaded', source: 'ocr', imageUrl: blob.url })
    .returning()

  revalidatePath('/')
  return toReceiptImportState(row)
}

const IN_FLIGHT_STATUSES: (typeof schema.receiptStatusEnum.enumValues)[number][] = ['ocr_processing', 'ocr_completed', 'parsing', 'parsed', 'validating']

/** Atomically takes ownership of an import for processing. The single conditional UPDATE is what
 *  prevents two concurrent requests (a double-click, two household members, a retry racing the
 *  original run) from both running the pipeline and both creating a purchase — whichever UPDATE
 *  matches wins, the other gets no row. An import stuck mid-run (the function was killed) becomes
 *  claimable again once it has not changed for `RECEIPT_STALE_MS`. Clears the previous error so a
 *  successful retry does not keep showing the earlier failure. */
async function claimReceiptImport(
  householdId: string,
  receiptImportId: string,
  claimableStatuses: (typeof schema.receiptStatusEnum.enumValues)[number][],
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - RECEIPT_STALE_MS)
  const claimed = await getDb()
    .update(schema.receiptImports)
    .set({ status: 'ocr_processing', errorMessage: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.receiptImports.id, receiptImportId),
        eq(schema.receiptImports.householdId, householdId),
        or(
          inArray(schema.receiptImports.status, claimableStatuses),
          and(inArray(schema.receiptImports.status, IN_FLIGHT_STATUSES), lt(schema.receiptImports.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning({ id: schema.receiptImports.id })
  return claimed.length > 0
}

/** Runs the pipeline for a freshly uploaded import (called by the client right after
 *  `uploadReceiptAction`, which is what lets it poll the status route meanwhile). */
export async function processUploadedReceiptAction(receiptImportId: string): Promise<ReceiptImportState> {
  const householdId = await requireHouseholdId()
  await assertOwnsReceiptImport(householdId, receiptImportId)
  if (!(await claimReceiptImport(householdId, receiptImportId, ['uploaded']))) {
    throw new Error('Tento import se už zpracovává nebo je zpracovaný.')
  }
  const finalRow = await processReceiptImport(receiptImportId)
  revalidatePath('/')
  return toReceiptImportState(finalRow)
}

/** Retry (docs/08_OCR_RECEIPT_PIPELINE.md section 13): reprocesses the same stored image without
 *  requiring a new upload. Only meaningful from a failure state — retrying a completed or
 *  in-review import would silently redo work the household already has results for — or for an
 *  import that was uploaded but never started (the browser closed before processing began). */
export async function retryReceiptImportAction(receiptImportId: string): Promise<ReceiptImportState> {
  const householdId = await requireHouseholdId()
  await assertOwnsReceiptImport(householdId, receiptImportId)
  if (!(await claimReceiptImport(householdId, receiptImportId, ['ocr_failed', 'parsing_failed', 'uploaded']))) {
    throw new Error('Tento import nelze znovu spustit — není ve stavu chyby.')
  }
  const finalRow = await processReceiptImport(receiptImportId)
  revalidatePath('/')
  return toReceiptImportState(finalRow)
}

/** Manual review (docs/08_OCR_RECEIPT_PIPELINE.md section 14): the household corrects/confirms the
 *  extracted items for a `review_required` import, which then creates the real purchase exactly
 *  like a fully-automatic pass would. */
export async function confirmReceiptReviewAction(
  receiptImportId: string,
  items: ReceiptLineItem[],
  options: { date?: string; storeLocationId?: string } = {},
): Promise<{ purchase: PurchaseRecord }> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.status !== 'review_required' && row.status !== 'duplicate_review') {
    throw new Error('Tento import nečeká na kontrolu.')
  }

  // Never fall back to today's date (docs/08_OCR_RECEIPT_PIPELINE.md section 12 / CLAUDE.md
  // section 5 "never invent data") — if OCR couldn't read the date, the household must supply it
  // here explicitly. `resolveReceiptPurchaseDate()` (inside createPurchaseFromReceiptItems) is what
  // actually enforces this — `options.date` (explicitly supplied here) falls back to `row.date`
  // (the OCR-read date, for a review triggered by something other than a missing date, e.g. an
  // inconsistent total) and throws rather than defaulting to today if neither is present.
  const extractedReview = row.parserResult ? (JSON.parse(row.parserResult) as ExtractedReceipt) : null
  const storeId = row.storeId ?? (extractedReview ? await findOrCreateStore(extractedReview.store.name) : null)
  const resolvedStoreLocationId = options.storeLocationId ?? row.storeLocationId ??
    (extractedReview ? await findOrCreateStoreLocation(storeId, extractedReview.store.address, extractedReview.store.city) : null)
  const purchase = await createPurchaseFromReceiptItems(householdId, items, {
    date: options.date,
    storedDate: row.date,
    storeLocationId: resolvedStoreLocationId,
    storeId,
    currency: row.currency,
    receiptDiscountTotal: row.discountTotal != null ? Number(row.discountTotal) : null,
    source: 'confirmed',
  })

  const db = getDb()
  await db
    .update(schema.receiptImports)
    .set({ status: 'completed', items: JSON.stringify(items), storeLocationId: resolvedStoreLocationId, purchaseId: purchase.id, processedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.receiptImports.id, receiptImportId))

  revalidatePath('/')
  return { purchase }
}

/** Duplicate resolution (docs/08_OCR_RECEIPT_PIPELINE.md section 9): the household decides whether
 *  a `duplicate_review` import is genuinely a new purchase or the same one already recorded.
 *  'use_existing' and 'cancel' both discard this import without creating a second purchase;
 *  'save_new' proceeds exactly like confirming a review. */
export async function resolveDuplicateReceiptAction(
  receiptImportId: string,
  resolution: 'save_new' | 'use_existing' | 'cancel',
  items?: ReceiptLineItem[],
  options: { date?: string } = {},
): Promise<{ purchase: PurchaseRecord | null }> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.status !== 'duplicate_review') throw new Error('Tento import nečeká na vyřešení duplicity.')

  if (resolution !== 'save_new') {
    const db = getDb()
    await db.update(schema.receiptImports).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(schema.receiptImports.id, receiptImportId))
    revalidatePath('/')
    return { purchase: null }
  }

  const finalItems = items ?? (row.items ? (JSON.parse(row.items) as ReceiptLineItem[]) : [])
  const { purchase } = await confirmReceiptReviewAction(receiptImportId, finalItems, options)
  return { purchase }
}

/** Discards an import outright (docs/08_OCR_RECEIPT_PIPELINE.md's `CANCELLED` state) — e.g. the
 *  household decides the uploaded photo wasn't actually a usable receipt. Deletes the stored image
 *  too, since nothing will ever retry it. */
export async function cancelReceiptImportAction(receiptImportId: string): Promise<void> {
  const householdId = await requireHouseholdId()
  const row = await assertOwnsReceiptImport(householdId, receiptImportId)
  if (row.purchaseId) throw new Error('Tento import už vytvořil nákup — nelze zrušit.')

  const db = getDb()
  await db.update(schema.receiptImports).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(schema.receiptImports.id, receiptImportId))
  if (row.imageUrl) await del(row.imageUrl).catch(() => {}) // best-effort — a leftover blob is harmless, unlike losing the cancellation
  revalidatePath('/')
}