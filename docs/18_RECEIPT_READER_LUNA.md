# 18 — Reading receipts with GPT-6 Luna (one step instead of OCR + structuring)

Status: **phase 1 (preparation and measurement) implemented 2026-10-05; production unchanged.** Phase 2 (switching
production) waits for the measurement and the owner's go-ahead.

The owner's concept (2026-10-05): drop the OCR step (Google Vision / Azure Document Intelligence) and the separate
structuring model (Gemini Flash-Lite); GPT-6 Luna reads the receipt image and returns the app's structure directly.
*"AI tedy nerozhoduje o databázových/business pravidlech. AI interpretuje dokument, backend je autoritou pro data a
pravidla."* Before implementation: exact JSON schema, import state machine, prompt, a dataset of real receipts,
measurement of accuracy, false positives and cost — only then the production migration. Owner decisions: the dataset is
production receipts only (kept locally, never in the repository); processing stays in the existing Vercel function (no
Cloudflare Worker); production switches with `RECEIPT_READER=luna|legacy`, the old path stays a few weeks for a manual
switch back only (no automatic fallback) and is then removed.

## Today (verified 2026-10-05)
`lib/receipt-import.ts` `processReceiptImport`: photo from R2 → `prepareReceiptImageForOcr` → Google Vision
(Azure `prebuilt-receipt` after a Vision failure; a digital PDF's text layer skips OCR) → `normalizeOcrText` → Gemini
2.5 Flash-Lite (`geminiStructuringProvider`) → `needsReview` / placement gate / duplicate check → purchase.
**Google Vision currently fails in production for every photo** ("This API method requires billing to be enabled" on
the GCP project, reproduced by the measurement run); every photo in the dataset was read by the Azure fallback.

## Responsibilities
- **Luna reads:** merchant, branch, date, time, receipt number, currency, lines (printed text, quantity, unit,
  package size, unit price, line price before discount, discount, EAN), totals, multi-line items, which photo a line
  is on, whether each photo is readable, confidence per line and per receipt.
- **The backend decides** (unchanged code): product identity and matching (aliases, suggestions), category and
  storage place (`lib/categorization.ts`, `resolveItemPlacement`), unit normalization, totals check, duplicates,
  new products, expense, pantry, import state.

## Schema (`lib/receipt-reading.ts` `receiptReadingSchema`)
Strict structured output: every key always present, "not printed / unsure" is `null`.
`receipt { merchant, storeAddress, storeCity, date, time, receiptNumber, currency, subtotal, discountTotal, total,
confidence }`, `items[] { rawName, normalizedName, quantity, unit, packageSize, packageUnit, unitPrice, lineTotal,
discount, categoryHint, ean, confidence, imageIndex }`, `images[] { index, readable, note }`.
`toExtractedReceipt()` maps it onto the existing `ExtractedReceipt`, so everything after reading is the current code:
the item's name is the **printed** text (matching and learned aliases work on it); `normalizedName` and `categoryHint`
are hints only; an invalid date becomes null (→ review). Discount semantics are those of docs/08 section 7.

## Prompt (`lib/receipt-reading-prompt.ts`, version `luna-receipt-v1`)
The Czech-receipt rules proven with Gemini (null over a guess, no "correcting" names, discounts, weighed lines, no
rounding/deposit/payment lines as items) plus: several photos are one receipt in order and overlapping lines count
once; `readable:false` for an unreadable photo; confidence means "certain this is what is printed". The version is
logged and stored with every measured result.

## State machine
Existing `receipt_status` values, no enum change:
`uploaded → ocr_processing` ("Čtení účtenky" = the Luna call) `→ parsed → validating → completed | review_required |
duplicate_review`; failures `ocr_failed` (file unreadable, photos unreadable, receipt confidence too low — "vyfoťte
znovu", manual entry stays available) and `parsing_failed` (model error, invalid schema). `ocr_completed`/`parsing`
are skipped; `receiptProgress` already maps every state.

## Decision (`receiptDecision`)
- **auto** only when the app's own checks pass (totals, required fields, units, placement) **and** receipt and every
  item confidence ≥ 0.90. Confidence never lets a failed check through (docs/08 section 8).
- **review** otherwise; items below 0.70 are pointed out.
- **retake** when a photo is unreadable or receipt confidence < 0.70.
Thresholds are starting values, tuned on the dataset.

## Images
`prepareReceiptImageForModel` (`lib/receipt-image.ts`): EXIF rotation, long side ≤ 3000 px, JPEG ≤ 3 MB, colour
(`plain`) or the OCR clean-up (`ocr`) — measured against each other; brightness and sharpness are measured and
reported, small/dark photos flagged. The original in R2 is never changed. Several photos of one receipt go in one
request (phase 2 adds `receipt_import_files`); the measurement tests this by splitting tall photos into overlapping
parts (`luna-low-split`).

## Measurement (`scripts/receipt-eval`)
- `pnpm receipt-eval:export [limit]` — read-only against production: photo-imported receipts with a purchase; writes
  `original.*`, `truth.json` (the confirmed purchase) and `meta.json` (`truthSource`: `corrected` = the household
  changed the reading, a checked answer; `as-read` = the old reading was kept unchanged, possibly equally wrong) to
  `RECEIPT_EVAL_DIR` (default `C:/tmp/receipt-eval/dataset`), outside the repository.
- `pnpm receipt-eval:run [variant…] [--limit N]` — variants `legacy` (Vision → Azure on failure → Gemini, as
  production), `luna-none`, `luna-low`, `luna-low-ocr`, `luna-low-split`; every answer cached next to the receipt;
  writes `report.md` and `results.csv`. Metrics (`lib/receipt-eval.ts`): store/date/total, line recall, line paid
  amounts, decision vs. correctness — **false automatic import** (imported on its own but wrong; target 0) — review
  and retake share, cost per receipt from token usage and the gateway price list, latency p50/p95. "As-read" receipts a
  new reader disagrees with are listed for a look at the photo.

### Baseline (2026-10-05, 14 receipts: 10 photos, 4 digital PDFs)
| Variant | Correct | False auto | Auto | Review | Lines found | Line amounts | Store | Date | Total | Cost / receipt | p50 | p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| legacy | 5 | **3** | 8 | 6 | 98.7 % | 96.7 % | 85.7 % | 100 % | 50.0 % | $0.00063 | 8.7 s | 39.5 s |

The dataset is small (20 photo imports with a purchase in production, 6 photos no longer in storage, one receipt
imported twice); the truth of a few receipts needs a look at the photo. Luna variants not yet measured — see below.

### Blocker
The AI Gateway refuses `openai/gpt-6-luna` for this account: *"Free tier users do not have access to this model.
Upgrade to paid credits"* (403). Measuring Luna, and later production, needs paid AI Gateway credits — the owner's
decision. Expected cost: about $0.10 per 1M input and $0.50 per 1M output tokens (gateway price list, 2026-10-05).

## Phase 2 (after the measurement and the owner's go-ahead)
1. `RECEIPT_READER=luna|legacy` in `processReceiptImport` (default `legacy`): photos → `prepareReceiptImageForModel` →
   `createLunaReceiptReader` → `toExtractedReceipt` → today's checks + `receiptDecision`; `parserResult` stores the
   reading, `ocrProvider = 'gpt6_luna'`. No automatic fallback.
2. Several photos: additive `receipt_import_files (import_id, position, storage key)`, "Přidat další část účtenky",
   a per-import photo limit.
3. Upload the original (≤ 10 MB) and shrink only on the server for the model.
4. After a few calm weeks: remove Vision, Azure, Gemini structuring, the GCP OIDC PDF path and their variables; update
   docs 08/18, 01, 07 and CLAUDE.md.
