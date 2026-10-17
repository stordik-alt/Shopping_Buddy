# Cloudflare Production — Status

**Last updated:** 2026-10-17

**Current state:** Per owner confirmation, production runs on Cloudflare Workers/OpenNext. Vercel is historical as an application hosting/deployment platform; the owner reports its only remaining association is management of the Neon account. This update records the owner's statement; it does not independently verify the live Worker, DNS, or Neon account configuration. Receipt storage is R2-only and the application no longer contains a Vercel Blob provider or rollback path.

| Phase | Status |
|---|---|
| 0. Cloudflare agent setup | Historical preparation step |
| 1. Audit | ✅ Done |
| 2. Storage abstraction | ✅ Done — lib/storage/ |
| 3. Vercel Blob → R2 | ✅ **Complete** — all production receipt_imports.image_url references are R2 |
| 4. Provider-neutral application | 🟡 Prepared (PR #83 merged) |
| 5. Cloudflare staging | Historical migration phase; see deployment runbook for the recorded test scope |
| 6. Full Cloudflare testing | Historical preparation notes are not evidence of current live verification |
| 7. Production cutover | ✅ Owner confirms production runs on Cloudflare |
| 8. Rollback window | Vercel application hosting is historical; no Vercel hosting rollback is documented as active |
| 9. Remove Vercel | Application hosting/deployment retired per owner; Neon account management is the stated remaining association |

## Production verification — 2026-10-02

Production Neon branch br-twilight-firefly-au389m1e was checked after the historical receipt copy:

- receipt_imports with a Vercel Blob URL: **0**
- receipt_imports with an R2 reference: **24**
- receipt_imports with an image reference: **24**
- The remaining nine historical Blob references were converted to the corresponding r2:receipts/... references.
- Blob originals were not deleted as part of the DB reference migration.

## Current storage architecture

Production runs on Cloudflare Workers/OpenNext per owner confirmation. Receipt files are stored in Cloudflare R2 through the S3-compatible API using aws4fetch.

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

The Cloudflare production Worker needs:

- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME

These are server-only values.

## Scope

This document's 2026-10-02 receipt-storage verification is historical. The owner later confirmed the application hosting cutover to Cloudflare. Older references here to Vercel hosting, cron, OIDC, or deployment describe the state at the time and are not current production instructions; the only Vercel association currently reported by the owner is Neon account management.
