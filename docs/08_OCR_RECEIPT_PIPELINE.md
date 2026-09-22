# Shopping Buddy — OCR Receipt Import Pipeline (Planning)

**Status: planning only, not implemented.** This document captures the owner's target design for
automatic receipt OCR. Per `CLAUDE.md` section 30 ("AI Shopping Assistant — FINAL PHASE") and
section 40 (development priority order), this pipeline calls external AI/model APIs (Google Cloud
Vision, Gemini) and must **not** be implemented before the AI phase, or before the owner
explicitly authorizes it as an exception. Until then, `app/actions/receipts.ts`'s
`importReceiptAction()` and the manual-entry UI (`components/budget/receipt-import.tsx`) remain
the only working path — see section 12 below for exactly where this design plugs into what
already exists.

Target capacity: ~1,500 receipts/month. Primary database: Neon PostgreSQL. OCR: Google Cloud
Vision. Structuring the OCR text into data: a cheap AI model, preferably Gemini Flash-Lite.
The application must never persist unverified or obviously-incorrect data as a valid receipt.

---

## 1. Architecture

```text
User uploads a receipt photo
      ↓
Image validation
      ↓
Google Cloud Vision OCR
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

1. Verify the file type.
2. Verify the maximum size.
3. Optimize the image if needed.
4. Keep the original image, per the application's existing storage architecture (not yet
   decided — see section 12; no blob-storage integration is wired up yet).
5. Create a unique import ID.
6. Set status: `UPLOADED`.

Then start OCR.

---

## 3. OCR — Google Cloud Vision

Use Google Cloud Vision for OCR. Preferred mode: `DOCUMENT_TEXT_DETECTION`.

OCR must return:
- the full receipt text
- individual lines
- bounding boxes/text positions, if available

On success: `OCR_COMPLETED`. On failure: `OCR_FAILED`. The error must be stored so the import can
be retried without re-uploading the receipt.

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
- individual line items: name, quantity, unit, unit price, item price, discount
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

**Missing-data check.** Missing store, date, or total → `REVIEW_REQUIRED`. Missing only an
optional field (e.g. receipt number) does not require flagging the receipt as invalid.

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

## 12. How this plugs into what already exists (read this before implementing)

Work already done this session, deliberately stopping short of real OCR (per `CLAUDE.md` section
30):

- `lib/receipts.ts` defines `ReceiptOcrProvider` (an `extract(image) → ExtractedReceipt` seam) and
  a placeholder `unimplementedOcrProvider` that throws. **This interface conflates OCR and
  structuring into one call** — this design's pipeline (section 1) treats Google Vision (OCR) and
  the Gemini structuring step as two separate stages. `ReceiptOcrProvider` will need to become two
  seams (an OCR provider returning raw text/lines, and a structuring provider turning that text
  into `ExtractedReceipt`), or `extract()` needs to internally compose both — decide when
  implementing, but don't silently keep conflating them if the two-stage pipeline is adopted.
- `app/actions/receipts.ts`'s `importReceiptAction(items, options)` already does everything from
  "confirmed line items" onward: creates `purchases`/`purchase_items`, restocks the pantry via the
  shared `restockPantryItem()` (`lib/db/queries.ts`), and records a `receipt_imports` row. A real
  OCR/parser pipeline's job is to get from "uploaded photo" to a household-confirmed
  `ReceiptLineItem[]` — at which point it can very likely call this same action rather than
  duplicating its purchase-creation/pantry-restocking logic, per `CLAUDE.md` section 6 ("do not
  duplicate business logic").
- `components/budget/receipt-import.tsx` is the manual-entry fallback UI. Its "no OCR yet" message
  is the thing to replace with the upload/progress UI (section 19 below) once a real pipeline
  exists — the manual-entry form itself should stay available as the review/correction UI for
  `REVIEW_REQUIRED` (section 13).
- No image upload/storage exists yet (no Vercel Blob or equivalent wired up) — needed before
  section 2 can be implemented at all. Per the Vercel marketplace-integration convention this
  project otherwise follows, that should be a real provisioned integration, not a placeholder.

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

Google/AI model API keys: server-side only, never sent to frontend JavaScript, never committed to
the repo, always via environment variables — e.g. `GOOGLE_CLOUD_PROJECT`,
`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_VISION_API_KEY`, `GEMINI_API_KEY`. Use only the
credentials that correspond to the actual implementation.

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
