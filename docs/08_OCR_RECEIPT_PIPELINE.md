# Shopping Buddy — OCR Receipt Import Pipeline

**Status: implemented, 2026-09-22 — owner-approved exception to `CLAUDE.md` section 30.** The
owner's own words when asked to confirm: *"OCR chci mít vyřešené, na konec necháme AI asistenta.
Toto AI je pouze pro import účtenek"* (I want OCR resolved; the AI assistant stays for last; this
AI is only for receipt import). This document originally captured the target design as
planning-only, before that approval — see `CLAUDE.md` section 30 and `docs/01_CURRENT_STATE.md`
section 33 for the full story of what changed and why. The design below is what actually got
built: `lib/receipts.ts` (`googleVisionTextExtractor`, `geminiStructuringProvider`), `app/actions/
receipts.ts` (`uploadReceiptAction` and the rest of the state-machine actions), and
`components/budget/receipt-pending.tsx` (the review/duplicate/failure UI). Manual entry
(`importReceiptAction`, `components/budget/receipt-import.tsx`'s form) remains available
alongside it — a photo upload that fails still falls back to it.

Target capacity: ~1,500 receipts/month. Primary database: Neon PostgreSQL. OCR: Google Cloud
Vision. Structuring the OCR text into data: a cheap AI model, preferably Gemini Flash-Lite.
The application must never persist unverified or obviously-incorrect data as a valid receipt.

---

## 1. Architecture

```text
User uploads a receipt image or PDF
      ↓
Image validation
      ↓
Google Cloud Vision OCR
      ↓ (on OCR failure, when Azure fallback is configured)
Azure Document Intelligence Receipt
      ↓
OCR text normalization
      ↓
AI parser (structuring)
      ↓
Structured JSON
      ↓
Validation and calculations
      ↓
Consistency checks
      ↓
Neon PostgreSQL
      ↓
Result shown to the user
```

Do not use Google Document AI's Expense Parser as the default solution.

---

## 2. Receipt upload

After upload:

1. Verify the file type (JPEG, PNG, WebP, HEIC or PDF).
2. Verify the maximum size (10 MB).
3. Optimize an image if needed; PDFs are sent directly to Vision.
4. Keep the original image — `uploadReceiptAction` stores it in Vercel Blob (`access: 'private'`,
   under `receipts/<householdId>/<uuid>.<ext>`), decided and implemented 2026-09-22.
5. Create a unique import ID.
6. Set status: `UPLOADED`.

Then start OCR.

---

## 3. OCR — Google Cloud Vision

Use Google Cloud Vision for OCR. Preferred mode: `DOCUMENT_TEXT_DETECTION`.

For images, the existing `images:annotate` API-key path is used. For PDFs, the application uses the online `files:annotate` endpoint with Google OAuth and processes up to 5 selected pages per request. Google does not support API keys for `files:annotate`. The application uses Vercel OIDC + Google Workload Identity Federation, so no service-account JSON key is stored in Vercel. The runtime obtains the short-lived Vercel token through `@vercel/oidc`'s `getVercelOidcToken()` helper. This avoids a second storage system because the PDF can be sent directly from the uploaded file bytes.

OCR must return:
- the full receipt text
- individual lines
- bounding boxes/text positions, if available

On success: `OCR_COMPLETED`. If Google Vision fails and Azure fallback is configured, the same OCR request is retried with Azure Document Intelligence `prebuilt-receipt`. If both providers fail: `OCR_FAILED`. The error includes both provider failures and is stored so the import can be retried without re-uploading the receipt.

---

## 4. OCR text normalization

Before handing text to the AI parser:

- strip redundant whitespace
- normalize line endings
- preserve line order
- fix common OCR artifacts only where the fix is unambiguous
- keep the original OCR text available

Must not aggressively "correct" product names. Example: `MLÉK0` → potentially `MLÉKO` is fine, but
`COCA COLA ZERO` must never be silently changed to a different product based on a guess. The
original OCR text must remain available for debugging.

---

## 5. AI parser (structuring)

Feed the normalized OCR text to an AI model.

Preferred model: Gemini Flash-Lite or an equivalent cheap model that supports structured JSON
output.

The model must extract:
- store
- date
- time, if available
- receipt number, if available
- currency
- individual line items: name, category, quantity, unit, unit price, item price, discount
- total
- VAT, if shown on the receipt

**The model must never invent values.** If a value isn't unambiguously available: `null`, never a
guess.

---

## 6. Target parser JSON shape

```json
{
  "store": { "name": "Lidl", "confidence": 0.98 },
  "receipt": {
    "date": "2026-09-21",
    "time": "17:42",
    "receipt_number": null,
    "currency": "CZK"
  },
  "items": [
    {
      "name": "Mléko",
      "category": "Potraviny",
      "quantity": 2,
      "unit": "ks",
      "unit_price": 24.90,
      "total_price": 49.80,
      "discount": 0,
      "confidence": 0.96
    }
  ],
  "subtotal": 49.80,
  "discount_total": 0,
  "total": 49.80,
  "confidence": 0.95
}
```

Adapt the exact shape to the project's existing database tables when implementing (see section 12
— most of this already has a home in `receipt_imports`/`purchases`/`purchase_items`).

---

## 7. Validation

Never treat the AI parser's output as correct automatically. Run automatic checks:

**Line-item check.** Compute `quantity × unit_price` and compare against `total_price`, allowing a
small rounding tolerance.

**Receipt-level check.** Compute `SUM(item.total_price) − discounts` and compare against the
receipt total. If the difference exceeds a defined tolerance: `REVIEW_REQUIRED`.

**Missing-data check.** Missing store, date, total, or an item's category → `REVIEW_REQUIRED`. Missing only an
optional field (e.g. receipt number) does not require flagging the receipt as invalid.

**Category check.** Each item is classified as exactly one of `Potraviny`, `Drogerie`, `Děti`, `Domácnost`, or `Ostatní`. If the AI cannot determine the category reliably, it returns `null` and the import waits for human review. When an exact product exists in the product catalog, the catalog category is authoritative and overrides the OCR/AI category.

---

## 8. Confidence

Any important value may carry a confidence score (store, date, item, total). A low-confidence
value should be flagged for review, but confidence must never be the *only* validation — it must
always be combined with the mathematical consistency check (section 7).

---

## 9. Duplicate detection

Before saving, check for a potential duplicate — e.g. by the combination of household, store,
date, total, and receipt number (if present). A potential duplicate → `DUPLICATE_REVIEW`. Never
auto-delete. The user must be able to choose: save as a new receipt, use the existing one, or
cancel the import.

---

## 10. Neon schema — map onto what already exists, do not build a parallel system

The owner's original proposal was a standalone `receipts` + `receipt_items` table pair. **Before
implementing, re-check this against the real schema at the time** — as of 2026-09-22 it already
looks like this:

- `receipt_imports` (added for the manual-entry receipt import, `lib/db/schema.ts`) already covers
  most of the proposed `receipts` table: `id`, `householdId`, `status`, `storeLocationId`, `date`,
  `source`, `rawOcrText` (already present, currently always null for manual imports), `items`
  (JSON), `purchaseId`, `createdAt`, `processedAt`. Extending it with the remaining fields this
  design needs (`receiptTime`, `receiptNumber`, `currency`, `subtotal`, `discountTotal`, `total`,
  `confidence`, `parserResult`, `errorMessage`, `updatedAt`) is very likely preferable to a second,
  parallel table — confirm there's no reason found at implementation time to split them.
- `receipt_status` (`lib/db/schema.ts` enum) currently only has `pending_review` / `imported` /
  `discarded` — far short of the richer state machine this design calls for (section 11). Extending
  the enum (a migration) is expected; do not introduce a second status column/table to work around
  it.
- Whether per-item confidence needs its own normalized `receipt_items` table, or can live as extra
  keys inside `receipt_imports.items`'s existing JSON blob, is an open decision — `purchase_items`
  already exists as the normalized, authoritative line-item table once a receipt is *confirmed*;
  a parallel `receipt_items` table would duplicate that concept for the pre-confirmation stage.
  Decide based on whether pre-confirmation line items genuinely need to be queried/joined on their
  own, or whether they only ever need to be read back as a whole (in which case JSON is enough,
  same as today).
- `purchases` / `purchase_items` remain the authoritative *confirmed* purchase records — this
  pipeline's job is to get a household from "uploaded photo" to a confirmed `purchases` row via
  `importReceiptAction()` (or its evolution), not to replace it.

---

## 11. Import states

Use a clear state machine:

```text
UPLOADED → OCR_PROCESSING → OCR_COMPLETED → PARSING → PARSED → VALIDATING → COMPLETED
```

Alternative/terminal states: `OCR_FAILED`, `PARSING_FAILED`, `REVIEW_REQUIRED`,
`DUPLICATE_REVIEW`, `CANCELLED`.

---

## 12. How this plugs into what actually exists

How each open question below was resolved when this was implemented (2026-09-22):

- The single-call `ReceiptOcrProvider` seam this section originally proposed was replaced with the
  two-stage split this design called for in section 1: `lib/receipts.ts`'s `ReceiptTextExtractor`
  (`googleVisionTextExtractor`, real Google Cloud Vision `DOCUMENT_TEXT_DETECTION` call) and
  `ReceiptStructuringProvider` (`geminiStructuringProvider`, `generateObject` from the `ai` SDK
  against `google/gemini-2.5-flash-lite` via the AI Gateway). Both are injectable interfaces, so
  `app/actions/receipts.ts`'s tests exercise the real orchestration logic (state transitions,
  validation gate, duplicate check) against fake providers, without needing real Vision/Gemini
  credentials to run.
- `app/actions/receipts.ts`'s `createPurchaseFromReceiptItems()` (shared by `importReceiptAction`,
  a completed OCR pass, and a confirmed review) is exactly the reuse this section anticipated — one
  place turns a `ReceiptLineItem[]` into `purchases`/`purchase_items` + pantry restock, per CLAUDE.md
  section 6.
- `components/budget/receipt-import.tsx` now offers a real "Vyfotit nebo nahrát účtenku" upload
  alongside the manual-entry form (no longer says OCR isn't available). A failed/ambiguous
  upload's result surfaces via the new `components/budget/receipt-pending.tsx` — retry for a
  failure, an editable review form for `review_required`, and a three-way choice
  (use-existing/save-as-new/cancel) for `duplicate_review`.
- Image storage: Vercel Blob, private access, per household (`receipts/<householdId>/<uuid>.<ext>`)
  — a real provisioned integration, not a placeholder, per the project's marketplace-integration
  convention.
- **Known gap, not yet closed:** `GOOGLE_VISION_API_KEY` is set in the Vercel project for
  Production only, not Development — so the OCR stage cannot be exercised against real credentials
  in local dev (`vercel env pull` won't fetch it). Tests and local verification use fake providers
  instead, which cover the orchestration logic but not real Vision/Gemini output quality. Add the
  key to Development in Vercel when someone needs to test against real receipts locally.

---

## 12b. Category, storage location, units and pantry (added 2026-09-22)

Extends section 12 — added once the pipeline needed to feed the household pantry ("spíž/lednice/
mrazák/domácnost"), not just purchase history.

**Category recognition.** `extractedReceiptItemSchema` (`lib/receipts.ts`) now includes a per-item
`category`, one of the app's five categories or `null` when the model isn't confident — the
structuring prompt asks for it explicitly. (This was previously assumed already implemented; it
wasn't — there was no `category` field on the OCR schema at all until this pass.)

**Where a product lives, without guessing.** `lib/pantry.ts`'s `inferPantryLocation(category, name)`
returns a confident `Lednice`/`Mrazák`/`Spíž`/`Domácnost`, or `null` when it genuinely can't tell
(an unmatched `Potraviny` item, or the catch-all `Ostatní` category, whose classification was
already uncertain). `lib/receipts.ts`'s `resolveItemPlacement(catalogEntry, aiCategory, name)` adds
catalog priority on top: an existing product's own *remembered* category/location (set by a past
human correction, never an unreviewed AI guess) always wins over what this particular receipt's OCR
suggests; failing that, the deterministic classification above; failing that, `null`.

**The review gate got a second reason.** `processReceiptImport()` now also routes to
`review_required` when any item's placement resolves to `null` (via `resolveItemPlacement`) or its
unit isn't one `normalizeReceiptUnit()` recognizes (via new `isRecognizedUnit()`) — on top of the
pre-existing missing-field/inconsistent-math checks. The review form
(`components/budget/receipt-pending.tsx`) shows a "Datum" field and an "Uložení" (storage location)
select per item — blank when genuinely ambiguous, pre-filled otherwise — and the confirm button
stays disabled until every item has a location and a date.

**Corrections are remembered.** Confirming a manual entry or a review
(`lib/db/queries.ts`'s `upsertProductCatalogDefaults()`) writes the confirmed category/unit/location
back into the `products` table (`default_location`, a new nullable column; `default_unit` already
existed) — creating the catalog row if the product had never been seen before. The *next* receipt of
the same product then resolves via catalog priority above, without needing review again. This only
happens on a human-confirmed path (manual entry, or a completed review) — a fully-automatic OCR pass
never writes to the catalog.

**Quantities are genuinely decimal.** `purchase_items.quantity` and `pantry_items.quantity` are
`numeric(10,3)`, not `integer` — "KUŘE 0,582 kg" must persist as `0.582`, not fail to insert or get
silently rounded. The manual-entry and review forms' quantity inputs no longer clamp to a minimum of
1.

**Manual stock correction**, separate from all of the above: `adjustPantryItemQuantityAction`
(`app/actions/pantry.ts`) lets the household set a pantry row's current quantity directly (a `−`/`+`
stepper or typing an exact value, e.g. "1.5" for a `kg` item) — never negative, and reaching exactly
`0` keeps the row rather than deleting it. This only ever touches `pantry_items`, never
`purchase_items` — current stock and purchase history are and remain two separate records.

---

## 13. Retry

If OCR or the AI parser fails: don't require a new upload, keep the original image, keep the
previous result, and allow `Retry`. Retry must not create a duplicate receipt — every import needs
a stable `import_id`.

---

## 14. Manual review

For `REVIEW_REQUIRED`, show the user: the receipt photo, the OCR text, the recognized fields, the
individual line items, the total, and any validation errors. The user must be able to correct the
data. After correction: `REVIEW_REQUIRED → COMPLETED`.

---

## 15. Product matching

After successful parsing, attempt to link a line item to an existing catalog product — e.g. OCR
`MLÉKO POLOTUČNÉ 1L` against catalog `Mléko polotučné 1 l` → offer/perform a match using the
application's existing matching logic (`lib/products.ts`'s `matchProductByName()` — already used
by `addShoppingItemAction` and `importReceiptAction`; extending it for OCR's messier input, rather
than writing a second matcher, is the expected approach). Matching must not change the item's
original raw name from the receipt — store `raw_name` and, separately, `productId` when matched.

---

## 16. Price precision

Keep the receipt's real price per line item — never round to whole currency units (`24.90` stays
`24.90`). Price history must be preserved so a product's price trend can be tracked later (this
already exists in principle — `recordPriceObservation()`/`getProductPrices()`, `lib/db/queries.ts`
— though nothing feeds it from real ingestion yet).

---

## 17. Security

Google/AI credentials are server-side only, never sent to frontend JavaScript, never committed to
the repo, and are provided through environment variables or short-lived platform identity
mechanisms. The current implementation uses `GOOGLE_VISION_API_KEY` for image OCR and Vercel
OIDC + Google Workload Identity Federation for PDF OCR. No Google service-account JSON key is
required.

---

## 18. Cost control

Target: ~1,500 receipts/month. Optimize: run OCR only once per upload, run the AI parser only
once, retry only on failure, don't use an expensive model for a simple receipt, don't re-call AI
every time a receipt is viewed. Store results in Neon; re-viewing a receipt must not re-run OCR or
AI. This matches `CLAUDE.md` section 31 ("AI Cost Control") exactly.

---

## 19. Logging

For every import, log: `import_id`, household/user, timestamp, OCR status, parser status,
validation status, error, processing time, and AI request token count if available. Never log API
keys.

---

## 20. UI

The import modal must show progress: `Nahrávání` → `Čtení účtenky` → `Rozpoznávání položek` →
`Kontrola údajů` → `Hotovo`. On error, show the specific reason (e.g. "Nepodařilo se přečíst
účtenku. Zkuste nahrát ostřejší fotografii.") — never a bare `OCR Error`.

---

## 21. The one rule that matters most

OCR text is a source input. The AI parser must never replace facts with guesses. `null +
REVIEW_REQUIRED` is the correct outcome when uncertain — a wrongly-stored price or total is worse
than a receipt waiting on manual review.

---

## 22. Implementation order, when this phase actually starts

Before changing anything:

1. Re-review the current receipt-import implementation (section 12 above may be stale by then).
2. Re-check the real Neon schema (`receipt_imports`, `purchases`, `purchase_items`, `products`).
3. Re-check the real upload/storage situation (still nothing wired up as of this writing).
4. Don't rewrite working parts without a reason.
5. Design changes to be compatible with what already exists.

Then implement layer by layer: upload → Google Vision OCR → OCR normalization → AI parser → JSON
validation → receipt validation → Neon persistence → retry → manual review → UI progress/error
states.

After implementing, test at minimum: an ordinary Czech receipt, a receipt with many items, a
receipt with discounts, a receipt with items sold by weight, a blurry receipt, a receipt with no
date, a receipt with no total, a duplicate receipt, an OCR failure, an AI-parser failure, and a
retry after failure.

### Google Cloud / Vercel OIDC setup for PDF OCR

The PDF path requires a Google Workload Identity Pool and OIDC provider trusting Vercel. Use the Vercel team issuer (`https://oidc.vercel.com/<TEAM_SLUG>`) and audience (`https://vercel.com/<TEAM_SLUG>`). Map `google.subject=assertion.sub`. Create a dedicated service account and grant the Vercel project/environment principal `roles/iam.workloadIdentityUser` on that service account. Grant the service account only the permissions needed for Vision API.

Set these Vercel environment variables:
- `GCP_PROJECT_ID`
- `GCP_PROJECT_NUMBER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
- `GCP_WORKLOAD_IDENTITY_POOL_ID`
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`

The application uses `@vercel/oidc`'s `getVercelOidcToken()` helper. In Vercel Functions it reads the request-context OIDC token; in local development the helper can use/refresh the Vercel development token. The application does not read `x-vercel-oidc-token` or `VERCEL_OIDC_TOKEN` directly.

## 23. Azure OCR fallback

Azure Document Intelligence prebuilt-receipt is an optional OCR fallback. Google Vision remains the primary provider. Azure is called only after the primary OCR provider throws and these server-only Vercel environment variables are configured:

Every OCR import records the provider that actually produced the raw OCR text in receipt_imports.ocr_provider:
- google_vision — Google Cloud Vision succeeded.
- azure_document_intelligence — Google failed and Azure fallback succeeded.
- null — no OCR provider completed successfully (or the import was manual).

This is audit metadata only. The same Gemini structuring, validation, duplicate detection, and Neon persistence path is used regardless of provider.

- AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
- AZURE_DOCUMENT_INTELLIGENCE_KEY

The fallback uses the Azure Document Intelligence REST API 2024-11-30 and sends the uploaded file bytes as base64, so the private Vercel Blob URL is not exposed to Azure. Azure's analyzeResult.content is fed into the same Gemini structuring and validation pipeline; Azure never bypasses the application's validation rules.