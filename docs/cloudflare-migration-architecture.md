# Cloudflare Migration — Target Architecture

**Status:** proposed (2026-09-25). Nothing here is implemented yet. It follows from
`docs/cloudflare-migration-audit.md`; update this file whenever a decision changes it.

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
| `sharp` | Lazy import; on failure the pipeline already sends the original. Replacement measured on real receipts before adoption |
| OIDC → GCP | Replace `getVercelOidcToken()` with a pluggable subject-token source: Vercel OIDC on Vercel, self-signed JWT on Cloudflare |
| AI Gateway | Explicit provider/API key so it does not depend on Vercel's OIDC |
| Crons | `wrangler.jsonc` triggers generated from / checked against `PRICE_SOURCES` (like `cron-schedule.test.ts` does for `vercel.json`) |

## Environments

| | Vercel | Cloudflare |
|---|---|---|
| Production | current | after cutover |
| Staging | Vercel Preview | separate Worker + hostname, separate R2 bucket, Neon **test branch** |

Rollback: DNS back to Vercel; Vercel keeps reading Blob. Anything uploaded to R2 during the
Cloudflare period is readable from Vercel only if the Vercel deployment already has the R2-aware
storage layer — so **the storage layer ships to Vercel first**, and `dual` mode is on during the
rollback window.
