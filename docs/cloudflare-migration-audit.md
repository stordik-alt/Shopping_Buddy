# Cloudflare Migration — Phase 1 Audit

**Date:** 2026-09-25
**Scope:** `main` at `68b7760` (read-only audit — no application code, dependency, database or infrastructure change was made)
**Goal:** move production hosting from Vercel to Cloudflare with no planned downtime; Neon PostgreSQL stays.

> **Scope decision (owner, 2026-09-25): for now only Vercel Blob → Cloudflare R2 is migrated.**
> The app keeps running on Vercel and talks to R2 over R2's S3-compatible API. Everything else in
> this audit (hosting, crons, OIDC, AI Gateway, `sharp`, analytics, domain) is recorded for a later
> decision and is **not** current work.

Everything below was verified against the code and a local build, not taken from older docs.
Where the migration brief assumes something the code does not do, that is called out in
[section 11](#11-brief-vs-verified-code--discrepancies).

---

## 1. Application summary

| Area | Verified state |
|---|---|
| Framework | Next.js `16.3.3` (App Router), React 19, TypeScript `5.7.3` |
| Package manager | pnpm `12.3.4` |
| Build | `next build` — passes locally (with placeholder auth/DB env values; see [section 10](#10-baseline-tests-and-build)) |
| Runtime | Node.js runtime everywhere (no `export const runtime = 'edge'`). Vercel Functions. |
| Route protection | `proxy.ts` (Next 16 successor of `middleware.ts`) → Neon Auth `auth.middleware()` |
| Auth | Neon Auth (`@neondatabase/auth` `0.5.0-beta`, Better Auth based), cookie secret from env |
| Database | Neon PostgreSQL over HTTP (`@neondatabase/serverless` + `drizzle-orm/neon-http`), `lib/db/client.ts` |
| Storage | Vercel Blob (`@vercel/blob`), private access, receipts only |
| OCR | Google Cloud Vision (images: API key; PDFs: OAuth via Vercel OIDC → Google Workload Identity Federation), Azure Document Intelligence as fallback, PDF text layer via `unpdf` |
| Receipt structuring | AI SDK `generateObject` with model string `google/gemini-2.5-flash-lite` → **Vercel AI Gateway** |
| Image processing | `sharp` `0.35.3` (native) — OCR preparation copy only |
| Scheduled jobs | 20 Vercel Cron entries in `vercel.json` |
| Analytics | `@vercel/analytics` (`<Analytics />` in `app/layout.tsx`, production only) |
| Caching | No `unstable_cache` / `'use cache'` / `revalidateTag`. `revalidatePath('/')` in server actions. `/` and `/invite/[token]` are `force-dynamic`. `images.unoptimized: true`. |
| Background processing | None beyond crons. The receipt pipeline runs synchronously inside `processUploadedReceiptAction`. |

## 2. Routes and server actions

**Route handlers** (`app/api/**/route.ts`):

| Route | Purpose | Notes for Cloudflare |
|---|---|---|
| `/api/auth/[...path]` | Neon Auth handler | Neon Auth trusted origins must include the Cloudflare hostname(s) |
| `/api/cron/shopping-reminders` | daily cron | `CRON_SECRET` bearer auth |
| `/api/cron/pantry-checkin` | daily cron | same |
| `/api/cron/import-stores` | weekly OSM import | `maxDuration = 300` |
| `/api/cron/ingest-prices` | all stores (manual) | `maxDuration = 300` |
| `/api/cron/ingest-prices/[source]` | one store | `maxDuration = 300` |
| `/api/cron/ingest-prices/[source]/[run]` | alias for extra daily runs | `maxDuration = 300` |
| `/api/receipts/[id]/image` | streams a household's own receipt file | reads Vercel Blob with `get(url, { access: 'private' })` |
| `/api/receipts/[id]/status` | polled pipeline status | DB only |

**Server actions** (`'use server'`): `app/actions/{budget,household,meal-plan,notifications,pantry,product-search,purchases,receipts,shopping-plan,shopping,store-preferences}.ts`. Only `receipts.ts` touches storage.

`proxy.ts` matcher excludes `api/auth`, `api/cron`, `auth/`, `invite/`, `intro/`, `brand/`, the manifest and static assets.

## 3. Vercel dependency inventory

Searched for: `@vercel/*`, `vercel.json`, `BLOB_READ_WRITE_TOKEN`, `VERCEL_`, `vercel`, `put(`, `get(`, `del(`, `list(`, `head(`, OIDC, AI Gateway, analytics, headers, `maxDuration`.

| # | Current Vercel dependency | Where | Cloudflare replacement | Priority | Risk | Status |
|---|---|---|---|---|---|---|
| V1 | **`@vercel/blob`** — `put` (upload), `get` (pipeline read + image route), `del` (cancel) | `app/actions/receipts.ts:3,428,671,834`, `app/api/receipts/[id]/image/route.ts:1,18`; tests mock it via `test/fake-blob.ts` | **R2** behind a provider-neutral `lib/storage/` layer (R2 binding on Workers, or S3 API + presigned URLs) | P1 (first real migration) | Medium — existing rows store the full Blob URL in `receipt_imports.image_url`; old files must stay readable | Not started |
| V2 | **`BLOB_READ_WRITE_TOKEN`** (implicit — read by `@vercel/blob`, never referenced in app code) | Vercel project env | R2 binding (no token) or `R2_*` S3 credentials | P1 | Low | Not started |
| V3 | **`@vercel/oidc`** — `getVercelOidcToken()` as the subject token for Google Workload Identity Federation (PDF OCR via `files:annotate`) | `lib/receipts.ts:3,134` | No Cloudflare equivalent of a platform-issued OIDC token. Options in [section 7](#7-cloudflare-compatibility-issues) (C2). | P1 — **blocks PDF OCR on Cloudflare** | **High** | Needs owner decision |
| V4 | **Vercel AI Gateway** — `generateObject({ model: 'google/gemini-2.5-flash-lite' })`. The bare string model goes to the AI Gateway, which on Vercel authenticates with the deployment's OIDC token; no `AI_GATEWAY_API_KEY` is referenced in code | `lib/receipts.ts:331,340` | Keep Vercel AI Gateway with an `AI_GATEWAY_API_KEY` secret (works from any host), **or** Cloudflare AI Gateway in front of Google AI Studio (`@ai-sdk/google`). Either stays inside CLAUDE.md §30's OCR-only exception | P2 | Medium — structuring fails without auth, so every photo import fails at parsing | Needs owner decision |
| V5 | **Vercel Cron** — 20 entries | `vercel.json`; `lib/ingestion/cron-schedule.test.ts` reads `vercel.json` | Workers **Cron Triggers** in `wrangler.jsonc` + a `scheduled()` handler that calls the same route logic with `CRON_SECRET` | P2 | Medium — Workers Free allows 5 cron triggers per account; 20 need Workers Paid (or consolidating to one trigger that dispatches by time). The schedule test must learn the new source of truth | Not started |
| V6 | **`maxDuration = 300`** (Vercel Functions limit) | 4 cron routes | Workers: wall time is not the limit for I/O; **CPU time** is (Paid: default 30 s, configurable up to 5 min; Cron Triggers up to 15 min wall). Workers Free (10 ms CPU) cannot run this app | P2 | Medium — ingestion parses large JSON/XML (Lidl sitemap gunzip ~ CPU heavy); needs measurement on staging | Not started |
| V7 | **`@vercel/analytics`** | `app/layout.tsx:1,43` | Cloudflare Web Analytics (beacon script / automatic on proxied zone) or remove | P3 | Low — the component only reports to `/_vercel/insights`, which does not exist off Vercel | Not started |
| V8 | **Production domain** `shopping-with-buddy.vercel.app` (from changelog) | Neon Auth trusted origins, users' bookmarks / installed PWA | A custom domain on Cloudflare (a `*.vercel.app` hostname cannot be moved). The installed PWA's start URL is tied to the origin | P3 (cutover) | **High** for users — changing origin logs everyone out and orphans installed PWAs unless a custom domain is introduced first | Needs owner decision |
| V9 | Vercel-hosted env vars (`vercel env pull` workflow in docs) | docs, local workflow | `wrangler secret put` / `.dev.vars` | P2 | Low | Not started |
| V10 | `.vercel/project.json` link (local, gitignored) | developer machine | — | P4 | None | — |

Not found (verified absent): `@vercel/functions`, `@vercel/kv`, `@vercel/postgres`, `@vercel/edge-config`, `@vercel/og`, `x-vercel-*` header reads, `VERCEL_ENV`/`VERCEL_URL` reads, `vercel.json` rewrites/headers/redirects, Edge runtime routes, ISR/`revalidate` exports.

**`put(` / `get(` / `del(` / `list(` / `head(`:** only the `@vercel/blob` calls above plus `test/fake-blob.ts`. `list` and `head` are not used by the app.

## 4. Environment variables

Names only — no values are recorded here.

| Variable | Used by | Cloudflare handling |
|---|---|---|
| `DATABASE_URL` | `lib/db/client.ts` (Neon HTTP) | secret |
| `DATABASE_URL_UNPOOLED` | migrations / scripts | local/CI only |
| `TEST_DATABASE_URL`, `TEST_DATABASE_URL_UNPOOLED` | `test/setup-test-database.ts` | local/CI only |
| `NEON_AUTH_BASE_URL` | `lib/auth/server.ts` | var |
| `NEON_AUTH_COOKIE_SECRET` | `lib/auth/server.ts` | secret |
| `CRON_SECRET` | 4 cron route files | secret (also used by the `scheduled()` handler) |
| `GOOGLE_VISION_API_KEY` | image OCR | secret |
| `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `GCP_SERVICE_ACCOUNT_EMAIL` | PDF OCR (WIF) | vars; the WIF provider itself must change (C2) |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY` | OCR fallback | var + secret |
| `BLOB_READ_WRITE_TOKEN` | implicit (`@vercel/blob`) | kept during dual/rollback window only |
| `VERCEL_OIDC_TOKEN` | implicit (`@vercel/oidc`, AI Gateway) | none on Cloudflare — see V3/V4 |
| `USE_REAL_BLOB` | tests only | tests only |
| `NODE_ENV` | analytics toggle | set by build |

New variables expected later (not added yet): `STORAGE_PROVIDER`, R2 binding name (e.g. `RECEIPTS_BUCKET`) and/or `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`; `AI_GATEWAY_API_KEY` (or the Cloudflare AI Gateway equivalent).

## 5. Storage audit (receipts)

**Only receipts use file storage.** Flow today:

```text
Phone (camera: accept="image/jpeg" capture; gallery/PDF input)
  │  HEIC rejected client-side (isHeicFile)
  │  File sent as-is in FormData — NO client-side compression
  ▼
uploadReceiptAction (server action, 15 MB body limit)
  │  size ≤ 10 MB raw, type from magic bytes (detectReceiptFileType)
  │  put('receipts/{householdId}/{uuid}.{ext}', buffer, { access: 'private', contentType })
  ▼
Vercel Blob (private)          receipt_imports.image_url = full private Blob URL
  ▼
processUploadedReceiptAction → runReceiptPipeline
  │  get(image_url, { access: 'private' }) → Buffer
  │  sharp: OCR copy (rotate, grayscale, resize, contrast) — best-effort; stored original untouched
  │  PDF: unpdf text layer first, else Google Vision files:annotate (OIDC)
  │  image: Google Vision images:annotate (API key); Azure fallback
  │  AI Gateway structuring → validation → review / purchase
  ▼
/api/receipts/[id]/image → get(...) stream, Cache-Control: private, no-store, nosniff
cancelReceiptImportAction → del(image_url) best-effort
```

- **Key layout:** `receipts/{householdId}/{uuid}.{jpg|png|webp|pdf}`. Keyed by **household**, not user — correct for this household-centric app (CLAUDE.md §10); keep it for R2.
- **DB:** `receipt_imports.image_url text` holds the full Blob URL. It is **not** an expiring URL (private Blob URLs are stable; access requires the token), so the "expiring URL in DB" risk does not exist today. There are no `storage_provider`, `storage_key`, `mime_type`, `file_size`, `original_filename` columns. MIME type is re-detected from bytes on every read; the extension in the URL is the fallback (`mimeTypeFromExtension`).
- **Authorization:** `lib/receipt-access.ts` resolves the household server-side and returns 404 for anything not owned — the R2 path must keep using it.
- **Security today:** private storage, magic-byte type detection, 10 MB cap, no client-trusted MIME, `no-store` + `nosniff` on reads. Good baseline to preserve.

## 6. Base64 audit

| Path | Base64? | Verdict |
|---|---|---|
| File → server action | **No** (fixed 2026-09-25: binary `File` in `FormData`; earlier base64 argument caused "Maximum array nesting exceeded" / React #441) | Keep |
| Storage → pipeline | No — `Buffer` from the Blob stream | Keep (R2 returns a stream/ArrayBuffer too) |
| Pipeline → Google Vision / Azure | **Yes** — `ocrInput.base64` (`app/actions/receipts.ts:448,453`). Google Vision's JSON API requires base64 `content` | Necessary; lives only server-side, never in React state or a client payload |
| PDF text layer | Base64 → back to bytes (`lib/receipt-pdf.ts:39`, `readPdfTextLayer(base64)`) | Wasteful round-trip (one extra ~13 MB string for a 10 MB PDF). Safe to change to accept a `Uint8Array`, but only with the existing PDF tests — optional, memory-relevant on Workers (128 MB isolate) |
| Base64 → React state / JSON to client | Not found | — |

## 7. Cloudflare compatibility issues

Target runtime: **OpenNext for Cloudflare** (`@opennextjs/cloudflare` `1.20.6`, peer `next >=16.3.3` → supported) on Workers with `nodejs_compat`, `wrangler` `^4.125`.

| # | Issue | Impact | Recommended approach |
|---|---|---|---|
| C1 | **`sharp` is a native module** and does not run on Workers (`lib/receipt-image.ts`) | Bundling/loading fails, or the OCR prep step always fails. Prep is best-effort (original is sent on failure), but the *import* of `sharp` itself must not break the Worker | Load `sharp` lazily and fall back to "no prep" on Cloudflare **as a first step** (behavior = today's failure path, documented). Then evaluate Cloudflare Images binding (`env.IMAGES` transform: rotate, grayscale, resize) vs. a WASM library, and **compare OCR accuracy on the real receipt set before switching**. Needs a test that pins the fallback |
| C2 | **Vercel OIDC for Google WIF** (PDF OCR) | PDF files without a text layer (scans) cannot be OCRed on Cloudflare | Options: (a) Worker signs its own short-lived JWT with a private key stored as a Worker secret, and a GCP WIF OIDC provider trusts that issuer via an **uploaded JWKS** (no service-account key; compatible with `iam.disableServiceAccountKeyCreation`); (b) render PDF pages to images and use the existing API-key `images:annotate` path; (c) Azure Document Intelligence (key-based, already integrated) as the PDF route. (a) keeps behavior identical. **Owner decision required** |
| C3 | Vercel AI Gateway auth (V4) | Parsing fails → every photo import fails | Add `AI_GATEWAY_API_KEY` secret (minimal change) or move to Cloudflare AI Gateway |
| C4 | CPU limits (V6) | Free plan unusable; Paid default 30 s CPU per request | **Workers Paid required.** Set `limits.cpu_ms` and measure ingestion parts on staging; split parts further if needed |
| C5 | 20 cron entries (V5) | Free: 5 triggers | Workers Paid, or one trigger with in-code dispatch |
| C6 | Worker bundle size (Paid: 10 MB compressed) | Next + Neon Auth + AI SDK + unpdf (pdf.js) may be large | Measure with `opennextjs-cloudflare build`; `unpdf` ships a serverless pdf.js build, but confirm |
| C7 | Memory: 128 MB per isolate | 10 MB upload → Buffer + base64 copies (~13 MB each) + pdf.js | Fits, but trim the PDF base64 round-trip (section 6); keep the 10 MB cap |
| C8 | `revalidatePath` / Next cache | OpenNext needs an incremental cache + tag cache to honor revalidation; pages here are dynamic | Configure OpenNext with R2 incremental cache (or none) and verify that `revalidatePath('/')` still refreshes after actions |
| C9 | `node:zlib` `gunzipSync` (Lidl), `node:crypto` `randomBytes` | Supported under `nodejs_compat` | Verify on staging |
| C10 | `proxyClientMaxBodySize` / `bodySizeLimit` 15 MB | Workers accept up to 100 MB request bodies | Verify that OpenNext honors both Next settings |
| C11 | Neon Auth | Trusted origins list must include the staging and production Cloudflare origins; cookies are per-origin | Add origins in Neon Console before staging auth tests |
| C12 | Neon HTTP driver | Works on Workers (fetch-based) | None |
| C13 | Scripts (`scripts/*.ts`, `lib/db/migrate.ts`) use `node:fs` | CLI only, not deployed | None |
| C14 | Cloudflare network access from this development environment | `developers.cloudflare.com` and `api.cloudflare.com` are blocked by the cloud session's egress policy; no Cloudflare credentials present | See status doc — user action |

## 8. Recommended Cloudflare alternatives (summary)

| Vercel | Cloudflare |
|---|---|
| Vercel Functions / hosting | Workers + OpenNext (`@opennextjs/cloudflare`) |
| Vercel Blob | R2 (private bucket; Worker binding for server reads/writes; S3 presigned URLs only if direct browser upload is adopted) |
| Vercel Cron | Workers Cron Triggers |
| Vercel Analytics | Cloudflare Web Analytics |
| Vercel OIDC → GCP | Self-issued JWT + GCP WIF with uploaded JWKS (recommended), or Azure/API-key alternatives |
| Vercel AI Gateway (OIDC auth) | Same gateway with API key, or Cloudflare AI Gateway |
| `*.vercel.app` domain | Custom domain on a Cloudflare zone |
| Vercel env | Wrangler secrets / vars, `.dev.vars` locally |

## 9. Risks

1. **PDF OCR regression** (C2) — highest functional risk; needs a decision before staging.
2. **Origin change** (V8) — logs everyone out and breaks installed PWAs unless a custom domain is put in front of Vercel *first*, then moved to Cloudflare. Recommended: introduce the custom domain on Vercel now; the later cutover is then a DNS switch with no origin change.
3. **OCR quality** if `sharp` prep is replaced (C1) — must be measured, not assumed.
4. **Cost/plan** — Workers Paid is a prerequisite (C4, C5).
5. **Old receipts** — every existing `image_url` is a Vercel Blob URL; Blob must stay readable until the copy script has verified every object.
6. **Test coverage gap in this environment** — 15 database-backed test files (including all receipt storage tests) need `TEST_DATABASE_URL`, which is not available in the cloud session.

## 10. Baseline tests and build

Run on 2026-09-25 in the cloud session, before any change:

| Check | Result |
|---|---|
| `vitest run` (no `.env.local`, no test DB) | **48 files passed, 787 tests passed; 15 files failed to start** — all 15 are database-backed and fail only with "No database connection string was provided" (expected: `TEST_DATABASE_URL` absent by design, see `test/setup-test-database.ts`) |
| `tsc --noEmit` | clean |
| `next build` without env | fails collecting page data: Neon Auth requires `NEON_AUTH_COOKIE_SECRET` at module load |
| `next build` with placeholder `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` / `DATABASE_URL` | **passes** (all routes compiled; Proxy present) |

## 11. Brief vs. verified code — discrepancies

The migration brief contains requirements that do not match this codebase. They are recorded here instead of being implemented blindly (CLAUDE.md §2, §37):

| Brief says | Verified code |
|---|---|
| "Photo must be compressed before upload" | **No client-side compression exists.** The phone uploads the original (≤ 10 MB). `sharp` only makes a separate OCR copy on the server; the stored original is never modified. Adding compression would be a new feature, not a migration step |
| Storage key `receipts/{userId}/{receiptId}/…` | Keys and authorization are per **household** (`receipts/{householdId}/{uuid}.ext`). Recommend `receipts/{householdId}/{receiptImportId}/original.{ext}` for R2 |
| "Pending approval → Product Profile → assignment → recalculation" | No "Product Profile" entity. The closest real flow is receipt review (`pending_review` → `confirmReceiptReviewAction`). Regression tests will cover that real flow |
| "Reimport with reject reason = reimport" | No reject-reason field. Real behavior: a failed/reviewed import can be **re-processed** from the stored file (`processUploadedReceiptAction`, stale-claim logic) and cancelled (`cancelReceiptImportAction`) |
| "Preview / download / delete" | Preview and download are the same route (`/api/receipts/[id]/image`); delete = cancel of an import without a purchase |
| DB should store `storage_provider`, `storage_key`, `mime_type`, `file_size`, `original_filename` | None exist. `storage_provider` + `storage_key` are needed for dual-provider reads; the rest are optional (MIME is re-detected from bytes). A migration will be proposed in Phase 2/3 |

## 12. Recommended migration order

1. **User actions** (status doc): Cloudflare account on Workers Paid, API token, allow Cloudflare hosts in this environment's network policy; decide C2, V4, V8.
2. **Custom domain** in front of Vercel (removes the origin-change risk before anything else).
3. **Phase 2 — storage abstraction** `lib/storage/` with a Vercel Blob implementation only; no behavior change; tests via the existing fake.
4. **Phase 3 — R2** implementation + migration adding `storage_provider`/`storage_key` (backfill `vercel_blob` from `image_url`); `STORAGE_PROVIDER=vercel|r2|dual`.
5. Copy script `scripts/migrate-vercel-blob-to-r2.ts` (`--dry-run`, idempotent, verifies size + SHA-256 before updating the row, never deletes).
6. Cloudflare-portable runtime: lazy `sharp` fallback, OIDC replacement, AI Gateway auth, analytics.
7. OpenNext config + `wrangler.jsonc` (R2 binding, crons, secrets) → **staging** Worker on a separate hostname, separate R2 bucket, Neon test branch.
8. Full regression on staging (section 24 list of the brief, adapted per section 11 here).
9. Production Worker → DNS cutover with Vercel kept as rollback → rollback window → Vercel removal.
