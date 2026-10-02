# Cloudflare Migration — Status

**Last updated:** 2026-10-02

**Current state:** Receipt storage migration is complete. Production receipt references are now R2-only and the application no longer contains a Vercel Blob provider or rollback path.

| Phase | Status |
|---|---|
| 0. Cloudflare agent setup | ⛔ Not required for the R2 runtime currently used from Vercel |
| 1. Audit | ✅ Done |
| 2. Storage abstraction | ✅ Done — lib/storage/ |
| 3. Vercel Blob → R2 | ✅ **Complete** — all production receipt_imports.image_url references are R2 |
| 4. Provider-neutral application | 🟡 Prepared (PR #83 merged) |
| 5. Cloudflare staging | ⏸ Out of current scope |
| 6. Full Cloudflare testing | — Out of current scope |
| 7. Production cutover | — Out of current scope |
| 8. Rollback window | — Closed for the Blob provider |
| 9. Remove Vercel | — Out of current scope |

## Production verification — 2026-10-02

Production Neon branch br-twilight-firefly-au389m1e was checked after the historical receipt copy:

- receipt_imports with a Vercel Blob URL: **0**
- receipt_imports with an R2 reference: **24**
- receipt_imports with an image reference: **24**
- The remaining nine historical Blob references were converted to the corresponding r2:receipts/... references.
- Blob originals were not deleted as part of the DB reference migration.

## Current storage architecture

The application remains hosted on Vercel. Receipt files are stored in Cloudflare R2 through the S3-compatible API using aws4fetch.

- lib/storage/index.ts — storage entry point and R2 reference validation
- lib/storage/r2.ts — R2 implementation
- lib/storage/types.ts — provider-neutral interface
- receipt_imports.image_url — stores r2:receipts/{householdId}/{uuid}.{ext}

There is no STORAGE_PROVIDER switch and no Vercel Blob fallback.

## Removed

The cleanup removes:

- @vercel/blob
- lib/storage/vercel-blob.ts
- scripts/migrate-vercel-blob-to-r2.ts
- db:migrate-blob-to-r2
- the obsolete Blob test fake and Blob-specific tests
- the Blob rollback path

BLOB_READ_WRITE_TOKEN is no longer required by the application.

## R2 environment variables

The Vercel project still needs:

- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME

These are server-only values.

## Scope

This completes the receipt-storage migration only. Hosting, Vercel Cron, Vercel OIDC, AI Gateway, analytics and the eventual Cloudflare hosting cutover remain separate work.
