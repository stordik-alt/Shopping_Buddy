import { auth } from '@/lib/auth/server'

// Next.js 16 route-protection entry point (successor to middleware.ts).
// Redirects unauthenticated requests to /auth/sign-in; leaves the auth API,
// auth pages, invite landing pages, cron jobs and static assets reachable so
// someone who isn't signed in yet can still see what they were invited to and
// sign up. `api/cron` has no user session to check — Vercel's scheduler calls
// it directly — and authorizes itself instead via the CRON_SECRET header
// check in app/api/cron/*/route.ts.
export default auth.middleware({ loginUrl: '/auth/sign-in' })

export const config = {
  matcher: ['/((?!api/auth|api/cron|auth/|invite/|_next/static|_next/image|favicon.ico).*)'],
}
