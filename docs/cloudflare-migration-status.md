# Cloudflare Migration — Status

**Last updated:** 2026-09-25
**Current phase:** Phase 1 (audit) **done** · Step 0 (Cloudflare agent setup) **blocked — needs user action**
**Production:** Vercel (unchanged). No Cloudflare resource has been created or changed.

| Phase | Status |
|---|---|
| 0. Cloudflare agent setup | ⛔ Blocked (see below) |
| 1. Audit | ✅ Done — `docs/cloudflare-migration-audit.md` |
| 2. Storage abstraction | ⏸ Not started (waiting for step 0 and owner decisions) |
| 3. Vercel Blob → R2 | ⏸ Not started |
| 4. Provider-neutral application | ⏸ Not started |
| 5. Cloudflare staging | ⏸ Not started |
| 6. Full testing | ⏸ Not started |
| 7. Production cutover | ⏸ Not started |
| 8. Rollback window | ⏸ Not started |
| 9. Remove Vercel | ⏸ Not started |

## CLOUDFLARE SETUP

Attempted 2026-09-25 from the Claude Code cloud session:

- `https://developers.cloudflare.com/agent-setup/prompt.md` — **not reachable**: the session's network
  egress policy denies `developers.cloudflare.com`.
- `https://api.cloudflare.com` — **not reachable** (same policy).
- No Cloudflare credentials in the environment (no `CLOUDFLARE_API_TOKEN` / account id); `wrangler`
  is not installed (it is installable from npm — the npm registry is reachable).
- Connection, capabilities, R2 access and deployment options are therefore **unverified**.

**Required user actions:**

1. In the cloud environment settings (environment menu in the session title bar → Edit → Network
   access), allow `developers.cloudflare.com`, `api.cloudflare.com` and `*.r2.cloudflarestorage.com`
   (or choose a broader access level).
2. Create a Cloudflare API token scoped to the target account (Workers Scripts: Edit, Workers R2
   Storage: Edit, Account Settings: Read; later Zone DNS: Edit for the cutover) and add it plus the
   account id to the environment's secrets as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   Do not paste the token into chat.
3. Upgrade the account to **Workers Paid** (20 crons, 300 s jobs and the bundle size need it — audit C4–C6).
4. Decide:
   - **PDF OCR auth** (audit C2): recommended self-signed JWT + GCP WIF with uploaded JWKS.
   - **Receipt structuring gateway** (audit V4): API key for Vercel AI Gateway, or Cloudflare AI Gateway.
   - **Custom domain** (audit V8/risk 2): which domain; recommended to put it in front of Vercel first.
   - Confirm that "HA/TUP" and "Product Profile / reject reason = reimport" from the brief do not
     apply to this project (audit section 11).

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

After the user actions: run the Cloudflare agent setup, verify R2 access with a throwaway staging
bucket, then start Phase 2 (storage abstraction with the Vercel Blob implementation only — no
behavior change).

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
