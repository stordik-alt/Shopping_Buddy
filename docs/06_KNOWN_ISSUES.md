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

When one reappears, document exact reproduction and the fixing commit.

## Maintenance rule
Keep only still-relevant issues and recurring failure modes here, not the complete historical changelog.
