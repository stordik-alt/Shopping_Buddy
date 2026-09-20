import { createNeonAuth } from '@neondatabase/auth/next/server'

// Single server-side auth instance: exposes Better Auth server methods
// (getSession, signIn, signUp, ...) plus .handler() for the API route and
// .middleware() for proxy.ts route protection.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
})
