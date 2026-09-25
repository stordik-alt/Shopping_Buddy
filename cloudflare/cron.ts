import vercelConfig from '../vercel.json'

// Scheduled jobs on Cloudflare (docs/cloudflare-deployment.md). vercel.json stays the one list of
// cron jobs: on Vercel, Vercel Cron calls each path; on Cloudflare, wrangler.jsonc's `triggers.crons`
// fires the Worker's `scheduled()` handler with the cron expression, and this maps the expression
// back to the path(s) to call. `cloudflare/cron.test.ts` keeps wrangler.jsonc and vercel.json in step.

export type CronJob = { path: string; schedule: string }

export const CRON_JOBS: readonly CronJob[] = vercelConfig.crons

/** The cron expressions wrangler.jsonc must list — each distinct schedule once. */
export function cronSchedules(jobs: readonly CronJob[] = CRON_JOBS): string[] {
  return [...new Set(jobs.map((job) => job.schedule))]
}

/** The paths due for one fired cron expression. Empty for an unknown expression: a trigger left in
 *  the dashboard after its job was removed must not call anything. */
export function cronPaths(cron: string, jobs: readonly CronJob[] = CRON_JOBS): string[] {
  return jobs.filter((job) => job.schedule === cron).map((job) => job.path)
}

/** The request the Worker sends to itself for one job — the same `Authorization: Bearer
 *  $CRON_SECRET` header Vercel Cron sends, which every cron route already checks. */
export function cronRequest(path: string, cronSecret: string | undefined, origin = 'https://cron.internal'): Request {
  const headers = new Headers({ 'user-agent': 'cloudflare-cron' })
  if (cronSecret) headers.set('authorization', `Bearer ${cronSecret}`)
  return new Request(new URL(path, origin), { method: 'GET', headers })
}
