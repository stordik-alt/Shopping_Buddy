import { auth } from '@/lib/auth/server'

// Next.js 16 route-protection entry point (successor to middleware.ts).
// Redirects unauthenticated requests to /auth/sign-in; leaves the auth API,
// auth pages, and static assets reachable so the login page itself can load.
export default auth.middleware({ loginUrl: '/auth/sign-in' })

export const config = {
  matcher: ['/((?!api/auth|auth/|_next/static|_next/image|favicon.ico).*)'],
}
