import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { BearerAuthError, bearerConfig, bearerTokenFrom, requireBearerUser, verifyBearerJwt } from '@/lib/auth/bearer'

const ISSUER = 'https://ep-test.neonauth.example.com'
const config = { jwksUrl: new URL(`${ISSUER}/neondb/auth/.well-known/jwks.json`), issuer: ISSUER }

let privateKey: CryptoKey
let otherKey: CryptoKey
let keys: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { extractable: true })
  privateKey = pair.privateKey
  otherKey = (await generateKeyPair('EdDSA')).privateKey
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'EdDSA' }] })
})

const sign = (claims: { sub?: string; iss?: string; exp?: string | number }, key = () => privateKey) => {
  const jwt = new SignJWT({}).setProtectedHeader({ alg: 'EdDSA', kid: 'k1' }).setIssuedAt().setIssuer(claims.iss ?? ISSUER)
  if (claims.sub !== undefined) jwt.setSubject(claims.sub)
  if (claims.exp !== undefined) jwt.setExpirationTime(claims.exp)
  return jwt.sign(key())
}

describe('bearerTokenFrom', () => {
  it('reads only a Bearer token', () => {
    expect(bearerTokenFrom(new Headers({ authorization: 'Bearer abc.def' }))).toBe('abc.def')
    expect(bearerTokenFrom(new Headers({ authorization: 'Basic abc' }))).toBeNull()
    expect(bearerTokenFrom(new Headers())).toBeNull()
  })
})

describe('bearerConfig', () => {
  it('derives JWKS and issuer from the Neon Auth URL and refuses non-https or local setups', () => {
    const c = bearerConfig({ NEON_AUTH_BASE_URL: `${ISSUER}/neondb/auth`, DATABASE_URL: 'postgres://u@ep.neon.tech/db' })
    expect(c?.jwksUrl.href).toBe(`${ISSUER}/neondb/auth/.well-known/jwks.json`)
    expect(c?.issuer).toBe(ISSUER)
    expect(bearerConfig({})).toBeNull()
    expect(bearerConfig({ NEON_AUTH_BASE_URL: 'http://x.test/auth' })).toBeNull()
    expect(bearerConfig({ NEON_AUTH_BASE_URL: `${ISSUER}/a`, DATABASE_URL: 'postgres://u@localhost/db' })).toBeNull()
  })
})

describe('verifyBearerJwt', () => {
  it('accepts a valid token and returns the subject', async () => {
    expect(await verifyBearerJwt(await sign({ sub: 'user-1', exp: '5m' }), config, keys)).toBe('user-1')
  })
  it.each([
    ['expired', () => sign({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['wrong issuer', () => sign({ sub: 'u', exp: '5m', iss: 'https://evil.example.com' })],
    ['bad signature', () => sign({ sub: 'u', exp: '5m' }, () => otherKey)],
    ['no subject', () => sign({ exp: '5m' })],
    ['no expiry', () => sign({ sub: 'u' })],
    ['malformed', async () => 'not-a-jwt'],
  ])('rejects %s', async (_name, make) => {
    await expect(verifyBearerJwt(await make(), config, keys)).rejects.toBeInstanceOf(BearerAuthError)
  })
})

describe('requireBearerUser', () => {
  const headers = async (sub = 'u1') => new Headers({ authorization: `Bearer ${await sign({ sub, exp: '5m' })}` })
  const user = { id: 'u1', email: 'a@b.cz', name: 'A', emailVerified: true }

  it('returns the database user for a valid token', async () => {
    expect(await requireBearerUser(await headers(), { config, keys, loadUser: async () => user })).toEqual(user)
  })
  it('refuses a missing header, an unconfigured server, an unknown user and an unverified e-mail', async () => {
    const reason = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as BearerAuthError).reason
    expect(await reason(requireBearerUser(new Headers(), { config, keys }))).toBe('missing')
    expect(await reason(requireBearerUser(await headers(), { config: null }))).toBe('unavailable')
    expect(await reason(requireBearerUser(await headers(), { config, keys, loadUser: async () => null }))).toBe('invalid')
    expect(await reason(requireBearerUser(await headers(), { config, keys, loadUser: async () => ({ ...user, emailVerified: false }) }))).toBe('unverified_email')
  })
})
