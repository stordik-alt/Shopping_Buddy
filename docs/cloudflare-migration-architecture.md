# Cloudflare Migration — Target Architecture

**Status:** the interim target (storage layer + R2) is implemented (R2 default for new uploads, `STORAGE_PROVIDER=vercel` = rollback) and
documented in `docs/cloudflare-r2.md`; the full target below is proposed only. It follows from
`docs/cloudflare-migration-audit.md`; update this file whenever a decision changes it.

> **Current scope (owner decision, 2026-09-25): only Vercel Blob → R2.** The near-term target is
> the "Interim" diagram below; the full "Target" is the long-term plan.

## Interim target (current scope)

```text
Vercel ── Next.js 16 (unchanged)
        ├── lib/storage/ ──► R2 (S3-compatible API, private bucket)      new uploads
        │               └──► Vercel Blob                                 old receipts / rollback
        └── everything else unchanged (cron, OIDC, AI Gateway, analytics, domain)
```

On Vercel there is no R2 binding, so `lib/storage/r2.ts` signs S3 requests with `aws4fetch` using
the `R2_*` credentials (server-only). `aws4fetch` was chosen over `@aws-sdk/client-s3`: it only signs
`fetch` requests (no dependencies) and also runs on Workers. A Worker binding can be added later if
hosting moves.

**Implemented differently from the design below (2026-09-25):** no `storage_provider`/`storage_key`
columns and no `dual` mode. `image_url` holds a storage reference (`https://…` = Blob, `r2:<key>` =
R2), so the switch needed no migration while production uploads were failing, and a second copy to
the over-quota Blob store would fail anyway. The section below is kept as the original design.

## Current (production)

```text
Browser / installed PWA (shopping-with-buddy.vercel.app)
        │
Vercel ── Next.js 16 (Node.js functions, proxy.ts)
        ├── Vercel Blob (private)         receipts/{householdId}/{uuid}.{ext}
        ├── Vercel Cron (20 entries)      → /api/cron/*  (CRON_SECRET)
        ├── Vercel OIDC ──► Google WIF ──► Vision files:annotate (PDF OCR)
        ├── Vercel AI Gateway (OIDC auth) ──► gemini-2.5-flash-lite (receipt structuring)
        └── Vercel Analytics
        │
Neon PostgreSQL + Neon Auth        Google Vision (API key) · Azure DI (fallback)
```

## Target

```text
Browser / installed PWA (custom domain on a Cloudflare zone)
        │
Cloudflare ── WAF / proxy / DNS
        │
Worker ── OpenNext for Cloudflare (Next.js 16, nodejs_compat)
        ├── R2 binding (private bucket)   receipts/{householdId}/{receiptImportId}/original.{ext}
        ├── Cron Triggers → scheduled() → same cron logic (CRON_SECRET)
        ├── self-signed JWT ──► Google WIF (uploaded JWKS) ──► Vision files:annotate   [pending decision]
        ├── AI Gateway with API key (Vercel's or Cloudflare's)                        [pending decision]
        ├── OCR image prep: Cloudflare Images binding or none                          [pending measurement]
        └── Cloudflare Web Analytics
        │
Neon PostgreSQL + Neon Auth (unchanged; trusted origins extended)
```

## Storage abstraction (Phase 2 design)

The application must not call `@vercel/blob` or R2 directly. One module owns storage:

```text
lib/storage/
├── types.ts        ReceiptStorage interface, StorageProvider = 'vercel_blob' | 'r2'
├── storage.ts      getReceiptStorage() — reads STORAGE_PROVIDER, returns the right implementation;
│                   readers pick the implementation from the row's storage_provider, not from env
├── vercel-blob.ts  current behavior, moved unchanged
└── r2.ts           R2 binding (Workers) / S3 API (Node, scripts)
```

Interface (server-only; household ownership is checked by the caller via `lib/receipt-access.ts`
before any call):

```ts
interface ReceiptStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<{ provider: StorageProvider; key: string; size: number }>
  get(key: string): Promise<{ body: ReadableStream; contentType: string; size: number } | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

The brief's `createUploadUrl()` / `createDownloadUrl()` (presigned URLs) are **deferred**: today the
file goes through the server action (type/size checked on the bytes) and is streamed back through
an authorized route. Presigned direct upload would move validation after the upload and is not
needed for the 10 MB cap. Revisit only if Worker memory/CPU on uploads proves to be a problem.

### Provider switch

| `STORAGE_PROVIDER` | New uploads | Reads |
|---|---|---|
| `vercel` (default until cutover) | Vercel Blob | by row's `storage_provider` |
| `dual` | R2 first, then Vercel Blob (rollback copy); row = `r2` | R2; if the R2 object is missing, Blob copy |
| `r2` | R2 only | by row's `storage_provider` (old `vercel_blob` rows still read from Blob until copied) |

### Database change (planned, Phase 3 migration)

Add to `receipt_imports` (nullable, additive, no data loss):

- `storage_provider text` — `'vercel_blob' | 'r2'`, check constraint
- `storage_key text`

Backfill: rows with `image_url` → `storage_provider = 'vercel_blob'`, `storage_key` = pathname of the
URL. `image_url` stays until Vercel removal (rollback path). `mime_type`/`file_size` are optional —
MIME is re-detected from bytes today; decide during Phase 3.

## Runtime portability items

| Item | Plan |
|---|---|
| `sharp` | **Prepared** (branch `cloudflare-migration-prep`): the Cloudflare build aliases `sharp` to a throwing shim; the pipeline sends the original photo. Replacement measured on real receipts before adoption |
| OIDC → GCP | **Prepared**: `lib/gcp-oidc.ts` — `GCP_OIDC_TOKEN_SOURCE=vercel` (default) or `self-signed` |
| AI Gateway | **Prepared**: `AI_GATEWAY_API_KEY` (no code change) |
| Crons | **Prepared**: `wrangler.jsonc` triggers + `cloudflare/worker.ts` `scheduled()`; `vercel.json` stays the job list, `cloudflare/cron.test.ts` keeps both in step |

## Environments

| | Vercel | Cloudflare |
|---|---|---|
| Production | current | after cutover |
| Staging | Vercel Preview | separate Worker + hostname, separate R2 bucket, Neon **test branch** |

Rollback: DNS back to Vercel; Vercel keeps reading Blob. Anything uploaded to R2 during the
Cloudflare period is readable from Vercel only if the Vercel deployment already has the R2-aware
storage layer — so **the storage layer ships to Vercel first**, and `dual` mode is on during the
rollback window.
