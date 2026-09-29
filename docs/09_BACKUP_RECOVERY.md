# Backup, recovery and monitoring

## What lives where

| Data | Where | Recovery |
| --- | --- | --- |
| All application data and the accounts (`neon_auth` schema) | Neon PostgreSQL, one database | Neon restore (last 6 hours) or a `pnpm db:backup` dump |
| Receipt photos | Cloudflare R2 bucket (`R2_BUCKET_NAME`) | Not backed up separately; the database rows survive without them, only the images are lost |
| Secrets (`CRON_SECRET`, API keys, `NEON_AUTH_COOKIE_SECRET`, R2 keys) | Vercel environment variables | Keep a copy in the owner's password manager; they are not in the repository |
| Code and migrations | GitHub (`main`) | `git clone`; `pnpm db:migrate` rebuilds the schema |

Prices and deals from retailers can be re-imported by the ingestion crons, so they are the cheapest data to lose. Households, shopping lists, budgets, purchases, pantry and accounts are the data that cannot be recreated.

## Neon point-in-time restore (short reach)

On the free plan Neon keeps a history of **6 hours** (capped at 1 GB of history); Launch allows up to 7 days and Scale up to 30 (Neon docs, "History window", checked 2026-09-29). Within that window the production branch can be restored to any timestamp from the Neon console (Backup & Restore) or `neon branches restore`. Restore replaces every database on the branch, and Neon keeps the state it replaced as a branch named `<branch>_old_<timestamp>`. It only works for a root branch.

This covers "something went wrong a moment ago" (a bad migration, a wrong script). It does **not** cover a mistake noticed the next day, so also take logical dumps.

## Logical backup

```bash
pnpm db:backup        # writes backups/shopping-buddy-<timestamp>.dump
```

The script (`scripts/backup-db.ts`) runs `pg_dump --format=custom` against `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`) from `.env.local`. It needs the PostgreSQL 18 client tools on the PATH. `backups/` is git-ignored. The repository is public and the dump holds personal data, so never commit it or attach it to a GitHub Actions artifact; keep it on the owner's own encrypted disk or private cloud storage.

Suggested rhythm: before every risky change (a data migration, a bulk script) and at least weekly. The dump is small while the database stays inside the free plan's 0.5 GB.

## Restore drill

Do this once now and after any large schema change, so the first real restore is not also the first attempt:

1. In the Neon console create a throwaway branch (or project) and copy its connection string.
2. `pg_restore --no-owner --dbname "<that connection string>" backups/<file>.dump`
3. Point a local `.env.local` copy at it and check that the app starts and a known household, list and purchase are there.
4. Delete the throwaway branch.

To restore for real, restore into a fresh Neon branch first, verify it, then switch `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) in Vercel to it, or restore over the production branch when the damage is total.

## Monitoring

- `GET /api/health` is public and answers `{"status":"ok"}` (200) when the app is up and the database responds to `select 1`, or `{"status":"unavailable"}` (503) otherwise. Point a free uptime monitor (for example UptimeRobot or Better Stack) at it with e-mail alerts. The failure reason is written to the Vercel log as a JSON line with `event: "health.failed"`, never returned to the caller.
- Scheduled price imports log one JSON line per run (`lib/ingestion/cron-log.ts`) and receipt processing logs through `lib/receipt-log.ts`. Both live only in Vercel's log retention; there is no stored run history and no alerting on a failed cron yet.
- Not done: client-side error reporting and alerting on cron failures. They need a service or a table and are left for when there is a concrete need.
