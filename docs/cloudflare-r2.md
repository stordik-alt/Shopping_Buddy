# Receipt Storage on Cloudflare R2

**Status (2026-09-25):** **live in production** — new receipt uploads go to R2 (owner-confirmed after
two configuration fixes, see the changelog). Old receipts are still on Vercel Blob until copied.
Originally: The switch happens by
setting environment variables on Vercel — no database migration, no other deployment step.

**Why now:** the Vercel Blob store is over its usage limit. When that happened before, Vercel
suspended the store ("This store has been suspended"). While a store is suspended, receipt upload
fails and stored receipts can't be viewed or re-processed (see `test/fake-blob.ts`).

## How it works

- The app stays on Vercel. Only receipt files move to R2.
- All storage calls go through `lib/storage/`:

| File | Role |
|---|---|
| `lib/storage/index.ts` | entry point: `putReceiptFile`, `getReceiptFile`, `deleteReceiptFile`, reference parsing, key validation, provider choice |
| `lib/storage/r2.ts` | R2 over its S3-compatible API, requests signed with `aws4fetch` (SigV4, region `auto`) |
| `lib/storage/vercel-blob.ts` | the previous Vercel Blob calls, unchanged behavior |
| `lib/storage/types.ts` | `ReceiptFileStore` interface |

Callers: `app/actions/receipts.ts` (upload, OCR pipeline read, cancel) and
`app/api/receipts/[id]/image/route.ts` (preview/download). Both check household ownership before
touching storage, the same as before.

### Storage reference in `receipt_imports.image_url`

| Value | Provider |
|---|---|
| `https://….blob.vercel-storage.com/receipts/{householdId}/{uuid}.{ext}` | Vercel Blob. This covers every receipt uploaded before the switch. |
| `r2:receipts/{householdId}/{uuid}.{ext}` | R2 (object key after the prefix) |

- **Provider per row:** each read picks the provider from the row itself. Old Blob receipts keep
  working after new uploads go to R2.
- **No migration needed:** the reference is stable and never an expiring URL, so the switch
  deploys without a database migration.
- **Key validation:** an R2 reference is accepted only in the exact layout
  `receipts/{uuid}/{uuid}.{jpg|png|webp|pdf}`. A corrupted or hand-edited row therefore can't
  address another household's folder or an arbitrary object.
- **Deliberately not added:** `storage_provider` and `storage_key` columns. They would need a
  migration to run before the deploy, while production uploads are failing. They can be added
  later if needed.

### Provider switch: `STORAGE_PROVIDER`

| Value | New uploads |
|---|---|
| unset / `vercel` | Vercel Blob (previous behavior) |
| `r2` | R2 |

- **Unknown value:** it is an error (upload fails with a logged reason), never a silent fallback.
- **Reads are not affected:** they always follow the row's reference.
- **No `dual` mode:** writing a second copy to Blob would fail for as long as the Blob store is
  over its limit. The rollback copy is the Blob original, which the copy script never deletes.

## Environment variables (Vercel project + `.env.local`)

Names only. Never commit values.

| Variable | Meaning |
|---|---|
| `STORAGE_PROVIDER` | `r2` to send new uploads to R2 |
| `R2_ACCOUNT_ID` | Cloudflare account id (S3 endpoint `https://<id>.r2.cloudflarestorage.com`) |
| `R2_ACCESS_KEY_ID` | R2 API token, access key id |
| `R2_SECRET_ACCESS_KEY` | R2 API token, secret. Server-only: no `NEXT_PUBLIC_` prefix, never logged |
| `R2_BUCKET_NAME` | private bucket for this environment |

Values are trimmed before use (a trailing newline pasted into Vercel broke the first production
upload with `InvalidBucketName`), but type them without surrounding spaces anyway.

`BLOB_READ_WRITE_TOKEN` stays set. It is needed to read old receipts until they are copied.

## Cloudflare setup (done by the owner in the dashboard)

1. **Payment method:** R2 → add one. R2 requires it even within the free tier.
2. **Billing alert:** Billing → Notifications. R2 has no hard spending cap.
3. **Buckets:** create two private buckets, e.g. `shopping-buddy-receipts` (production) and
   `shopping-buddy-receipts-test` (local/tests). Do not enable public access or an `r2.dev` URL.
4. **API token:** R2 → Manage API tokens → create a token with permission **Object Read &
   Write**, limited to those buckets. Copy the Access Key ID and Secret Access Key. They are shown
   only once.
5. **Vercel env:** in the project's Production environment, set `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME`, plus `STORAGE_PROVIDER=r2`.
   Then redeploy.

## Rollout

1. **Merge and deploy** with `STORAGE_PROVIDER` unset. Behavior is identical to before.
2. **Set the R2 env vars and `STORAGE_PROVIDER=r2`**, then redeploy.
3. **Check on a phone:**
   - Upload a photo and a PDF.
   - Confirm the preview shows.
   - Confirm OCR completes.
   - Cancel one import and confirm its R2 object is deleted.
4. **Copy old receipts** once the Blob store is readable again. That means after the monthly quota
   resets, or after the plan is raised for a short time. See the next section.

## Copying old receipts: `pnpm db:migrate-blob-to-r2`

`scripts/migrate-vercel-blob-to-r2.ts` processes every row whose `image_url` is still a Blob URL.
For each one:

1. Download the file from Blob.
2. Upload it to R2 under the same key.
3. Read it back and compare size and SHA-256.
4. Update the row, only if it still holds that Blob URL.

| Command | Effect |
|---|---|
| `pnpm db:migrate-blob-to-r2 --dry-run` | read only: reports what would be copied. Never uploads, writes the DB or deletes |
| `pnpm db:migrate-blob-to-r2 [--limit N]` | copy + verify + switch; writes a `blob-to-r2-<time>.jsonl` log |
| `pnpm db:migrate-blob-to-r2 --rollback <log>` | puts the Blob URLs from the log back (only rows still pointing at that copy) |

**Safety:**
- **Idempotent and restartable:** an object already in R2 with the same bytes is not uploaded again.
- **No overwrites:** a *different* object under the same key is reported and left alone.
- **Unexpected keys are skipped:** keys outside the receipt layout (e.g. old test paths) stay on
  Blob.
- **Blob files are never deleted.** Delete them by hand only after the rollback window.

## Rollback

| Situation | Action |
|---|---|
| R2 misbehaves for new uploads | unset `STORAGE_PROVIDER` (or set `vercel`) and redeploy. New uploads go back to Blob. Existing `r2:` rows stay readable as long as the R2 env vars remain set |
| A copy run went wrong | `pnpm db:migrate-blob-to-r2 --rollback <log>` |
| Revert the code | first switch every `r2:` row back with the logs. Rows uploaded directly to R2 have no Blob copy: keep the R2 bucket, or re-upload those files to Blob before removing the code |

## Tests

`lib/storage/storage.test.ts` has 12 tests. Blob is the in-memory fake, and R2 runs against a
stubbed `fetch` bucket. They cover:
- reference parsing;
- rejection of path traversal and foreign layouts;
- provider choice and rejection of an unknown `STORAGE_PROVIDER`;
- the R2 path: upload key, SigV4 header, no secret in headers, read-back bytes and type, delete,
  404 → `null`, 403 surfaced with its status, missing config named;
- digest for copy verification;
- an old Blob receipt still readable with `STORAGE_PROVIDER=r2`;
- default uploads going to Blob without touching R2.

**Not verified yet:** requests against a real R2 bucket, which needs the owner's token. The DB-backed
receipt tests (`app/actions/receipts.test.ts`, `app/api/receipts/[id]/image/route.test.ts`) were not
run here because there is no test database in the cloud session. They exercise the default Blob path
through the new layer and must pass locally (`pnpm test`) before merging.
