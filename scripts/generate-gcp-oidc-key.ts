import { existsSync, writeFileSync } from 'node:fs'

// Generates the key pair for self-signed GCP OIDC (lib/gcp-oidc.ts, GCP_OIDC_TOKEN_SOURCE=self-signed),
// needed only when the app runs on a host without Vercel's OIDC token (Cloudflare Workers).
//
//   gcp-oidc-private-key.pem  → the value of the GCP_OIDC_PRIVATE_KEY secret (Cloudflare), then delete
//                               the file. Never commit it; .gitignore excludes it.
//   gcp-oidc-jwks.json        → the public key, uploaded to the Google WIF OIDC provider.
//
// Usage: pnpm gcp:oidc-key [key-id]   (default key id: shopping-buddy-<yyyy-mm-dd>)
// Nothing secret is printed. Existing files are never overwritten.

const PRIVATE_KEY_FILE = 'gcp-oidc-private-key.pem'
const JWKS_FILE = 'gcp-oidc-jwks.json'

async function main() {
  for (const file of [PRIVATE_KEY_FILE, JWKS_FILE]) {
    if (existsSync(file)) throw new Error(`${file} already exists — move it away first; it is never overwritten`)
  }
  const keyId = process.argv[2] ?? `shopping-buddy-${new Date().toISOString().slice(0, 10)}`

  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`
  const { kty, n, e } = await crypto.subtle.exportKey('jwk', pair.publicKey)

  writeFileSync(PRIVATE_KEY_FILE, pem, { mode: 0o600 })
  writeFileSync(JWKS_FILE, JSON.stringify({ keys: [{ kty, n, e, kid: keyId, alg: 'RS256', use: 'sig' }] }, null, 2) + '\n')

  console.log(`Key id: ${keyId}  (→ GCP_OIDC_KEY_ID)`)
  console.log(`Wrote ${PRIVATE_KEY_FILE} (secret) and ${JWKS_FILE} (public).`)
  console.log('Next steps: docs/cloudflare-deployment.md, "PDF OCR without Vercel OIDC".')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
