import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const getVercelOidcTokenMock = vi.fn()
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: () => getVercelOidcTokenMock() }))

import { googleSubjectToken, googleSubjectTokenSource, pemToDer, signRs256Jwt } from '@/lib/gcp-oidc'

const AUDIENCE = '//iam.googleapis.com/projects/123456/locations/global/workloadIdentityPools/pool/providers/cloudflare'
const ENV = ['GCP_OIDC_TOKEN_SOURCE', 'GCP_OIDC_ISSUER', 'GCP_OIDC_KEY_ID', 'GCP_OIDC_PRIVATE_KEY', 'GCP_OIDC_SUBJECT']

let privateKeyPem: string
let publicKey: CryptoKey

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`
  publicKey = pair.publicKey
})

afterEach(() => {
  for (const name of ENV) delete process.env[name]
  getVercelOidcTokenMock.mockReset()
})

function decode(jwt: string) {
  const [header, claims] = jwt.split('.').slice(0, 2).map((part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')))
  return { header, claims }
}

async function verify(jwt: string): Promise<boolean> {
  const [header, claims, signature] = jwt.split('.')
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${claims}`))
}

function configureSelfSigned() {
  process.env.GCP_OIDC_TOKEN_SOURCE = 'self-signed'
  process.env.GCP_OIDC_ISSUER = 'https://shopping-buddy.example/oidc'
  process.env.GCP_OIDC_KEY_ID = 'key-2026-09'
  process.env.GCP_OIDC_PRIVATE_KEY = privateKeyPem
}

describe('googleSubjectTokenSource', () => {
  it('defaults to Vercel, so production behaves as before', () => {
    expect(googleSubjectTokenSource()).toBe('vercel')
  })

  it('rejects an unknown source instead of falling back', () => {
    process.env.GCP_OIDC_TOKEN_SOURCE = 'cloudflare'
    expect(() => googleSubjectTokenSource()).toThrow('Unknown GCP_OIDC_TOKEN_SOURCE')
  })
})

describe('googleSubjectToken — vercel', () => {
  it("returns Vercel's OIDC token", async () => {
    getVercelOidcTokenMock.mockResolvedValue('vercel-oidc-jwt')
    await expect(googleSubjectToken(AUDIENCE)).resolves.toBe('vercel-oidc-jwt')
  })

  it('fails when Vercel provides none', async () => {
    getVercelOidcTokenMock.mockResolvedValue('')
    await expect(googleSubjectToken(AUDIENCE)).rejects.toThrow('Vercel OIDC token is not available')
  })
})

describe('googleSubjectToken — self-signed', () => {
  it('signs a short-lived RS256 JWT for the WIF provider, verifiable with the public key', async () => {
    configureSelfSigned()
    const jwt = await googleSubjectToken(AUDIENCE)

    expect(await verify(jwt)).toBe(true)
    const { header, claims } = decode(jwt)
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'key-2026-09' })
    expect(claims.iss).toBe('https://shopping-buddy.example/oidc')
    expect(claims.sub).toBe('shopping-buddy')
    expect(claims.aud).toBe(`https:${AUDIENCE}`)
    expect(claims.exp - claims.iat).toBe(600)
    expect(Math.abs(claims.iat - Date.now() / 1000)).toBeLessThan(5)
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled()
  })

  it('uses GCP_OIDC_SUBJECT when set (e.g. to tell staging from production)', async () => {
    configureSelfSigned()
    process.env.GCP_OIDC_SUBJECT = 'shopping-buddy-staging'
    expect(decode(await googleSubjectToken(AUDIENCE)).claims.sub).toBe('shopping-buddy-staging')
  })

  it('accepts a key pasted with literal \\n sequences', async () => {
    configureSelfSigned()
    process.env.GCP_OIDC_PRIVATE_KEY = privateKeyPem.replace(/\n/g, '\\n')
    expect(await verify(await googleSubjectToken(AUDIENCE))).toBe(true)
  })

  it('names the missing settings without calling anything', async () => {
    process.env.GCP_OIDC_TOKEN_SOURCE = 'self-signed'
    process.env.GCP_OIDC_ISSUER = 'https://shopping-buddy.example/oidc'
    await expect(googleSubjectToken(AUDIENCE)).rejects.toThrow('Missing: GCP_OIDC_KEY_ID, GCP_OIDC_PRIVATE_KEY')
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled()
  })
})

describe('signRs256Jwt / pemToDer', () => {
  it('rejects something that is not a PEM key', async () => {
    expect(() => pemToDer('-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----')).toThrow('not a PEM private key')
    await expect(signRs256Jwt({ alg: 'RS256' }, {}, 'not-a-key')).rejects.toThrow()
  })
})
