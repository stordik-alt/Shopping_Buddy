# Cloudflare Migration — Status

**Last updated:** 2026-09-25
**Current phase:** Phases 2–3 (storage layer + R2) **code ready, not active** · waiting for the owner's R2 bucket + token
**Production:** Vercel (unchanged). No Cloudflare resource has been created or changed by Claude.

> **Current scope (owner decision, 2026-09-25): only Vercel Blob → Cloudflare R2.** The application
> stays hosted on Vercel and uses R2 through its S3-compatible API (`aws4fetch`, server-side only,
> private bucket). Hosting, crons, OCR auth, AI Gateway, analytics and DNS are out of scope for
> now — phases 5–9 below are the long-term plan, not scheduled work.
>
> **Urgency:** the Vercel Blob store is over its usage limit (owner, 2026-09-25), which suspends
> receipt upload and viewing. Operating guide: `docs/cloudflare-r2.md`.

| Phase | Status |
|---|---|
| 0. Cloudflare agent setup | ⛔ Blocked from the cloud session (network policy); not needed to ship the R2 code |
| 1. Audit | ✅ Done — `docs/cloudflare-migration-audit.md` |
| 2. Storage abstraction | ✅ Code + unit tests — `lib/storage/` |
| 3. Vercel Blob → R2 | 🟡 Code + unit tests + copy script; **not verified against a real bucket**, not active |
| 4. Provider-neutral application | — Out of current scope (storage part is covered by phases 2–3) |
| 5. Cloudflare staging | — Out of current scope |
| 6. Full testing | — Out of current scope |
| 7. Production cutover | — Out of current scope |
| 8. Rollback window | — Out of current scope |
| 9. Remove Vercel | — Out of current scope |

## CLOUDFLARE SETUP

Attempted 2026-09-25 from the Claude Code cloud session:

- `https://developers.cloudflare.com/agent-setup/prompt.md` and `https://api.cloudflare.com` —
  **not reachable**: the session's network egress policy denies them.
- No Cloudflare credentials in the environment.
- R2 needs a payment method on the Cloudflare account even within the free tier (owner, 2026-09-25).

**Required user actions:** see `docs/cloudflare-r2.md` → "Cloudflare setup" (payment method,
billing alert, two private buckets, Object Read & Write token, Vercel env vars). To let Claude
verify against the real test bucket from the cloud session, also allow
`*.r2.cloudflarestorage.com` in the environment's network access and add the `R2_*` variables of
the **test** bucket to the environment's secrets.

## CURRENT STATE

Vercel hosts everything. Receipt storage goes through `lib/storage/`; with `STORAGE_PROVIDER`
unset it behaves exactly as before (Vercel Blob).

## VERCEL DEPENDENCIES / CLOUDFLARE REPLACEMENTS

See audit section 3 (V1–V10) and section 8. In scope: V1/V2 (Blob → R2) — implemented behind the
switch. Recorded for later: Cron, OIDC, AI Gateway, Analytics, domain, `sharp`.

## CHANGED FILES / NEW FILES

Phases 2–3:

- new `lib/storage/types.ts`, `lib/storage/index.ts`, `lib/storage/r2.ts`, `lib/storage/vercel-blob.ts`
- new `lib/storage/storage.test.ts` (12 tests)
- new `scripts/migrate-vercel-blob-to-r2.ts` (+ `db:migrate-blob-to-r2` in `package.json`)
- new `docs/cloudflare-r2.md`
- `app/actions/receipts.ts` — upload / pipeline read / cancel use `lib/storage`; a failed file
  delete on cancel is now logged (`receipt_file_delete_failed`) instead of silently swallowed
- `app/api/receipts/[id]/image/route.ts` — reads via `lib/storage`
- `lib/db/schema.ts` — comment on `image_url` only (no schema change)
- `package.json`, `pnpm-lock.yaml` — `aws4fetch` 1.0.20 (MIT, no dependencies)
- `docs/08_OCR_RECEIPT_PIPELINE.md`, `docs/cloudflare-migration-architecture.md`, `docs/01_CURRENT_STATE.md`, `docs/07_CHANGELOG.md`

Phase 1: the `docs/cloudflare-migration-*.md` files.

## DATABASE CHANGES

None. `receipt_imports.image_url` now holds a storage reference (`https://…` = Blob, `r2:<key>` =
R2). The planned `storage_provider`/`storage_key` columns were deliberately not added: they would
require a migration before the deploy while production uploads are failing. Can be added later.

## NEW ENV VARIABLES

`STORAGE_PROVIDER` (`vercel` default | `r2`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. None are set anywhere yet.

## R2 BUCKETS

None created yet. Planned: `shopping-buddy-receipts` (production), `shopping-buddy-receipts-test`.

## UPLOAD FLOW / OCR FLOW

Unchanged apart from the storage call: validation (size, magic bytes, HEIC) → `putReceiptFile` →
row → pipeline reads via `getReceiptFile` → same OCR/structuring. No client-side compression exists
(audit section 11); none was added.

## BACKWARD COMPATIBILITY

Each row is read from the provider its reference names, so every old Blob receipt stays readable
(preview, OCR re-processing, cancel/delete) after new uploads switch to R2 — covered by a unit test.
Old receipts are readable only while the Blob store itself is readable.

## TESTS

After phases 2–3 (cloud session): `vitest run` → **799 passed** in 49 files (+12 storage tests);
the same 15 database-backed files as the baseline could not start without `TEST_DATABASE_URL`.
**The DB-backed receipt tests must be run locally (`pnpm test`) before merging.** `tsc` clean.

## BUILD

`next build` passes (placeholder auth/DB env values, as in the baseline).

## SECURITY

- Private bucket; no public URL is ever produced; files still reach the browser only through the
  household-authorized route with `private, no-store`.
- R2 credentials are server-only env vars, never logged; a test asserts the secret is not sent in
  any header.
- R2 keys are validated against `receipts/{uuid}/{uuid}.{jpg|png|webp|pdf}` on every write and read.
- Unknown `STORAGE_PROVIDER` fails loudly.

## STAGING STATUS / PRODUCTION STATUS / ROLLBACK STATUS

Not active. Rollback = unset `STORAGE_PROVIDER` (new uploads back to Blob) and, for copied
receipts, `pnpm db:migrate-blob-to-r2 --rollback <log>`. Blob originals are never deleted.

## REMAINING VERCEL USAGE

Everything except new receipt uploads once `STORAGE_PROVIDER=r2` is set; Blob stays for old
receipts until they are copied.

## KNOWN RISKS

- Not yet tested against a real R2 bucket (SigV4 signing is covered only by a stubbed `fetch`).
- DB-backed receipt tests not run in the cloud session.
- Old receipts are unreadable while the Blob store is suspended; the copy script needs it readable.
- Audit section 9 risks for the later phases.

## NEXT STEP

1. Owner: Cloudflare setup (`docs/cloudflare-r2.md`).
2. Run `pnpm test` locally; merge; deploy with `STORAGE_PROVIDER` unset.
3. Set the R2 env vars + `STORAGE_PROVIDER=r2`, redeploy, check upload/preview/OCR/cancel on a phone.
4. When Blob is readable: `pnpm db:migrate-blob-to-r2 --dry-run`, then without `--dry-run`.

## Phase checklist — Phases 2–3

- [x] changes are written in documentation
- [x] documentation matches the real state
- [x] changed files recorded
- [x] new environment variables recorded
- [x] DB changes recorded (none)
- [x] Cloudflare resources recorded (none yet)
- [x] tests recorded (incl. what was not run)
- [x] build recorded
- [x] risks recorded
- [x] rollback described
- [x] next step stated
- [ ] verified against a real R2 bucket — pending owner setup
