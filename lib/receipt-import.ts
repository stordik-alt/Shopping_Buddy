// Receipt import internals: the OCR pipeline and the helpers that turn receipt lines into a purchase.
// Deliberately NOT a 'use server' module: every export of such a module becomes an action the browser
// can call with any arguments. processReceiptImport used to live in app/actions/receipts.ts, where a
// direct call skipped claimReceiptImport and re-ran the pipeline on an already completed import,
// creating a second purchase. Only the actions in app/actions/receipts.ts call into this module, after
// they have authorized the household and claimed the import.

import { and, eq, gte, ilike, inArray } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import { invalidateProductPriceCache } from '@/lib/db/cache-invalidation'
import { getProductCatalogByIds, recordPriceObservation, restockPantryItem, upsertProductCatalogDefaults } from '@/lib/db/queries'
import { getProductCatalogCached, getSubcategoryCatalogCached } from '@/lib/db/cached-reads'
import { purchasedInventoryQuantities } from '@/lib/inventory-packaging'
import * as schema from '@/lib/db/schema'
import { applyLearnedExpenseDefaults, recomputePurchaseExpenses } from '@/lib/db/purchase-items'
import { classifySubcategoryByKeyword, isValidProductSubcategory } from '@/lib/product-subcategories'
import { categoryWithBrand } from '@/lib/product-brands'
import { getAliasesForNames, recordProductAlias } from '@/lib/db/product-aliases'
import type { ProductAliasEntry } from '@/lib/categorization'
import { suggestProductsForReceiptLines } from '@/lib/db/receipt-candidates'
import type { ReceiptSuggestions } from '@/lib/receipt-product-match'
import { autoCheckShoppingListFromPurchase } from '@/lib/db/receipt-list'
import { inferPantryLocation } from '@/lib/pantry'
import { normalizeProductText } from '@/lib/product-normalize'
import { logReceiptImport, newReceiptTrace, type ReceiptTrace } from '@/lib/receipt-log'
import { PDF_TEXT_LAYER_PROVIDER, readPdfTextLayer } from '@/lib/receipt-pdf'
import { detectReceiptFileType, prepareReceiptImageForOcr } from '@/lib/receipt-image'
import type { ProductCatalogEntry } from '@/lib/products'
import { chainFamily } from '@/lib/stores/chain-family'
import {
  azureReceiptTextExtractor,
  geminiStructuringProvider,
  googleVisionPdfTextExtractor,
  googleVisionTextExtractor,
  isAzureReceiptFallbackConfigured,
  isRoundingLine,
  isPotentialDuplicate,
  needsReview,
  netUnitPrice,
  normalizeOcrText,
  resolvePurchaseAmounts,
  resolveCatalogProduct,
  resolveItemPlacement,
  normalizeStoreName,
  storeNameMatchKey,
  toReceiptLineItems,
  type ExtractedReceipt,
  type ReceiptLineItem,
  type ReceiptStructuringProvider,
  type ReceiptTextExtractor,
} from '@/lib/receipts'
import { HEIC_UNSUPPORTED_MESSAGE } from '@/lib/receipt-upload'
import { getReceiptFile } from '@/lib/storage'
import type { ItemCategory, PurchaseRecord } from '@/lib/types'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const ITEM_CATEGORIES = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní'] as const


/** Fallback for a stored file whose bytes are not recognisable (see detectReceiptFileType) — the
 *  upload action now rejects those, so this only matters for imports created earlier. */
function mimeTypeFromExtension(url: string): 'application/pdf' | 'image/png' | 'image/webp' | 'image/jpeg' {
  const lower = url.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

export async function assertOwnsReceiptImport(householdId: string, receiptImportId: string) {
  const db = getDb()
  const row = await db.query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, receiptImportId) })
  if (!row || row.householdId !== householdId) throw new Error('Receipt import not found')
  return row
}

/** The one place a `ReceiptLineItem[]` actually becomes a real purchase — shared by manual entry
 *  (`importReceiptAction`), a fully-automatic OCR pass, and a human-reviewed/corrected OCR result,
 *  so the purchase-creation/pantry-restocking rule lives in exactly one place per CLAUDE.md
 *  section 6. Does not touch `receipt_imports` — callers own that record's lifecycle. */
export async function findOrCreateStore(storeName: string | null | undefined): Promise<string | null> {
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

export function resolveReceiptPurchaseDate(optionsDate: string | undefined, storedDate: string | null): string {
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


/** The catalog a receipt's lines are matched against: the products named like its lines, plus the
 *  products its candidate aliases (and `extraIds`, the products a household picked in review) point
 *  to. An alias names a product by other text, so looking products up by the lines' names alone never
 *  loads it — and without its entry, an alias match had nothing to resolve to and was dropped. */
async function receiptMatchingCatalog(names: string[], aliases: ProductAliasEntry[], extraIds: string[] = []): Promise<ProductCatalogEntry[]> {
  const catalog = await getProductCatalogCached(names)
  const known = new Set(catalog.map((product) => product.id))
  const missing = [...aliases.map((alias) => alias.productId), ...extraIds].filter((id) => !known.has(id))
  return missing.length > 0 ? [...catalog, ...(await getProductCatalogByIds(missing))] : catalog
}

/** Adds the review form's product suggestions (lib/receipt-product-match.ts) to the lines that no
 *  catalog name or alias recognized, pre-selecting one only where it is clearly the one. A shopping
 *  bag or deposit is not a product to link. Suggestions are a convenience on top of a review that
 *  works without them, so a failed lookup is logged and the lines are returned as they were. */
export async function withProductSuggestions(
  items: ReceiptLineItem[],
  catalog: ProductCatalogEntry[],
  aliases: ProductAliasEntry[],
  storeId: string | null,
): Promise<ReceiptLineItem[]> {
  const open = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.nonInventory && resolveCatalogProduct(item.name, catalog, aliases, storeId).entry == null)
  if (open.length === 0) return items
  let found: ReceiptSuggestions[]
  try {
    found = await suggestProductsForReceiptLines(open.map(({ item }) => item.name), storeId)
  } catch (error) {
    console.error('Could not look up product suggestions for receipt review', error)
    return items
  }
  const result = [...items]
  open.forEach(({ item, index }, position) => {
    const { suggestions, confident } = found[position]
    if (suggestions.length === 0) return
    result[index] = { ...item, productSuggestions: suggestions, ...(confident && { productId: suggestions[0].productId }) }
  })
  return result
}

/** Resolves an OCR address to an existing branch, or creates the branch when OCR has enough
 *  physical-location data. Missing coordinates/opening hours stay NULL until a trusted store
 *  directory source enriches the branch; receipt OCR must never invent geographic data.
 *  The receipt names the retailer, so the branch is looked for in every chain of that retailer: an
 *  Albert hypermarket's receipt reads "Albert", but the branch was moved to "Albert Hypermarket"
 *  (lib/stores/chain-family.ts). The returned `storeId` is the chain of the branch found, so the
 *  purchase and its prices are attributed where the branch really is. */
export async function findOrCreateStoreLocation(
  storeId: string | null,
  address?: string | null,
  city?: string | null,
): Promise<{ storeId: string | null; storeLocationId: string | null }> {
  const none = { storeId, storeLocationId: null }
  if (!storeId) return none
  const wantedAddress = normalizeStoreLocationPart(address)
  const wantedCity = normalizeStoreLocationPart(city)
  if (!wantedAddress) return none

  const db = getDb()
  const stores = await db.query.stores.findMany()
  const store = stores.find((candidate) => candidate.id === storeId)
  if (!store) return none
  const familyStoreIds = stores.filter((candidate) => chainFamily(candidate.chain) === chainFamily(store.chain)).map((candidate) => candidate.id)
  const findExact = async () => {
    const locations = await db.query.storeLocations.findMany({ where: inArray(schema.storeLocations.storeId, familyStoreIds) })
    return locations.find((location) =>
      normalizeStoreLocationPart(location.address) === wantedAddress &&
      normalizeStoreLocationPart(location.city) === wantedCity,
    )
  }
  const exact = await findExact()
  if (exact) return { storeId: exact.storeId, storeLocationId: exact.id }

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
    return { storeId, storeLocationId: created.id }
  } catch (error) {
    // The unique normalized chain/address/city index makes concurrent OCR imports converge on
    // the same branch instead of creating duplicates. Re-read after a uniqueness race.
    const match = await findExact()
    if (match) return { storeId: match.storeId, storeLocationId: match.id }
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
      // A line whose unit price the receipt never stated (only its total) is no price observation.
      .filter((item) => item.productId && item.quantity > 0 && item.price >= 0 && !item.unitPriceUnknown)
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

export async function createPurchaseFromReceiptItems(
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
    /** The receipt's stated grand total — the amount actually paid — when known. */
    receiptStatedTotal?: number | null
    source: 'confirmed' | 'auto'
  },
): Promise<PurchaseRecord> {
  // Removed lines (spec section 13: "remove item before the import is finalized") never become part
  // of the purchase at all — not the expense, not inventory. This is different from `nonInventory`
  // below, which still counts as an expense; a *removed* line was rejected by the household outright.
  const activeItems = items.filter((item) => !item.removed)
  if (activeItems.length === 0) throw new Error('Receipt has no items')
  // Classification is part of the import contract too: every client-supplied category/subcategory
  // must belong to the fixed product taxonomy before it can reach purchase_items or the shared catalog.
  for (const item of activeItems) {
    if (!(ITEM_CATEGORIES as readonly string[]).includes(item.category)) {
      throw new Error('Neplatná kategorie u položky „' + item.name + '“.')
    }
    if (item.subcategory != null && !isValidProductSubcategory(item.category, item.subcategory)) {
      throw new Error('Neplatná podkategorie u položky „' + item.name + '“.')
    }
  }
  // Reject impossible discounts explicitly (a reviewer can type anything) instead of storing a
  // negative price or silently clamping it.
  for (const item of activeItems) {
    const discount = item.discount ?? 0
    if (discount < 0) throw new Error(`Sleva u položky „${item.name}“ nemůže být záporná.`)
    if (discount > item.price * item.quantity + 0.005) throw new Error(`Sleva u položky „${item.name}“ je vyšší než její cena.`)
  }
  const db = getDb()
  const date = resolveReceiptPurchaseDate(options.date, options.storedDate ?? null)

  const candidateAliases = await getAliasesForNames(activeItems.map((item) => normalizeProductText(item.name)))
  // The products a household picked in review are authoritative for their lines — but only ids of
  // products that exist: the id comes from the browser.
  const chosenProductIds = activeItems.flatMap((item) => (item.productId ? [item.productId] : []))
  // Only the candidates for these item names (and their aliases and picks), not the whole catalog.
  const catalog = await receiptMatchingCatalog(activeItems.map((item) => item.name), candidateAliases, chosenProductIds)
  if (chosenProductIds.some((id) => !catalog.some((product) => product.id === id))) {
    throw new Error('Vybraný produkt už v katalogu není. Vyberte u položky jiný, nebo žádný.')
  }
  const subcategories = await getSubcategoryCatalogCached()
  const subcategoryId = (category: ItemCategory, name: string | null | undefined) =>
    name ? subcategories.find((row) => row.category === category && row.name === name)?.id ?? null : null
  const resolvedItems = activeItems.map((item) => {
    // The household's own pick first; else the line's name — exactly, or by the alias/fuzzy tiers
    // when confident enough to auto-accept (spec sections 7–9).
    const chosenEntry = item.productId ? catalog.find((product) => product.id === item.productId) ?? null : null
    const catalogEntry = chosenEntry ?? resolveCatalogProduct(item.name, catalog, candidateAliases, options.storeId ?? null).entry
    if (options.source === 'auto') {
      // processReceiptImport() already verified every item resolves before calling this, so
      // `placement` is never null here — but fall back to the item's own values rather than a
      // non-null assertion, in case a future caller passes source: 'auto' without that guarantee.
      const placement = resolveItemPlacement(catalogEntry, item.category, item.name)
      const category = placement?.category ?? item.category
      return {
        ...item,
        productId: catalogEntry?.id ?? null,
        category,
        location: placement?.location ?? item.location,
        subcategory: catalogEntry?.subcategory ?? item.subcategory,
        nonInventory: catalogEntry?.isNonInventory ?? item.nonInventory ?? false,
        pickedInReview: chosenEntry != null,
      }
    }
    // 'confirmed': a known catalog product's category is still authoritative (consistent with
    // every other entry path in the app — e.g. addShoppingItemAction) even over what was typed
    // this time, since the catalog itself is how a correction gets remembered in the first place
    // (see upsertProductCatalogDefaults below) — for a *new* product, there's no catalog entry to
    // override, so the typed category always applies. Location, which manual entry has no field
    // for at all, still prefers an explicit value (from a review form) before falling back.
    // An explicit category/subcategory change made by the household is authoritative for this purchase.
    const manuallyClassified = item.classificationSource === 'manual'
    // An untouched line of a product the catalog does not know yet: its brand's category beats the
    // form's starting value (lib/product-brands.ts), and the keyword rules give the subcategory the
    // form left empty.
    const uncatalogedCategory = categoryWithBrand(item.name, item.category) ?? item.category
    const category = manuallyClassified ? item.category : (catalogEntry?.category ?? uncatalogedCategory)
    const ownSubcategory = category === item.category ? item.subcategory : undefined
    const subcategory = manuallyClassified
      ? (item.subcategory ?? null)
      : (catalogEntry ? (catalogEntry.subcategory ?? ownSubcategory ?? null) : (ownSubcategory ?? classifySubcategoryByKeyword(category, normalizeProductText(item.name))))
    const location = item.location ?? catalogEntry?.defaultLocation ?? inferPantryLocation(category, item.name) ?? 'Spíž'
    return {
      ...item,
      productId: catalogEntry?.id ?? null,
      category,
      location,
      subcategory: subcategory ?? undefined,
      nonInventory: catalogEntry?.isNonInventory ?? item.nonInventory ?? false,
      pickedInReview: chosenEntry != null,
    }
  })

  // `purchases.total` is what was actually paid: the receipt's own stated total when it agrees with
  // the lines, otherwise line totals net of their own discounts minus any receipt-wide discount no
  // line carries (see resolvePurchaseAmounts). `purchases.discount` records how much was saved, so the
  // history can show "sleva X Kč" without the total being overstated for spending analytics.
  const { discount, total } = resolvePurchaseAmounts(resolvedItems, options.receiptDiscountTotal ?? null, options.receiptStatedTotal ?? null)
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
        // Kept so the expense split can be recomputed later (a household reassignment,
        // lib/db/purchase-items.ts) without re-guessing what category this line was.
        category: item.category,
        subcategoryId: subcategoryId(item.category, item.subcategory),
      })),
    )
    .returning()

  // A product the household has reassigned before (e.g. always a gift, never groceries) starts
  // pre-assigned to it here — the app "learning" the household's own correction (owner request,
  // 2026-09-27) — before the automatic split below, which honours whichever items got one.
  const expenseSplitsByItemId = await applyLearnedExpenseDefaults(db, householdId, itemRows)

  // What the receipt says was paid counts as the household's expenses, split by the items' categories
  // (lib/purchase-expenses.ts; only receipts do this — never a shopping list's estimated prices). The
  // unique (purchase, category, subcategory) index keeps a retry from counting it twice.
  const note = options.storeName?.trim() ? `Nákup ${normalizeStoreName(options.storeName)}` : 'Nákup z účtenky'
  await recomputePurchaseExpenses(db, purchaseRow.id, { notifyBudget: true, noteForNewPurchase: note })

  // A non-inventory line (shopping bag, bottle deposit) is still a real expense — recorded above
  // like any other line — but must never become a pantry row (spec sections 14/15). Skipped here
  // only, so nothing else about the line's accounting changes.
  const inventoryItems = resolvedItems.filter((item) => !item.nonInventory)
  const inventoryQuantities = await purchasedInventoryQuantities(inventoryItems.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  })))
  for (const [index, item] of inventoryItems.entries()) {
    const inventory = inventoryQuantities[index]
    await restockPantryItem(householdId, {
      productId: item.productId,
      name: item.name,
      category: item.category,
      quantity: inventory.quantity,
      unit: inventory.unit,
      location: item.location,
      subcategoryId: subcategoryId(item.category, item.subcategory),
    })
  }

  await recordReceiptPriceObservations(resolvedItems, storeId, options.storeLocationId, date, options.currency)
  // Receipt observations can change the price history used by the global product-price cache.
  invalidateProductPriceCache()

  // Tick off the shopping-list items this receipt certainly covers (same product/name), recording the
  // real quantity and price. Best-effort by design: the purchase above is already saved and is the
  // source of truth, so a failure here must not fail — or make the client retry — the import; it is
  // logged so it is not silently lost, and the household can still tick the item by hand.
  try {
    await autoCheckShoppingListFromPurchase(householdId, purchaseRow.id)
  } catch (error) {
    console.error('Could not tick the shopping list from receipt purchase', purchaseRow.id, error)
  }

  if (options.source === 'confirmed') {
    // A line the household linked to a catalog product in review is that product: no catalog entry
    // is created or changed under the receipt's printed text ("KUR.PRSA"), which would only be a
    // duplicate of it. What the household corrected stays on the purchase line itself.
    for (const item of resolvedItems.filter((item) => !item.pickedInReview)) {
      // Always concrete for 'confirmed' items (resolved above) — the `?? 'Spíž'` here only
      // satisfies the type checker, which can't see that per-branch guarantee across the shared
      // `resolvedItems` array type.
      await upsertProductCatalogDefaults({
        name: item.name,
        category: item.category,
        unit: item.unit,
        location: item.location ?? 'Spíž',
        subcategory: item.subcategory,
        isNonInventory: item.nonInventory,
      })
    }
    // A brand-new product has no catalog id yet at the time purchase_items was inserted above (it is
    // matched against the catalog *before* this loop creates it) — link it now, so a later
    // expense-category reassignment of this very item can be remembered for the product
    // (lib/db/purchase-items.ts) instead of only ever applying to this one purchase.
    const productIdByItemId = new Map<string, string>()
    for (const row of itemRows.filter((row) => row.productId == null)) {
      const product = await db.query.products.findFirst({ where: ilike(schema.products.name, row.name.trim()), columns: { id: true } })
      if (product) {
        await db.update(schema.purchaseItems).set({ productId: product.id }).where(eq(schema.purchaseItems.id, row.id))
        productIdByItemId.set(row.id, product.id)
      }
    }
    // Spec section 12: "user corrections must teach the system". A review-corrected line — the
    // household edited the OCR-extracted `name` into something else before confirming — is treated
    // as the household approving that correction, so the original text is remembered as an alias of
    // whichever product the corrected name resolved to (store-specific when the receipt's store is
    // known, since the same abbreviation can mean different things at different retailers — spec
    // section 6). Best-effort: an alias failing to save must not fail the whole import.
    // The same goes for a product picked in review: the receipt's text becomes that product's alias at
    // this store, so the next receipt printing it is recognized without review.
    for (const [index, item] of resolvedItems.entries()) {
      if (!item.rawName) continue
      if (!item.pickedInReview && normalizeProductText(item.rawName) === normalizeProductText(item.name)) continue
      const productId = item.productId ?? productIdByItemId.get(itemRows[index]?.id ?? '')
      if (!productId) continue
      try {
        await recordProductAlias({ productId, storeId: storeId ?? null, alias: item.rawName, source: 'user_correction' })
      } catch (error) {
        console.error('Could not record learned product alias', item.rawName, error)
      }
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
    items: itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      price: Number(row.price),
      category: row.category,
      expenseSplits: expenseSplitsByItemId.get(row.id) ?? [],
    })),
  }
}

// --- OCR pipeline (docs/08_OCR_RECEIPT_PIPELINE.md) ---------------------------------------------

/** Runs the OCR pipeline's automated stages (docs/08_OCR_RECEIPT_PIPELINE.md sections 3–9) against
 *  an already-uploaded receipt image, updating the same `receipt_imports` row throughout rather
 *  than creating a new one per stage. The extractors and `structuringProvider` are injectable so the
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
    azureTextExtractor?: ReceiptTextExtractor
  } = {
    textExtractor: googleVisionTextExtractor,
    structuringProvider: geminiStructuringProvider,
    azureTextExtractor: azureReceiptTextExtractor,
  },
): Promise<typeof schema.receiptImports.$inferSelect> {
  // One structured log line per run (docs/08_OCR_RECEIPT_PIPELINE.md section 19), written even when
  // the pipeline throws — the trace is filled in by runReceiptPipeline as each stage completes.
  // Defence in depth: the calling actions have already checked ownership and claimed the import, but
  // the pipeline itself still refuses to run on another household's import.
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
    azureTextExtractor?: ReceiptTextExtractor
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
    const file = await getReceiptFile(row.imageUrl)
    if (!file) throw new Error('Photo not found in storage')
    original = Buffer.from(await new Response(file.body).arrayBuffer())
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
  let ocrProvider: typeof PDF_TEXT_LAYER_PROVIDER | 'google_vision' | 'azure_document_intelligence' | null = null
  // Why the text layer was not used (none / unusable) — for the log only.
  let ocrNote: string | null = null

  // A digital PDF (a shop's e-receipt, a browser print) carries its own text, exactly as written —
  // strictly better than OCR of the same page, which on a real Albert receipt dropped two weighed
  // lines, and free. OCR runs only when there is no usable text layer (lib/receipt-pdf.ts).
  let textLayer: string | null = null
  if (storedMimeType === 'application/pdf') {
    const layer = await readPdfTextLayer(ocrInput.base64)
    if (layer.text != null) textLayer = layer.text
    else ocrNote = layer.reason
  }

  if (textLayer != null) {
    ocrText = textLayer
    ocrProvider = PDF_TEXT_LAYER_PROVIDER
  } else {
    try {
      // Azure Document Intelligence reads every photo and scanned PDF whenever it is configured.
      // Google Vision is skipped then (owner's decision, 2026-10-05): it fails in production for every
      // request (the GCP project has no billing), so trying it first only made each import wait for a
      // refusal. Without Azure (local development, tests) Google Vision is used as before.
      if (isAzureReceiptFallbackConfigured()) {
        // The cleaned-up copy when preparation succeeded, the original when it did not (or for a PDF).
        const azureResult = await (deps.azureTextExtractor ?? azureReceiptTextExtractor).extractText(ocrInput)
        ocrText = azureResult.fullText
        ocrProvider = 'azure_document_intelligence'
      } else {
        const extractor = storedMimeType === 'application/pdf' ? googleVisionPdfTextExtractor : deps.textExtractor
        ocrText = (await extractor.extractText(ocrInput)).fullText
        ocrProvider = 'google_vision'
      }
    } catch (error) {
      trace.ocr = { status: 'failed', provider: null, ms: Date.now() - ocrStartedAt, note: ocrNote }
      return update({ status: 'ocr_failed', errorMessage: `Nepodařilo se přečíst účtenku. Zkuste nahrát ostřejší fotografii. (${error instanceof Error ? error.message : String(error)})` })
    }
  }
  trace.ocr = { status: 'ok', provider: ocrProvider, ms: Date.now() - ocrStartedAt, note: ocrNote }

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
  // Only the candidates for the receipt's item names, not the whole catalog.
  // Every alias of the lines' texts, global and per store; which apply is decided per store when
  // matching (lib/categorization.ts), so this one read serves the preview and the final pass.
  const aliases = await getAliasesForNames(extracted.items.map((item) => normalizeProductText(item.name)))
  const catalog = await receiptMatchingCatalog(extracted.items.map((item) => item.name), aliases)

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
    // Store not resolved yet at this point (findOrCreateStoreLocation runs below) — only global
    // aliases apply to this first preview.
    items: JSON.stringify(toReceiptLineItems(extracted, catalog, aliases, null)),
  })

  // Resolve the retailer and physical branch immediately after parsing. This keeps the
  // receipt_imports row authoritative even when later validation sends the receipt to review.
  // The same IDs are then reused by the purchase and price-observation writes below.
  const parsedBranch = await findOrCreateStoreLocation(
    await findOrCreateStore(extracted.store.name),
    extracted.store.address,
    extracted.store.city,
  )
  const parsedStoreId = parsedBranch.storeId
  const parsedStoreLocationId = parsedBranch.storeLocationId
  const enrichedParsedRow = await update({
    storeId: parsedStoreId,
    storeLocationId: parsedStoreLocationId ?? undefined,
  })

  await update({ status: 'validating' })

  const storeId = enrichedParsedRow.storeId ?? parsedStoreId ?? null
  // A receipt sent to review gets its lines again, now with the store's own aliases and with
  // product suggestions for the lines nothing recognized.
  const toReview = async () => {
    trace.validation = 'review_required'
    const items = await withProductSuggestions(toReceiptLineItems(extracted, catalog, aliases, storeId), catalog, aliases, storeId)
    return update({ status: 'review_required', items: JSON.stringify(items) })
  }

  if (needsReview(extracted)) return toReview()

  // Storage-location/category gate: even a mathematically-consistent, complete receipt must go to
  // review if any item's category+pantry-location can't be resolved confidently — never guess
  // where a product lives (docs/08_OCR_RECEIPT_PIPELINE.md's "NEHÁDEJ" rule, extended per the
  // product owner's pantry-tracking request).
  // A cash-rounding line is not a product and is never stored (toReceiptLineItems drops it), so it
  // has no storage location to resolve and must not stop the receipt.
  // A line recognized by a learned alias is placed by its product, like one recognized by name.
  const unplaceable = extracted.items.some(
    (item) =>
      item.name.trim().length > 0 &&
      !isRoundingLine(item.name) &&
      resolveItemPlacement(resolveCatalogProduct(item.name, catalog, aliases, storeId).entry, item.category, item.name) == null,
  )
  if (unplaceable) return toReview()

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

  const lineItems = toReceiptLineItems(extracted, catalog, aliases, storeId)
  const resolvedStoreLocationId = enrichedParsedRow.storeLocationId ?? parsedStoreLocationId
  const purchase = await createPurchaseFromReceiptItems(row.householdId, lineItems, {
    date: extracted.date ?? undefined,
    storeLocationId: resolvedStoreLocationId,
    storeId,
    currency: extracted.currency,
    receiptDiscountTotal: extracted.discountTotal,
    receiptStatedTotal: extracted.total,
    source: 'auto',
  })
  return update({ status: 'completed', purchaseId: purchase.id, processedAt: new Date() })
}
