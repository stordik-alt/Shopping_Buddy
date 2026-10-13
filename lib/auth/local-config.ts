// Settings of the self-hosted Better Auth (lib/auth/local.ts), kept apart so they can be tested without
// starting it (docs/35_SECURITY_AUDIT.md, S15 and S22). That auth is used only with a local PostgreSQL or
// DATABASE_DRIVER=pg; production runs on Neon Auth and never reaches this.

/** The same minimum the sign-up form asks for (app/auth/sign-up/page.tsx). */
export const LOCAL_MIN_PASSWORD_LENGTH = 8

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'])

function isLoopbackDatabase(url: string | undefined): boolean {
  try {
    return url !== undefined && LOOPBACK_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

export function localAuthSettings(env: Record<string, string | undefined> = process.env) {
  const publicUrl = env.BETTER_AUTH_URL?.trim() || undefined
  // On a loopback database the origin is taken from the request, so any dev port works. Anywhere else
  // that would trust the Host/Origin header of whoever calls, so the public address must be fixed.
  if (!publicUrl && !isLoopbackDatabase(env.DATABASE_URL)) {
    throw new Error('BETTER_AUTH_URL must be set when the local auth runs against a database that is not on this machine.')
  }
  return {
    baseURL: publicUrl,
    trustedOrigins: publicUrl ? [new URL(publicUrl).origin] : undefined,
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: LOCAL_MIN_PASSWORD_LENGTH },
    // Better Auth's own limiter, switched on for every environment (it is off outside production by default):
    // sign-in is a brute-force target. Per instance and in memory, which is enough for the self-hosted fallback.
    rateLimit: { enabled: true, window: 60, max: 60 },
  }
}
