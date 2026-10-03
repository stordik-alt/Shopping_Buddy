import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

// Authorization for the app/api/cron/* routes. proxy.ts excludes them from session protection, so
// this check is all that stands between the internet and jobs that write to the database and spend
// paid OCR/LLM calls. Vercel Cron (and cloudflare/cron.ts, which imitates it) sends
// `Authorization: Bearer $CRON_SECRET`.
//
// Fails closed: without a configured CRON_SECRET every request is refused — on a developer's
// machine too, where a job is run by hand with the header and the secret from .env.local. The check
// used to be skipped whenever the variable was missing, which left the jobs open to anyone on any
// deployment (a new preview, the Cloudflare Worker) where it had not been set yet, and once let a
// local smoke request write 77 duplicate prices into the shared database (docs/07_CHANGELOG.md).

/** Returns the response that refuses the request, or `null` when the cron job may run. */
export function rejectUnauthorizedCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // A deployment problem, not the caller's: say so in the logs, reveal nothing in the response.
    console.error('[cron] CRON_SECRET is not configured; refusing the cron request')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  if (!matchesSecret(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

/** Constant-time comparison, so response timing does not reveal how much of a guess was right. */
function matchesSecret(received: string | null, expected: string): boolean {
  if (received == null) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
