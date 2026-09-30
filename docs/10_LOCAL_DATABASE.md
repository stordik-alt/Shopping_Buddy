# Local database (Neon replacement)

The app can run entirely on this machine: a plain PostgreSQL 18 installed on it instead of Neon, and a self-hosted Better Auth instead of Neon Auth. Production is unchanged; the switch is the `DATABASE_URL`: a loopback host (`localhost`, `127.0.0.1`) or `DATABASE_DRIVER=pg` selects the `pg` mode (`lib/db/local.ts`).

## What changes in local mode

| Concern | Production (Neon) | Local |
| --- | --- | --- |
| Database driver | `@neondatabase/serverless` + `drizzle-orm/neon-http` | `pg` pool + `drizzle-orm/node-postgres` (`lib/db/client.ts`) |
| `db.batch()` (atomic multi-statement) | Neon HTTP batch | One transaction on one connection (`runBatch`) |
| Migration runner | Neon HTTP | `pg` (`lib/db/raw-sql.ts`); first creates the `neon_auth` tables from `lib/db/local-auth-schema.sql` |
| Login | Neon Auth (managed Better Auth) | Better Auth in the app (`lib/auth/local.ts`) on the same `neon_auth."user"/session/account/verification` tables, uuid ids |
| Route protection | `auth.middleware()` | Session-cookie presence check in `proxy.ts`; real session lookup stays server-side in `requireHousehold()` |
| Auth client | Neon client | `better-auth/react` client, chosen by `NEXT_PUBLIC_LOCAL_DATABASE=1` |

Everything else (Drizzle queries, business logic, migrations) is the same code.

## Setup

Install PostgreSQL 18 as a service (here it listens on port 5433 because 5432 was taken). Once, as the `postgres` superuser, create a login and the two databases:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -c "CREATE ROLE shopping_buddy LOGIN SUPERUSER PASSWORD 'shopping_buddy'" -c "CREATE DATABASE shopping_buddy OWNER shopping_buddy" -c "CREATE DATABASE shopping_buddy_test OWNER shopping_buddy"
```

The role is a superuser so a full dump (including the `neon_auth` schema) can be restored; it exists only on this machine and never leaves it.

The local values live in `.env.localdb` (git-ignored, like every `.env*`). It is loaded only by the `:local` scripts and takes precedence over `.env.local`, so plain `pnpm dev`, `pnpm test` and `pnpm db:*` keep using Neon:

```env
DATABASE_URL=postgresql://shopping_buddy:shopping_buddy@localhost:5433/shopping_buddy
DATABASE_URL_UNPOOLED=postgresql://shopping_buddy:shopping_buddy@localhost:5433/shopping_buddy
TEST_DATABASE_URL=postgresql://shopping_buddy:shopping_buddy@localhost:5433/shopping_buddy_test
TEST_DATABASE_URL_UNPOOLED=postgresql://shopping_buddy:shopping_buddy@localhost:5433/shopping_buddy_test
NEXT_PUBLIC_LOCAL_DATABASE=1
NEON_AUTH_COOKIE_SECRET=any-random-string-of-32-or-more-characters
```

Then:

```bash
pnpm db:migrate:local   # schema + local auth tables, on both the app and the test database
pnpm dev:local          # the app on the local database
pnpm test:local         # the test suite on shopping_buddy_test
```

The test database also needs its catalog rows once: `DATABASE_URL=<test url> pnpm exec tsx lib/db/seed.ts` (run it on a fresh database only; the seed is not idempotent).

## Copying real data from Neon (done once on 2026-09-29; existing logins work locally)

With the PostgreSQL 18 client tools that come with the server (`C:\Program Files\PostgreSQL\18\bin`):

```powershell
pg_dump --format=custom --no-owner --no-acl --file backups\neon.dump "<DATABASE_URL_UNPOOLED from .env.local>"
pg_restore --no-owner --no-acl -h localhost -p 5433 -U shopping_buddy -d shopping_buddy backups\neon.dump   # into an empty database
```

Accounts come along (`neon_auth`) and the password hashes are Better Auth's, so existing logins work locally. Neon's `neon_auth` tables have a few extra nullable columns (`role`, `banned`, …) that the local stand-in lacks and the restore brings; Better Auth ignores them. `backups/` is git-ignored: the dump holds personal data.

## Fallback: a hosted PostgreSQL instead of Neon

If Neon is unavailable (free limits, suspended project), the same code can run production on any hosted PostgreSQL (Supabase, Railway, a VPS, …) without code changes. Set these on the Vercel project (Production) and redeploy:

```env
DATABASE_DRIVER=pg
DATABASE_URL=postgresql://user:password@host:5432/db?sslmode=require   # use the provider's pooled URL on serverless
DATABASE_URL_UNPOOLED=<the direct URL, used by the migration runner at build time>
NEXT_PUBLIC_LOCAL_DATABASE=1        # build-time: use the Better Auth client
NEON_AUTH_COOKIE_SECRET=<the existing secret>   # signs the session cookies
BETTER_AUTH_URL=https://<your production domain>
DATABASE_POOL_MAX=5                 # optional, default 5 per function instance
```

Steps: restore a fresh `pnpm db:backup` dump into the new database (`pg_restore --no-owner --no-acl`, see above), then switch the variables. Accounts and password hashes come along, so users keep their logins, but existing sessions end (Neon Auth's session cookies are not valid for Better Auth) and everyone signs in once more. Not exercised against a real hosted provider yet; `pg` mode itself is covered by the whole test suite.

* Vercel only: the Cloudflare build stubs `pg` (`cloudflare/shims/pg.js`), so the prepared Worker cannot use this mode.
* `DATABASE_POOL_MAX` is per function instance: keep it low and use the provider's connection pooler so many instances do not exhaust the database's connection limit.

## Limits

* This replaces Neon's database and login, not its branching or point-in-time restore; use `pnpm db:backup` for safety.
* `db.batch()` locally returns raw row lists, not Drizzle-mapped rows; the current callers ignore the results.
* Receipt files (R2/Vercel Blob), OCR, and push notifications still use their own services and keys.
