import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { usesPgDriver } from '@/lib/db/local'

// Bearer-JWT authentication for the native (Expo) client. The PWA keeps using Neon Auth cookies
// (lib/auth/server.ts) untouched. The mobile app signs in through /api/auth/*, obtains a JWT from Neon
// Auth (client getJWTToken(), a token signed with the service's private key) and sends it as
// `Authorization: Bearer <jwt>`. Here the signature (against the JWKS published by Neon Auth), issuer
// and expiry are verified; the user id comes only from the verified `sub` claim.

export type BearerUser = { id: string; email: string; name: string; emailVerified: boolean }

/** Why a bearer token was refused. `unavailable` means this deployment cannot verify bearer tokens. */
export class BearerAuthError extends Error {
  constructor(readonly reason: 'missing' | 'invalid' | 'unverified_email' | 'unavailable', message: string) {
    super(message)
  }
}

// Neon Auth signs with asymmetric keys; HS256 is refused so a public value can never act as a secret.
const ALGORITHMS = ['EdDSA', 'ES256', 'RS256']
const CLOCK_TOLERANCE_SECONDS = 5

export type BearerConfig = { jwksUrl: URL; issuer: string }

/** JWKS location and expected issuer, derived from NEON_AUTH_BASE_URL (NEON_AUTH_JWT_ISSUER overrides the
 *  issuer, which is the origin of the auth endpoint). Null when Neon Auth is not configured. */
export function bearerConfig(env: Record<string, string | undefined> = process.env): BearerConfig | null {
  const base = env.NEON_AUTH_BASE_URL
  if (!base || usesPgDriver(env.DATABASE_URL, env)) return null
  try {
    const url = new URL(base.endsWith('/') ? base : `${base}/`)
    if (url.protocol !== 'https:') return null
    return { jwksUrl: new URL('.well-known/jwks.json', url), issuer: env.NEON_AUTH_JWT_ISSUER || url.origin }
  } catch {
    return null
  }
}

/** The token of an `Authorization: Bearer` header, or null when the header is absent or not Bearer. */
export function bearerTokenFrom(headers: Headers): string | null {
  const value = headers.get('authorization')
  const match = value ? /^Bearer\s+(\S+)$/i.exec(value.trim()) : null
  return match ? match[1] : null
}

let cachedJwks: { url: string; keys: JWTVerifyGetKey } | null = null
function defaultKeys(config: BearerConfig): JWTVerifyGetKey {
  // createRemoteJWKSet caches keys and refetches on an unknown kid (key rotation), with a cooldown.
  if (cachedJwks?.url !== config.jwksUrl.href) cachedJwks = { url: config.jwksUrl.href, keys: createRemoteJWKSet(config.jwksUrl) }
  return cachedJwks.keys
}

/** Verifies the JWT's signature, issuer and expiry and returns the user id (`sub`). Throws `BearerAuthError`. */
export async function verifyBearerJwt(token: string, config: BearerConfig, keys: JWTVerifyGetKey = defaultKeys(config)): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer,
      algorithms: ALGORITHMS,
      requiredClaims: ['exp', 'sub'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new BearerAuthError('invalid', 'Token has no subject')
    return payload.sub
  } catch (error) {
    if (error instanceof BearerAuthError) throw error
    // Expired, bad signature, wrong issuer, malformed: all "invalid"; the client re-fetches a token.
    throw new BearerAuthError('invalid', error instanceof Error ? error.name : 'Invalid token')
  }
}

/** Authenticates a request by its Bearer token. The user is then re-read from the database, so a deleted
 *  account is refused and e-mail verification is enforced exactly as on the web (never trusted from the token). */
export async function requireBearerUser(
  headers: Headers,
  deps: { config?: BearerConfig | null; keys?: JWTVerifyGetKey; loadUser?: (id: string) => Promise<BearerUser | null> } = {},
): Promise<BearerUser> {
  const token = bearerTokenFrom(headers)
  if (!token) throw new BearerAuthError('missing', 'No bearer token')
  const config = deps.config === undefined ? bearerConfig() : deps.config
  if (!config) throw new BearerAuthError('unavailable', 'Bearer verification is not configured')
  const userId = await verifyBearerJwt(token, config, deps.keys)
  const user = await (deps.loadUser ?? loadAuthUser)(userId)
  if (!user) throw new BearerAuthError('invalid', 'Unknown user')
  if (!user.emailVerified) throw new BearerAuthError('unverified_email', 'E-mail is not verified')
  return user
}

async function loadAuthUser(id: string): Promise<BearerUser | null> {
  const result = await getDb().execute(
    sql`select id::text as id, email, name, "emailVerified" as "emailVerified" from neon_auth."user" where id = ${id}::uuid limit 1`,
  )
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Array<{ id: string; email: string; name: string; emailVerified: boolean }>
  const row = rows[0]
  return row ? { id: row.id, email: row.email, name: row.name, emailVerified: row.emailVerified === true } : null
}
