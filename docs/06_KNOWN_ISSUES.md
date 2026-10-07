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
- Playwright smoke tests remain intentionally disabled in CI after repeated failures during earlier iterations; they are a deferred verification task, not a blocker for the current security hardening.
- OCR processing attempts, including retries, are now protected by an atomic 30-attempt rolling 24-hour household limit; the dedicated database test must remain in the database CI suite.
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
