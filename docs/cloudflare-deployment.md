# Cloudflare Deployment — Prepared, Not Deployed

**Where:** on `main` since PR #83 (owner, 2026-09-25: prepare only, migrate nothing). Refreshed 2026-09-26: writable data cache on R2, `cf:build` runs on Windows too.
**Production:** Vercel, unchanged. Receipt files are already on R2 (`docs/cloudflare-r2.md`).

The prepared setup makes the app **buildable and runnable as a Cloudflare Worker** (OpenNext for Cloudflare).
It also removes the known blockers behind switches whose defaults keep Vercel behavior. What is left
is account setup, staging tests and the cutover.

## 1. What is prepared

| File | Purpose |
|---|---|
| `open-next.config.ts` | OpenNext config. Next's data cache (and the few prerendered pages) in the R2 bucket `shopping-buddy-next-cache`, so `unstable_cache` in `lib/db/cached-reads.ts` works as on Vercel (see "Data cache" below). No tag cache, queue or Durable Object: the app has no `revalidateTag` and no ISR |
| `wrangler.jsonc` | Worker `shopping-buddy` plus `env.staging` (`shopping-buddy-staging`, no crons). Each has its own data-cache bucket (`NEXT_INC_CACHE_R2_BUCKET`). Also sets `nodejs_compat`, `STORAGE_PROVIDER=r2`, `limits.cpu_ms` 300000, logs, and the 26 cron triggers |
| `cloudflare/worker.ts` | Worker entry: OpenNext's `fetch` plus a `scheduled()` handler for Cron Triggers |
| `cloudflare/cron.ts` | Maps a fired cron expression to its path(s) in `vercel.json`, which stays the one list of jobs. Calls the route with `Authorization: Bearer $CRON_SECRET`, like Vercel Cron |
| `cloudflare/shims/sharp.js` | Throwing stand-in for `sharp` in the Cloudflare build only (see §6) |
| `lib/gcp-oidc.ts` | Subject token for Google WIF (PDF OCR): `GCP_OIDC_TOKEN_SOURCE=vercel` (default, as before) or `self-signed` (see §5) |
| `scripts/generate-gcp-oidc-key.ts` | `pnpm gcp:oidc-key`: key pair for the self-signed token |
| `next.config.mjs` | With `BUILD_TARGET=cloudflare` only: aliases `sharp` to the shim and sets `ANALYTICS_PROVIDER=none` |
| `app/layout.tsx` | Vercel Analytics is not rendered when `ANALYTICS_PROVIDER=none` |
| `.dev.vars.example` | Every variable the Worker needs (names only) |
| `package.json` | `cf:build`, `cf:preview`, `cf:deploy:staging`, `cf:deploy`, `gcp:oidc-key`; devDependencies `@opennextjs/cloudflare` 1.20.6, `wrangler` 4.138.0 |
| `pnpm-workspace.yaml` | Allows workerd's postinstall (binary check) |
| `.gitignore`, `tsconfig.json`, `vitest.config.mts` | Ignore `.open-next/`, `.wrangler/`, `.dev.vars`, the GCP key files |

**Vercel impact:**
- None functional. Every Cloudflare path is behind `BUILD_TARGET=cloudflare` or an env switch whose
  default is today's behavior.
- One cost: installing the new devDependencies pulls the workerd binary (~127 MB unpacked), so a
  cold `pnpm install` on Vercel/CI takes longer. If that matters before the migration, move
  `wrangler` and `@opennextjs/cloudflare` out of `package.json` and run them with `pnpm dlx`.

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

**Not verified yet (needs an account and real secrets):**
- Neon Auth sign-in on the Worker's hostname.
- Real DB pages and actions.
- Receipt upload/OCR on workerd, including `unpdf` for PDF text layers.
- CPU time of the price-ingestion jobs.
- 10 MB uploads within the 128 MB isolate memory.
- `revalidatePath` refresh after actions.

**CI:** the `cloudflare` job in `.github/workflows/ci.yml` runs `pnpm cf:build` and fails at 9 MiB gzip on every PR and push to `main`, so the Worker build cannot break unnoticed.

## 3. Known risks

1. **Next 16 `proxy.ts` runs as Node.js middleware.** OpenNext warns: "Node.js middleware support is
   experimental in cloudflare". It worked in the local test (redirects, public paths). Test sign-in,
   sign-out and protected pages thoroughly on staging.
2. **OCR without image preparation** (§6). Photos go to OCR unprocessed until a replacement is
   chosen. Measure accuracy on real receipts before production.
3. **CPU limits.** Price-ingestion parts took 16–49 s wall time from outside the DB region, mostly
   I/O. Workers bill CPU, not wall time, but the parsing (Lidl gunzip, large JSON) must be measured
   on staging. `limits.cpu_ms` is set to the Paid maximum of 5 min.
4. **Origin change.** Users and the installed PWA are on `shopping-with-buddy.vercel.app`, which
   cannot move. Put a custom domain in front of Vercel first; the cutover is then only a DNS change.
5. **Vercel still needed for the AI Gateway** unless it is replaced (§7).

## 4. Owner prerequisites

1. **Workers Paid** on the Cloudflare account ($5/month): 26 cron triggers, CPU time, bundle size.
2. **Data-cache buckets** (once): `pnpm exec wrangler r2 bucket create shopping-buddy-next-cache` and
   `… shopping-buddy-next-cache-staging`. They hold only rebuildable cache entries, so no backup is
   needed; a deploy fails while a bound bucket does not exist.
3. **Wrangler login** on your computer (`pnpm exec wrangler login`), or a `CLOUDFLARE_API_TOKEN` with
   *Workers Scripts: Edit* (+ *Workers Routes/DNS: Edit* for the custom domain).
4. **Custom domain** on a Cloudflare zone (see risk 4).
5. **Neon Auth trusted origins:** add the staging and later the production Worker hostnames in the
   Neon Console (Auth → Configuration → Domains), as was done for Vercel.

## 5. PDF OCR without Vercel OIDC (one-time Google setup)

**The problem:** on Workers there is no Vercel OIDC token.

**The fix:** the app signs its own short-lived JWT (RS256, 10 min), and Google trusts the public key
through a **separate** Workload Identity OIDC provider. The existing Vercel provider stays as it is,
so Vercel keeps working. No service-account key is created, which the organization policy forbids
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
| **Receipt structuring and Albert flyers (AI Gateway)** | Set `AI_GATEWAY_API_KEY`: Vercel dashboard → AI Gateway → API Keys. Both model uses (receipts, `lib/ingestion/albert.ts`) go through the same gateway. The AI SDK uses it before Vercel OIDC, so no code change is needed (checked in `@ai-sdk/gateway`). Billing stays with Vercel's gateway. Replacing it (Cloudflare AI Gateway or a direct provider) is a separate decision under CLAUDE.md §30 |
| **Analytics** | Vercel Analytics is off in the Cloudflare build. Turn on **Cloudflare Web Analytics** for the zone (automatic setup, no code) |
| **Cron** | 26 Cron Triggers from `wrangler.jsonc` (UTC, same times as `vercel.json`). Adding a job means adding it to `vercel.json` and to `wrangler.jsonc`; `cloudflare/cron.test.ts` fails until both match. Watch for double runs during a period when both Vercel and Cloudflare production are live |
| **Receipt files** | Already R2 over the S3 API (`lib/storage/r2.ts`). An R2 Worker binding would be an optimization, not a requirement |
| **Database** | Neon HTTP driver, works on workerd (verified up to the network call) |

## 8. Step by step (later)

**Staging, next to Vercel production:**
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

**Production:**
1. Custom domain on Vercel first (risk 4).
2. `pnpm cf:deploy` with the production secrets. Cron triggers become active, so **disable Vercel
   Cron at the same moment**: remove the `crons` from `vercel.json` or pause them in the Vercel
   dashboard. Otherwise every job runs twice.
3. Point the custom domain's DNS to the Worker (Workers → Settings → Domains & Routes).
4. **Rollback:** point the DNS back to Vercel and re-enable Vercel Cron. Keep Vercel deployable
   for the whole rollback window.

## 9. Local preview

`cp .dev.vars.example .dev.vars`, fill in test values, then `pnpm cf:build && pnpm cf:preview`
(http://localhost:8787). Add `--test-scheduled` to `wrangler dev` to fire crons via
`/__scheduled?cron=<expression>`.


## Data cache

`lib/db/cached-reads.ts` caches the page's global reads for 15 minutes with `unstable_cache`, because Neon's free network transfer ran out. On Vercel this uses the platform's data cache. On Cloudflare it uses OpenNext's R2 incremental cache (`open-next.config.ts`, binding `NEXT_INC_CACHE_R2_BUCKET`), so the reads stay cached after the move (2026-09-26; before that the prepared build had a read-only cache and these reads ran uncached). Entries expire by their `revalidate` time only. R2 operations fit the free tier at this app's traffic. Not yet verified against a real bucket: check on staging that a second page render within 15 minutes does not query prices again (Neon's query log or the Worker's R2 metrics).

## Building on Windows

`pnpm cf:build` sets `BUILD_TARGET` through `dotenv-cli`, so the script runs in any shell. The OpenNext bundling step, however, creates symlinks, which Windows refuses without extra rights (`EPERM: operation not permitted, symlink`). Either build inside WSL (a separate `pnpm install` there, since `node_modules` contains platform binaries), or turn on Windows **Developer Mode** (Settings → System → For developers), which allows symlinks without administrator rights. CI builds on Linux, so a PR always shows whether the Worker build works.
