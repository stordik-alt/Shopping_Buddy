import { auth } from '@/lib/auth/server'

// Next.js 16 route-protection entry point (successor to middleware.ts).
// Redirects unauthenticated requests to /auth/sign-in; leaves the auth API,
// auth pages, invite landing pages, and static assets reachable so someone who
// isn't signed in yet can still see what they were invited to and sign up.
export default auth.middleware({ loginUrl: '/auth/sign-in' })

export const config = {
  matcher: ['/((?!api/auth|auth/|invite/|_next/static|_next/image|favicon.ico).*)'],
}
