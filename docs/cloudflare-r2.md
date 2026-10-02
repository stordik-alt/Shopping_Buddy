# Receipt Storage on Cloudflare R2

**Status (2026-10-02):** **complete** — all production receipt references use R2 and the application no longer contains a Vercel Blob fallback.

## Architecture

- The app remains hosted on Vercel.
- Receipt files are stored in a private Cloudflare R2 bucket.
- All receipt storage calls go through `lib/storage/`.
- `receipt_imports.image_url` stores an R2 reference in the form:
  `r2:receipts/{householdId}/{uuid}.{jpg|png|webp|pdf}`.
- R2 requests are signed with `aws4fetch` using the S3-compatible API.
- No public R2 URL is generated.

### Storage modules

| File | Role |
|---|---|
| `lib/storage/index.ts` | storage entry point, reference parsing and key validation |
| `lib/storage/r2.ts` | R2 implementation |
| `lib/storage/types.ts` | storage interface |

The previous `lib/storage/vercel-blob.ts` provider has been removed.

## Production migration verification

On 2026-10-02 the production Neon branch was checked:

- Vercel Blob references: **0**
- R2 references: **24**
- Receipt image references: **24**

The final nine historical Blob references were converted to their matching R2 references. Blob originals were not deleted during this database-reference cleanup.

## Environment variables

Only the following receipt-storage variables are required:

| Variable | Meaning |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret; server-only |
| `R2_BUCKET_NAME` | private R2 bucket |

Values are trimmed before use.

`STORAGE_PROVIDER` is no longer used. `BLOB_READ_WRITE_TOKEN` is no longer required by the application.

## Security

- Bucket remains private.
- Household authorization is performed before a receipt is read.
- R2 references are accepted only in the exact receipt-key layout.
- Path traversal and foreign object paths are rejected.
- R2 credentials are server-only and never logged.
- Receipt responses remain private and use `Cache-Control: no-store`.

## Rollback

There is no Vercel Blob rollback path in application code anymore.

If R2 itself becomes unavailable, the application should remain on R2 and the incident should be fixed at the R2/configuration layer rather than reintroducing the retired Blob provider.

## Cleanup performed

Removed from the repository:

- `@vercel/blob`
- `lib/storage/vercel-blob.ts`
- `scripts/migrate-vercel-blob-to-r2.ts`
- `db:migrate-blob-to-r2`
- Blob-specific test fake and provider tests

The full hosting migration to Cloudflare remains a separate project and is not part of this cleanup.
