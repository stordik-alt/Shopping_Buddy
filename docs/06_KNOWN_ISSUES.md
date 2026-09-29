# Shopping Buddy — Known Issues / Watch List

This is a living list. Remove an item only after the fix is verified.

## Data / prices
- Real external retailer price ingestion is still being developed.
- Product normalization across external sources requires stable product identity mapping.
- Official source prices may not contain branch identity.
- Existing historical UNKNOWN receipt observations are not automatically rewritten by this change; the new behavior applies when a receipt import resolves or creates its branch.

## OCR
- Real OCR availability depends on configured Google Vision credentials in the relevant environment.
- OCR changes must preserve review, failure and manual-entry paths.
- Ambiguous OCR output must not be treated as certain data.

## Infrastructure / verification
- The CI `database` job skips itself until the repository secret `TEST_DATABASE_URL` (Neon test branch) is added, so database-backed tests (server actions, receipt routes, `lib/db`) currently run only locally (`pnpm test`).
- No Content-Security-Policy is set; only the basic security headers in `next.config.mjs`.
- `retryReceiptImportAction` is not counted by the receipt upload limit (30 per household per 24 h).
- Vercel build/deployment must be explicitly checked after relevant changes.
- Neon migrations must be verified against the real development database before production use.

## Recurring failure modes
Previously encountered classes of errors include:
- localDateKey is not defined
- RPC invocation/type errors
- TypeScript build failures
- Vercel configuration/build failures
- receipt import/reimport duplication
- mobile overflow/content clipping
- CI red because a database-backed test was missing from the pure-test job's exclude list (fixed 2026-09-29: keep that list and the `database` job's include list in step)

When one reappears, document exact reproduction and the fixing commit.

## Maintenance rule
Keep only still-relevant issues and recurring failure modes here, not the complete historical changelog.
