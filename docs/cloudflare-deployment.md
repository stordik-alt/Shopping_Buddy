# Cloudflare Production — Deployment and Historical Preparation Notes

**Current production:** Cloudflare Workers/OpenNext, per owner confirmation on 2026-10-17. Vercel is no longer used at all (owner decision of 2026-10-21): the project is being removed from Vercel, including its environment variables, and nothing in the deployment path reads from it. This document contains a historical preparation snapshot as well as current configuration references; its old test results are not a fresh verification of production.

The Worker is the production application host. Receipt files use Cloudflare R2 (`docs/cloudflare-r2.md`); this is separate from the OpenNext application runtime.

## 1. What is prepared

| File | Purpose |
|---|---|
| `open-next.config.ts` | OpenNext config. Next's data cache (and the few prerendered pages) lives in the R2 bucket `shopping-buddy-next-cache`, so `unstable_cache` in `lib/db/cached-reads.ts` works as on Vercel (see "Data cache" below). Global catalog caches also use Next cache tags for explicit invalidation after successful ingestion or catalog mutations; no queue or Durable Object is required |
| `wrangler.jsonc` | Worker `shopping-buddy` plus `env.staging` (`shopping-buddy-staging`, no crons). Each has its own data-cache bucket (`NEXT_INC_CACHE_R2_BUCKET`). Also sets `nodejs_compat`, `STORAGE_PROVIDER=r2`, `limits.cpu_ms` 300000, logs, and the 26 cron triggers |
| `cloudflare/worker.ts` | Worker entry: OpenNext's `fetch` plus a `scheduled()` handler for Cron Triggers |
| `cloudflare/cron.ts` | Maps a fired cron expression to its path(s) in `vercel.json`, which stays the one list of jobs. Calls the route with `Authorization: Bearer $CRON_SECRET`, like Vercel Cron |
| `cloudflare/shims/sharp.js` | Throwing stand-in for `sharp` in the Cloudflare build only (see §6) |
| `lib/gcp-oidc.ts` | Subject token for Google WIF (PDF OCR): `GCP_OIDC_TOKEN_SOURCE=vercel` (default, as before) or `self-signed` (see §5) |
| `scripts/generate-gcp-oidc-key.ts` | `pnpm gcp:oidc-key`: key pair for the self-signed token |
| `next.config.mjs` | With `BUILD_TARGET=cloudflare` only: aliases `sharp` to the shim, keeps `pg-cloudflare` in `serverExternalPackages` so OpenNext includes its `workerd` export, and sets `ANALYTICS_PROVIDER=none`; `pg` remains the real driver for Hyperdrive |
| `app/layout.tsx` | Vercel Analytics is not rendered when `ANALYTICS_PROVIDER=none` |
| `.dev.vars.example` | Every variable the Worker needs (names only) |
| `package.json` | `cf:build`, `cf:preview`, `cf:deploy:staging`, `cf:deploy`, `gcp:oidc-key`; devDependencies `@opennextjs/cloudflare` 1.20.6, `wrangler` 4.138.0 |
| `pnpm-workspace.yaml` | Allows workerd's postinstall (binary check) |
| `.gitignore`, `tsconfig.json`, `vitest.config.mts` | Ignore `.open-next/`, `.wrangler/`, `.dev.vars`, the GCP key files |

**Vercel references:** the following notes describe the historical transition from Vercel and should not be used as current production deployment instructions.

## 2. Verified on 2026-09-25

Checked in the cloud session, with placeholder secrets and no Cloudflare account.

| Check | Result |
|---|---|
| `pnpm cf:build` (OpenNext build) | ✅ passes. Before the `sharp` alias it failed: `No loader is configured for ".node" files` (sharp's native addon) |
| Worker size (`wrangler deploy --dry-run`) | 18.8 MB raw / **4.2 MB gzip**: within Workers **Paid** (10 MB), over Free (3 MB) |
| `wrangler dev` (local workerd) | `/intro`, `/auth/sign-in`, `/manifest.webmanifest`, `/brand/*` → 200. A signed-out API request → 307 to sign-in (`proxy.ts` runs). A cron route with no or a wrong secret → 401. No Vercel Analytics script in the HTML |
| Cron Trigger (`/__scheduled?cron=0+8+*+*+*`) | `scheduled()` called `/api/cron/shopping-reminders` with the secret. The route passed auth and ran a real Neon HTTP query (failed only on the placeholder DB host). The failure was logged and the invocation marked failed. An unknown expression calls nothing |
| Vercel build (`pnpm build`) | ✅ unchanged: real `sharp` external, no shim |
| Unit tests (CI command) | 52 files, 817 tests passed (+ `cloudflare/cron.test.ts`, `cloudflare/shims/sharp.test.ts`, `lib/gcp-oidc.test.ts`) |

**Not covered by the recorded 2026-09-25 preparation checks:** these items needed real account/secrets and are not evidence of current production failures or current verification status.
- Neon Auth sign-in on the Worker's hostname.
- Real DB pages and actions.
- Receipt upload/OCR on workerd, including `unpdf` for PDF text layers.
- CPU time of the price-ingestion jobs.
- 10 MB uploads within the 128 MB isolate memory.
- `revalidatePath` refresh after actions.

**CI:** the `cloudflare` job in `.github/workflows/ci.yml` runs `pnpm cf:build` and fails at 9 MiB gzip on every PR and push to `main`, so the Worker build cannot break unnoticed.

## 3. Known risks

1. **Historical staging risk:** Next 16 `proxy.ts` runs as Node.js middleware. OpenNext warned: "Node.js middleware support is
   experimental in cloudflare". It worked in the local test (redirects, public paths). Test sign-in,
   sign-out and protected pages thoroughly on staging.
2. **Historical preparation note — OCR image processing** (§6). The notes below described photos going to OCR unprocessed while a replacement was being considered. Confirm current receipt-image processing behavior before changing it.
3. **Historical staging measurement needed:** CPU limits. Price-ingestion parts took 16–49 s wall time from outside the DB region, mostly
   I/O. Workers bill CPU, not wall time, but the parsing (Lidl gunzip, large JSON) must be measured
   on staging. `limits.cpu_ms` is set to the Paid maximum of 5 min.
4. **Historical origin-change risk:** old notes referred to `shopping-with-buddy.vercel.app`; production now runs on Cloudflare per owner confirmation. Keep the production origin and installed PWA working when changing DNS or Worker routes.
5. LLM calls use Cloudflare AI Gateway; the Vercel AI Gateway is not part of the application path (§7).

## 4. Owner prerequisites

The following were prerequisites in the original preparation runbook; current account configuration should be checked before acting:
1. **Workers Paid** on the Cloudflare account: cron triggers, CPU time, bundle size.
2. **Data-cache buckets**: `pnpm exec wrangler r2 bucket create shopping-buddy-next-cache` and
   `… shopping-buddy-next-cache-staging`. They hold only rebuildable cache entries, so no backup is
   needed; a deploy fails while a bound bucket does not exist.
3. **Wrangler login** on your computer (`pnpm exec wrangler login`), or a `CLOUDFLARE_API_TOKEN` with
   *Workers Scripts: Edit* (+ *Workers Routes/DNS: Edit* for the custom domain).
4. **Custom domain** on a Cloudflare zone (historical setup prerequisite).
5. **Neon Auth trusted origins:** add the staging and later the production Worker hostnames in the
   Neon Console (Auth → Configuration → Domains), as was done for Vercel.
6. **Cloudflare AI Gateway:** configure the OpenAI provider key in the Gateway, then create a
   Cloudflare API token with **Account → Workers AI → Read** permission, as required by the AI REST
   API. Set `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_AI_GATEWAY_ID` (the configured Gateway's ID), and `CLOUDFLARE_AI_GATEWAY_TOKEN` in
   Cloudflare Worker secrets (or local
   `.dev.vars`). The application uses the account-scoped AI REST `/ai/v1/responses` endpoint and
   selects the configured Gateway with the `cf-aig-gateway-id` header; the fixed model is
   `openai/gpt-6-luna`. Do not set `OPENAI_API_KEY` in the app.
   For the taxonomy pilot workflow, add the account ID and Gateway ID as GitHub Actions variables
   `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_GATEWAY_ID`, and the run token as the secret
   `CLOUDFLARE_AI_GATEWAY_TOKEN`.
   The old Vercel `AI_GATEWAY_API_KEY` is no longer read by application code.

## 5. PDF OCR without Vercel OIDC (one-time Google setup)

**Historical migration context:** Cloudflare Workers do not provide a Vercel OIDC token.

**The fix:** the app signs its own short-lived JWT (RS256, 10 min), and Google trusts the public key
through a **separate** Workload Identity OIDC provider. No service-account key is created, which the organization policy forbids
anyway.

1. **Generate the key pair:** `pnpm gcp:oidc-key` writes `gcp-oidc-private-key.pem` (secret) and
   `gcp-oidc-jwks.json` (public), and prints the key id. Both files are gitignored.
2. **Create the provider** in the existing pool, with the public key uploaded instead of a
   discovery URL. The issuer is an identifier and does not need to be reachable, e.g.
   `https://shopping-buddy.app/oidc`:
   ```bash
   gcloud iam workload-identity-pools providers create-oidc cloudflare \
     --project=<GCP_PROJECT_ID> --location=global \
     --workload-identity-pool=<GCP_WORKLOAD_IDENTITY_POOL_ID> \
     --issuer-uri=<GCP_OIDC_ISSUER> \
     --jwk-json-path=gcp-oidc-jwks.json \
     --attribute-mapping="google.subject=assertion.sub" \
     --attribute-condition="assertion.sub in ['shopping-buddy', 'shopping-buddy-staging']"
   ```
   Check the flags with `gcloud iam workload-identity-pools providers create-oidc --help`. The
   `--jwk-json-path` option is what lets Google trust a key without a public discovery endpoint.
3. **Allow the identity to impersonate the Vision service account:**
   ```bash
   gcloud iam service-accounts add-iam-policy-binding <GCP_SERVICE_ACCOUNT_EMAIL> \
     --role=roles/iam.workloadIdentityUser \
     --member="principal://iam.googleapis.com/projects/<GCP_PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL_ID>/subject/shopping-buddy"
   ```
   Repeat with `subject/shopping-buddy-staging` for staging.
4. **Set the Worker secrets:**
   - `GCP_OIDC_TOKEN_SOURCE=self-signed`
   - `GCP_OIDC_ISSUER`
   - `GCP_OIDC_KEY_ID`
   - `GCP_OIDC_PRIVATE_KEY` (the PEM file's contents)
   - `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=cloudflare`
   - on staging also `GCP_OIDC_SUBJECT=shopping-buddy-staging`

   Then delete the local PEM file.
5. **Key rotation:** generate a new pair with a new key id, add its JWK to the provider's JWKS next
   to the old one, switch the secrets, then remove the old JWK.

The JWT's `aud` is `https://iam.googleapis.com/projects/…/providers/…`, the default allowed audience
of a WIF provider without explicit audiences. Covered by `lib/gcp-oidc.test.ts`. Not yet tested
against Google.

## 6. OCR image preparation (`sharp`)

`sharp` is a native Node addon, so it cannot run on Workers. The Cloudflare build replaces it with
`cloudflare/shims/sharp.js`, which throws when called. `lib/receipt-image.ts` calls sharp only inside
`prepareReceiptImageForOcr`. When that throws, the receipt pipeline already sends the **original**
photo to OCR and logs `imagePrep.status: 'failed'`. That is the same path as any prep failure today,
so uploads keep working.

Options to restore preparation, to be decided after measuring accuracy on real receipts:
- **Cloudflare Images binding** (`env.IMAGES`): rotate, grayscale, resize, contrast. Needs an
  adapter in `lib/receipt-image.ts`; the background flattening and deskew steps have no direct
  equivalent.
- **A WASM image library.** Check the bundle size first; the Worker is at 4.2 MB of 10 MB.
- **Accept no preparation** if Google Vision accuracy on unprocessed photos is good enough.

## 7. Other services

| Service | On Cloudflare |
|---|---|
| **LLM requests (Cloudflare AI Gateway)** | `lib/ai/client.ts` routes all approved LLM requests through the account-scoped AI REST `/ai/v1/responses` endpoint using `openai/gpt-6-luna`; `cf-aig-gateway-id` selects the configured Gateway. Configure `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, and a Cloudflare API token with Account → Workers AI → Read permission (`CLOUDFLARE_AI_GATEWAY_TOKEN`) in the Cloudflare Worker secrets and local development environment. Store the upstream OpenAI key in Cloudflare AI Gateway, not the app. Google Vision and Azure Document Intelligence remain separate OCR integrations. |
| **Analytics** | Vercel Analytics is off in the Cloudflare build. Turn on **Cloudflare Web Analytics** for the zone (automatic setup, no code) |
| **Cron** | Cron Triggers from `wrangler.jsonc` (UTC, aligned with the schedule list in `vercel.json`). Adding a job means updating both files; `cloudflare/cron.test.ts` checks that they match. Vercel is not a current production cron runner. |
| **Receipt files** | Already R2 over the S3 API (`lib/storage/r2.ts`). An R2 Worker binding would be an optimization, not a requirement |
| **Database** | Hyperdrive + `pg`/Drizzle in the Worker; Node.js development, tests and the local PostgreSQL mode retain their existing `DATABASE_URL` behavior |

## 8. Staging and historical cutover notes

**Staging:**
1. `pnpm install`, then `pnpm cf:build`.
2. For each variable in `.dev.vars.example`, run
   `pnpm exec wrangler secret put <NAME> --env staging`. Use the Neon **test** branch, the test R2
   bucket and a separate `CRON_SECRET`.
3. `pnpm cf:deploy:staging` deploys to `shopping-buddy-staging.<account>.workers.dev`.
4. Add that hostname to Neon Auth trusted origins.
5. Test on a phone:
   - sign-up, sign-in, sign-out;
   - dashboard, shopping list, budget, pantry, meal plan;
   - receipt photo (large and small), PDF with a text layer, scanned PDF (WIF, §5);
   - review, confirm, cancel.
   Staging has **no cron triggers**, so run each cron job once by calling its route with the
   staging `CRON_SECRET` (`Authorization: Bearer …`), and read the CPU time in the Worker logs.
6. Record the results in `docs/cloudflare-migration-status.md`.

**Historical cutover checklist — superseded:** The steps below were written before the owner confirmed Cloudflare production. Do not follow the old Vercel-domain/DNS/cron rollback sequence as a current runbook. Use the explicit production deployment workflow and verify current Cloudflare configuration before operational changes.

## Database migrations on deploy

The Cloudflare production workflow `.github/workflows/cloudflare-deploy.yml` applies pending production migrations before `pnpm cf:deploy`; the OpenNext build itself skips the Vercel-specific migration guard. Migrations therefore apply before the new code goes live and must remain compatible with the currently serving version. The Vercel-specific behavior of `pnpm build` is historical and is not the production migration path.

## 8b. Deploy workflow

`.github/workflows/cloudflare-deploy.yml` is a manual (`workflow_dispatch`) workflow with a `staging` / `production` choice. Production runs only from `main` and applies pending migrations (`tsx lib/db/migrate.ts`) before `pnpm cf:deploy`; staging may be deployed from any branch and never touches migrations. Repository secrets it needs: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL` (+ optional `DATABASE_URL_UNPOOLED`), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`. Runtime secrets stay on the Worker (`wrangler secret put`). Note: the staging build is made with the same `DATABASE_URL` secret, which is only used at build time. Production hosting is owner-confirmed; this document update did not run the workflow or independently verify the live deployment.

## 8c. Database connection through Hyperdrive

`lib/db/client.ts` uses `env.HYPERDRIVE.connectionString` in a Cloudflare Worker and connects through `pg` plus `drizzle-orm/node-postgres`. A request-scoped React cache reuses the Drizzle client only within the current request; Hyperdrive owns the origin connection pool. `db.batch()` remains transactional by running its statements on one checked-out `pg` client. The Worker does not fall back to `process.env.DATABASE_URL` when an initialized Cloudflare context is present but the binding is missing or malformed. Node.js development, tests, migrations and the explicit local PostgreSQL mode continue to use `DATABASE_URL` as before.

`wrangler.jsonc` now declares the production `HYPERDRIVE` binding using the ID supplied for this setup. Confirm in Cloudflare that this ID points to the intended Neon database before any deploy. Staging needs its own non-production Hyperdrive ID before its database binding is configured; do not point staging at production data:

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE", "id": "<staging Hyperdrive ID>" }
]
```

Keep `nodejs_compat`; Cloudflare documents `pg` and `drizzle-orm/node-postgres` as supported Hyperdrive drivers. The installed `pg` 8.23.1 exceeds Cloudflare's stated 8.16.3 minimum. `pg-cloudflare` 1.4.1 remains the optional dependency selected by `pg` for Workers; no `pg` shim is configured. `cloudflare/shims/pg.js` is retained until a separately scoped removal confirms no other consumer needs it.

**Disable Hyperdrive query caching on the production configuration.** The app depends on read-after-write consistency for compare-and-set mutations, including pantry quantity changes. Hyperdrive does not invalidate cached `SELECT` results after a write; its default cache can therefore make the next mutation read an old quantity and reject a valid update. The production configuration was verified with caching disabled on 2026-10-23. If it is recreated or changed, run `pnpm exec wrangler hyperdrive update <id> --caching-disabled` and verify with `pnpm exec wrangler hyperdrive get <id>` (`caching.disabled` must be `true`). Keep any future cache-enabled configuration separate and use it only for reads that tolerate stale data.

Set the Hyperdrive origin credentials in the Hyperdrive configuration, not in `wrangler.jsonc`, repository files or ordinary Worker vars. For local `wrangler dev`, use the documented Hyperdrive local-connection-string mechanism with a disposable non-production database. A real Worker/Hyperdrive smoke test has not been run by this change.

The production Hyperdrive (`f707d733ceb84b1f8211e10baed777e5`, name `anitka-neon`) points at the Frankfurt database since 2026-10-21: origin host `ep-green-bonus-b97jnsd5.c-7.eu-central-1.aws.neon.tech`, database `neondb`, user `neondb_owner`. Change it with `wrangler hyperdrive update <id> --connection-string "<url>"` — the same value belongs in the Worker's `DATABASE_URL` and `DATABASE_URL_UNPOOLED` secrets, in the repository secrets of the same name, and in `NEON_AUTH_BASE_URL` (which points at the Neon Auth endpoint of the same project). The Hyperdrive configuration `cefc7bc16948487aa272b989b386a97f` (`shopping-buddy-neon`) is a leftover from an earlier setup: no `wrangler.jsonc` references it and no Worker uses it.

## 9. Local preview

`cp .dev.vars.example .dev.vars`, fill in test values, then `pnpm cf:build && pnpm cf:preview`
(http://localhost:8787). Add `--test-scheduled` to `wrangler dev` to fire crons via
`/__scheduled?cron=<expression>`.


## Data cache

`lib/db/cached-reads.ts` uses `unstable_cache` for global catalog reads. Entries have a one-day safety `revalidate`, but the catalog is primarily refreshed by explicit cache-tag invalidation after successful ingestion or catalog mutations. Product, price/offer, deal, store and recipe caches have separate tags, so a CRON only invalidates the global data it can change. User/household-specific data is not placed in these shared caches. Production uses OpenNext's R2 incremental cache (`open-next.config.ts`, binding `NEXT_INC_CACHE_R2_BUCKET`). Historical Vercel cache references describe the old hosting setup; verify cache reuse and tag-driven refresh against the active production bucket when operationally needed.

## Building on Windows

`pnpm cf:build` sets `BUILD_TARGET` through `dotenv-cli`, so the script runs in any shell. The OpenNext bundling step, however, creates symlinks, which Windows refuses without extra rights (`EPERM: operation not permitted, symlink`). Either build inside WSL (a separate `pnpm install` there, since `node_modules` contains platform binaries), or turn on Windows **Developer Mode** (Settings → System → For developers), which allows symlinks without administrator rights. CI builds on Linux, so a PR always shows whether the Worker build works.

