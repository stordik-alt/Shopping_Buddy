import { auth } from '@/lib/auth/server'

// Next.js 16 route-protection entry point (successor to middleware.ts).
// The public root is intentionally left to app/page.tsx so unauthenticated
// visitors can be sent through the Buddy intro before the login screen.
export default auth.middleware({ loginUrl: '/auth/sign-in' })

export const config = {
  matcher: ['/((?!api/auth|api/cron|auth/|invite/|intro/|_next/static|_next/image|favicon.ico|$).*)'],
}
