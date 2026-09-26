// When `pnpm build` applies the database migrations (lib/db/migrate.ts --vercel-production). Only a
// Vercel production deployment does: its migrations reach production before its code does, so code
// never runs against a database that lacks its columns (on 2026-09-26 the pantry's migration 0033 was
// found unapplied a day after its code went live). Preview deployments, CI and the Cloudflare build
// run the same `build` script and must never touch the production database, so they skip. Pure.

export type DeployDecision = { migrate: true } | { migrate: false; reason: string }

export function deployMigrationDecision(env: Record<string, string | undefined>): DeployDecision {
  if (env.VERCEL !== '1') return { migrate: false, reason: 'not a Vercel build (local, CI or Cloudflare)' }
  // Without VERCEL_ENV a production build cannot be told from a preview. Guessing either way is wrong
  // (skipping would bring back the bug this exists for), so the build stops and says why.
  if (!env.VERCEL_ENV) {
    throw new Error('VERCEL_ENV is not set during the build: enable "Automatically expose System Environment Variables" in the Vercel project settings')
  }
  if (env.VERCEL_ENV !== 'production') return { migrate: false, reason: `a ${env.VERCEL_ENV} deployment, not production` }
  return { migrate: true }
}
