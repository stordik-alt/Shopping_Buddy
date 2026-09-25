# Cloudflare Migration — Status

**Last updated:** 2026-09-25
**Current phase:** Phase 1 (audit) **done** · Step 0 (Cloudflare agent setup) **blocked — needs user action**
**Production:** Vercel (unchanged). No Cloudflare resource has been created or changed.

> **Current scope (owner decision, 2026-09-25): only Vercel Blob → Cloudflare R2.** The application
> stays hosted on Vercel and uses R2 through its S3-compatible API (`@aws-sdk/client-s3`,
> server-side only, private bucket). Hosting, crons, OCR auth, AI Gateway, analytics and DNS are
> out of scope for now — phases 5–9 below are the long-term plan, not scheduled work.

| Phase | Status |
|---|---|
| 0. Cloudflare agent setup | ⛔ Blocked (see below) |
| 1. Audit | ✅ Done — `docs/cloudflare-migration-audit.md` |
| 2. Storage abstraction | ⏸ Not started (waiting for step 0) |
| 3. Vercel Blob → R2 | ⏸ Not started |
| 4. Provider-neutral application | — Out of current scope (storage part is covered by phases 2–3) |
| 5. Cloudflare staging | — Out of current scope |
| 6. Full testing | — Out of current scope |
| 7. Production cutover | — Out of current scope |
| 8. Rollback window | — Out of current scope |
| 9. Remove Vercel | — Out of current scope |

## CLOUDFLARE SETUP

Attempted 2026-09-25 from the Claude Code cloud session:

- `https://developers.cloudflare.com/agent-setup/prompt.md` — **not reachable**: the session's network
  egress policy denies `developers.cloudflare.com`.
- `https://api.cloudflare.com` — **not reachable** (same policy).
- No Cloudflare credentials in the environment (no `CLOUDFLARE_API_TOKEN` / account id); `wrangler`
  is not installed (it is installable from npm — the npm registry is reachable).
- Connection, capabilities, R2 access and deployment options are therefore **unverified**.

**Required user actions (for the Blob → R2 scope):**

1. In the cloud environment settings (environment menu in the session title bar → Edit → Network
   access), allow `developers.cloudflare.com`, `api.cloudflare.com` and `*.r2.cloudflarestorage.com`
   (or choose a broader access level).
2. In the Cloudflare dashboard create two **private** R2 buckets (production and staging/test) and
   an R2 API token (Object Read & Write, limited to those buckets). Add `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME` to the environment's secrets
   (and later to Vercel's env). Do not paste the values into chat.
3. Workers Paid is **not** needed for this scope (R2 has its own pricing with a free tier).

## CURRENT STATE

Vercel hosts everything; see audit section 1. No migration code exists yet.

## VERCEL DEPENDENCIES / CLOUDFLARE REPLACEMENTS

See audit section 3 (V1–V10) and section 8. Summary: Blob → R2, Cron → Cron Triggers,
OIDC → self-signed JWT (pending), AI Gateway OIDC auth → API key (pending), Analytics → Web
Analytics, `*.vercel.app` → custom domain; plus `sharp` (not Vercel-specific, but not Workers-compatible).

## CHANGED FILES / NEW FILES

Phase 1 (documentation only):

- new `docs/cloudflare-migration-audit.md`
- new `docs/cloudflare-migration-architecture.md`
- new `docs/cloudflare-migration-status.md`
- new `docs/cloudflare-migration-brief.md` (owner's original brief, with the scope note; requirements that do not belong to this app removed)
- `docs/07_CHANGELOG.md` (entry)

No application code, dependency or configuration changed.

## DATABASE CHANGES

None. Planned (Phase 3): `receipt_imports.storage_provider`, `receipt_imports.storage_key` — see
architecture doc.

## NEW ENV VARIABLES

None yet. Planned: `STORAGE_PROVIDER`, R2 binding / `R2_*`, `AI_GATEWAY_API_KEY` (or equivalent),
JWT signing key for GCP WIF (if chosen).

## R2 BUCKETS

None created. Planned: one private bucket for production, one for staging.

## UPLOAD FLOW / OCR FLOW

Unchanged — documented in audit section 5. Note: there is no client-side compression today.

## BACKWARD COMPATIBILITY

Not applicable yet. Plan: rows keep `image_url`; reads dispatch on `storage_provider`.

## TESTS

Baseline (2026-09-25, before any change): `vitest run` → 787 tests passed in 48 files; 15
database-backed files could not start without `TEST_DATABASE_URL` (not available in the cloud
session). `tsc --noEmit` clean.

## BUILD

`next build` passes with placeholder auth/DB env values; fails without `NEON_AUTH_COOKIE_SECRET`
(module-load check in Neon Auth — pre-existing, not migration-related).

## SECURITY

No change. Current baseline recorded in audit section 5 (private storage, magic-byte detection,
10 MB cap, server-side household authorization, `no-store`).

## STAGING STATUS / PRODUCTION STATUS / ROLLBACK STATUS

Not started. Vercel remains the only production and the rollback target.

## MIGRATION STATUS

Phase 1 complete. Blocked on step 0 (user actions above).

## REMAINING VERCEL USAGE

All of it (V1–V10 in the audit).

## KNOWN RISKS

Audit section 9: PDF OCR auth, origin change for users/PWA, OCR quality if `sharp` is replaced,
Workers Paid prerequisite, old Blob receipts, DB tests not runnable in the cloud session.

## NEXT STEP

After the user actions: run the Cloudflare agent setup, verify R2 access with the staging bucket,
then start Phase 2 (storage abstraction with the Vercel Blob implementation only — no behavior
change), followed by Phase 3 (R2 implementation, `storage_provider`/`storage_key` migration,
`STORAGE_PROVIDER=vercel|dual|r2`, copy script with `--dry-run`).

Decisions recorded for later (not needed for the R2 scope): PDF OCR auth without Vercel OIDC
(audit C2), AI Gateway auth (V4), custom domain (V8), `sharp` on Workers (C1).

## Phase checklist — Phase 1

- [x] changes are written in documentation
- [x] documentation matches the real state
- [x] changed files recorded
- [x] new environment variables recorded (none)
- [x] DB changes recorded (none)
- [x] Cloudflare resources recorded (none)
- [x] tests recorded
- [x] build recorded
- [x] risks recorded
- [x] rollback described (nothing to roll back; Vercel untouched)
- [x] next step stated
