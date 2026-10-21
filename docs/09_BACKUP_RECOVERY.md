# Backup, recovery and monitoring

## What lives where

| Data | Where | Recovery |
| --- | --- | --- |
| All application data and the accounts (`neon_auth` schema) | Neon PostgreSQL, one database | Neon restore (last 6 hours) or a `pnpm db:backup` dump |
| Receipt photos | Cloudflare R2 bucket (`R2_BUCKET_NAME`) | Not backed up separately; the database rows survive without them, only the images are lost |
| Secrets (`CRON_SECRET`, API keys, `NEON_AUTH_COOKIE_SECRET`, R2 keys) | Cloudflare Worker secrets (`wrangler secret put`) and the local `.env.local` | Keep a copy in the owner's password manager; they are not in the repository |
| Code and migrations | GitHub (`main`) | `git clone`; `pnpm db:migrate` rebuilds the schema |

Prices and deals from retailers can be re-imported by the ingestion crons, so they are the cheapest data to lose. Households, shopping lists, budgets, purchases, pantry and accounts are the data that cannot be recreated.

## Neon point-in-time restore (short reach)

On the free plan Neon keeps a history of **6 hours** (capped at 1 GB of history); Launch allows up to 7 days and Scale up to 30 (Neon docs, "History window", checked 2026-09-29). Within that window the production branch can be restored to any timestamp from the Neon console (Backup & Restore) or `neon branches restore`. Restore replaces every database on the branch, and Neon keeps the state it replaced as a branch named `<branch>_old_<timestamp>`. It only works for a root branch.

This covers "something went wrong a moment ago" (a bad migration, a wrong script). It does **not** cover a mistake noticed the next day, so also take logical dumps.

## Logical backup

```bash
pnpm db:backup        # writes backups/shopping-buddy-<timestamp>.dump.enc
```

The script (`scripts/backup-db.ts`) runs `pg_dump --format=custom` against `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`) from `.env.local`, **encrypts the dump** with AES-256-GCM (`lib/backup-crypto.ts`) and deletes the unencrypted file, also when a step fails. The dump holds password hashes and session tokens, so an unencrypted copy must not exist on a disk. It needs the PostgreSQL 18 client tools on the PATH.

**Key:** `BACKUP_ENCRYPTION_KEY` in `.env.local` (not in the Worker secrets, the app never needs it): 32 random bytes in base64, generated once with `openssl rand -base64 32`. **Keep a copy in the owner's password manager, separate from the backups. Without the key a backup cannot be opened, with no way around it.** A wrong key, a modified file and a file cut short all fail to decrypt rather than restore partially.

`backups/` is git-ignored. The repository is public, so never commit a backup or attach it to a GitHub Actions artifact; with encryption, private cloud storage is acceptable too.

Suggested rhythm: before every risky change (a data migration, a bulk script) and at least weekly. The dump is small while the database stays inside the free plan's 0.5 GB.

## Restore drill

Do this once now and after any large schema change, so the first real restore is not also the first attempt:

1. In the Neon console create a throwaway branch (or project) and copy its connection string.
2. `pnpm db:restore backups/<file>.dump.enc "<that connection string>"` (decrypts into a private temp directory, runs `pg_restore --no-owner`, removes the temp file). The target is always passed explicitly, never taken from `.env.local`.
3. Point a local `.env.local` copy at it and check that the app starts and a known household, list and purchase are there.
4. Delete the throwaway branch.

To restore for real, restore into a fresh Neon branch first, verify it, then update `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) in the Cloudflare production runtime/deployment configuration to use it, or restore over the production branch when the damage is total. Vercel is no longer part of the deployment path.

## Moving to another Neon project or region

`pnpm db:restore` puts one database back where it was. To move the whole database somewhere else (another project, another region), use the dedicated script:

```bash
pnpm db:migrate-project --project-id <neon-project-id>
```

It reads the source from `DATABASE_URL_UNPOOLED` in `.env.local`, asks `neonctl` for the target's connection string (so no credential appears in a command line), dumps the source, restores it into the target, and finally compares the row count of every table between source and target — a mismatch fails the run rather than being reported as a success. The target must have Neon Auth enabled and a `test` branch, like the current one.

Two things break a plain `pg_dump`/`pg_restore` here, and the script handles both:

- **`neon_auth.project_config` must not come from the dump.** The row names the endpoint and the trusted origins of the Neon Auth instance; carried over, it would point the new project's auth at the old project's endpoint. The script reads the target's own row before the restore and writes it back afterwards. Because the row lives on the `neon_auth` schema, it also has to be dropped before the restore — otherwise `pg_restore --clean` cannot drop that schema and the restore stops on `cannot drop schema neon_auth because other objects depend on it`.
- **The `neon_auth` tables must be owned by the `neon_auth` role.** The restore runs with `--no-owner`, so the tables land with the restoring role (`neondb_owner`), while Neon Auth connects as `neon_auth` and could then not manage its own sessions, JWKS and configuration. The script transfers the ownership back.

The `neon_auth` private signing key does come from the dump, and that is intended: the same key keeps the existing session tokens valid. It also means the old and the new project can both validate the same tokens until the old one is retired.

## Monitoring

- `GET /api/health` is public and answers `{"status":"ok"}` (200) when the app is up and the database responds to `select 1`, or `{"status":"unavailable"}` (503) otherwise. Point a free uptime monitor (for example UptimeRobot or Better Stack) at it with e-mail alerts. The failure reason is written to the Vercel log as a JSON line with `event: "health.failed"`, never returned to the caller.
- Scheduled price imports log one JSON line per run (`lib/ingestion/cron-log.ts`) and receipt processing logs through `lib/receipt-log.ts`. Both live only in Vercel's log retention; there is no stored run history and no alerting on a failed cron yet.
- Not done: client-side error reporting and alerting on cron failures. They need a service or a table and are left for when there is a concrete need.
