import { auth } from '@/lib/auth/server'

// Next.js 16 route-protection entry point (successor to middleware.ts).
// Redirects unauthenticated requests to /auth/sign-in; leaves the auth API,
// auth pages, invite landing pages, intro screen, cron jobs and static assets reachable.
// api/cron has no user session to check — Vercel's scheduler calls it directly —
// and authorizes itself via the CRON_SECRET header check in app/api/cron/*/route.ts.
export default auth.middleware({ loginUrl: '/auth/sign-in' })

export const config = {
  matcher: ['/((?!api/auth|api/cron|auth/|invite/|intro/|_next/static|_next/image|favicon.ico).*)'],
}
