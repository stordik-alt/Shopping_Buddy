import { getVercelOidcToken } from '@vercel/oidc'

// The OIDC "subject token" that Google Workload Identity Federation exchanges for a Google access
// token (PDF OCR, lib/receipts.ts). Service-account JSON keys are blocked by the Google organization
// policy (iam.disableServiceAccountKeyCreation), so the app proves its identity with a short-lived
// signed JWT instead. Two sources, chosen by GCP_OIDC_TOKEN_SOURCE:
//
//   vercel (default)  Vercel's own OIDC token (@vercel/oidc) — what production uses today.
//   self-signed       A JWT the app signs itself with a private key held as a secret. For hosts
//                     without a platform OIDC token, i.e. Cloudflare Workers. Google trusts it through
//                     a WIF OIDC provider configured with the matching public key (uploaded JWKS), so
//                     no service-account key is ever created. Setup: docs/cloudflare-deployment.md.

export type GoogleSubjectTokenSource = 'vercel' | 'self-signed'

export function googleSubjectTokenSource(): GoogleSubjectTokenSource {
  const value = (process.env.GCP_OIDC_TOKEN_SOURCE ?? 'vercel').trim().toLowerCase()
  if (value === 'vercel' || value === 'self-signed') return value
  // A typo must not silently fall back to a source that cannot work on this host.
  throw new Error(`Unknown GCP_OIDC_TOKEN_SOURCE "${value}" (expected "vercel" or "self-signed")`)
}

/** A subject token for the WIF provider identified by `providerAudience`
 *  (`//iam.googleapis.com/projects/…/providers/…`, the STS `audience` parameter). */
export async function googleSubjectToken(providerAudience: string): Promise<string> {
  if (googleSubjectTokenSource() === 'vercel') {
    // Vercel's supported helper, instead of reading the OIDC header/environment variable directly:
    // it refreshes the token in development and reads the request-context token in Vercel Functions.
    const token = await getVercelOidcToken()
    if (!token) throw new Error('Vercel OIDC token is not available')
    return token
  }
  return selfSignedSubjectToken(providerAudience)
}

const SELF_SIGNED_ENV = ['GCP_OIDC_ISSUER', 'GCP_OIDC_KEY_ID', 'GCP_OIDC_PRIVATE_KEY'] as const

/** Lifetime of a self-signed token. It is exchanged immediately, so a few minutes is plenty and
 *  limits the damage if one ever leaked. */
const SELF_SIGNED_LIFETIME_SECONDS = 600

async function selfSignedSubjectToken(providerAudience: string, now = Date.now()): Promise<string> {
  const missing = SELF_SIGNED_ENV.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) throw new Error(`Self-signed GCP OIDC is not configured. Missing: ${missing.join(', ')}`)

  const iat = Math.floor(now / 1000)
  return signRs256Jwt(
    { alg: 'RS256', typ: 'JWT', kid: process.env.GCP_OIDC_KEY_ID!.trim() },
    {
      iss: process.env.GCP_OIDC_ISSUER!.trim(),
      sub: process.env.GCP_OIDC_SUBJECT?.trim() || 'shopping-buddy',
      // A WIF OIDC provider without explicit "allowed audiences" accepts exactly its own full
      // resource name as `https://iam.googleapis.com/projects/…` — the STS audience with `https:`.
      aud: `https:${providerAudience}`,
      iat,
      exp: iat + SELF_SIGNED_LIFETIME_SECONDS,
    },
    process.env.GCP_OIDC_PRIVATE_KEY!,
  )
}

/** Signs a compact JWS with RS256 using a PKCS#8 PEM private key. WebCrypto only, so it runs the
 *  same on Node.js (Vercel) and Workers. */
export async function signRs256Jwt(header: Record<string, unknown>, claims: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`
}

function base64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

/** PEM → DER. Accepts a key pasted into a dashboard with literal `\n` sequences instead of newlines. */
export function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  if (!body) throw new Error('GCP_OIDC_PRIVATE_KEY is not a PEM private key')
  const der = Buffer.from(body, 'base64')
  return der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer
}
