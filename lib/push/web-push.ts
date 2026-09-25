// Web Push sending (the protocol behind phone/browser push notifications), built on WebCrypto only
// so it runs unchanged on Vercel's Node runtime and on Cloudflare Workers (docs/cloudflare-*.md).
// The usual `web-push` npm package depends on Node's crypto and several helper packages; the two
// pieces it provides are small and fully specified, so they are implemented here and tested against
// the RFC's own test vector (lib/push/web-push.test.ts):
//
//  - RFC 8291 message encryption (content coding "aes128gcm", RFC 8188): only the browser that
//    created the subscription can read the payload — the push service (Google, Apple, Mozilla)
//    relays ciphertext.
//  - RFC 8292 VAPID: a short-lived ES256 JWT that proves the request comes from this app's server,
//    the one whose public key the browser was given when it subscribed.
//
// Keys are server-only environment variables (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, generated with
// `pnpm push:vapid-keys`); the private key never leaves the server and is never logged.

/** What the browser hands over after `pushManager.subscribe()` (PushSubscription.toJSON()). */
export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string }

export type VapidKeys = {
  /** Uncompressed P-256 public key (65 bytes), base64url — also given to the browser. */
  publicKey: string
  /** The private scalar `d` (32 bytes), base64url. */
  privateKey: string
  /** Contact the push service can use about this sender: `mailto:…` or an `https:` URL. */
  subject: string
}

export type PushResult =
  | { ok: true; status: number }
  // `gone`: the subscription no longer exists (unsubscribed, app removed, expired) and must be deleted.
  | { ok: false; status: number; gone: boolean; detail: string }

const encoder = new TextEncoder()
// A copy typed as backed by a plain ArrayBuffer, which is what WebCrypto's typings require.
const encode = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(encoder.encode(text))

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

async function hmacSha256(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data))
}

/** HKDF (RFC 5869) with SHA-256, for outputs of at most 32 bytes (one expand block). */
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const prk = await hmacSha256(salt, ikm)
  return (await hmacSha256(prk, concat(info, new Uint8Array([1])))).slice(0, length)
}

/** A P-256 key as JWK from its uncompressed public point (0x04 ‖ x ‖ y) and optional private `d`. */
function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  if (publicKey.byteLength !== 65 || publicKey[0] !== 0x04) throw new Error('Expected an uncompressed P-256 public key (65 bytes)')
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
    ...(privateKey ? { d: base64UrlEncode(privateKey) } : {}),
    ext: true,
  }
}

/** The sender's one-time ECDH key pair; generated per message, injectable only for the RFC test vector. */
export type EphemeralKey = { publicKey: Uint8Array<ArrayBuffer>; privateKey: CryptoKey }

export async function generateEphemeralKey(): Promise<EphemeralKey> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  return { publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)), privateKey: pair.privateKey }
}

export async function importEphemeralKey(publicKey: Uint8Array<ArrayBuffer>, privateKey: Uint8Array): Promise<EphemeralKey> {
  const key = await crypto.subtle.importKey('jwk', p256Jwk(publicKey, privateKey), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  return { publicKey, privateKey: key }
}

// One record is enough: payloads here are a title and a sentence, far below the 4 kB limit the push
// services accept, so the whole message is the single, final record.
const RECORD_SIZE = 4096
const MAX_PLAINTEXT = 3993 // 4096 minus header room, AES-GCM tag and delimiter; what push services accept

/** Encrypts `payload` for one subscription (RFC 8291 §3.4, RFC 8188 §2). Returns the request body. */
export async function encryptPayload(
  payload: Uint8Array<ArrayBuffer>,
  subscription: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  options: { salt?: Uint8Array<ArrayBuffer>; ephemeral?: EphemeralKey } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (payload.byteLength > MAX_PLAINTEXT) throw new Error(`Push payload too large (${payload.byteLength} B)`)
  const uaPublic = base64UrlDecode(subscription.p256dh)
  const authSecret = base64UrlDecode(subscription.auth)
  if (authSecret.byteLength !== 16) throw new Error('Invalid push subscription auth secret')

  const ephemeral = options.ephemeral ?? (await generateEphemeralKey())
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const uaKey = await crypto.subtle.importKey('jwk', p256Jwk(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256))

  // IKM binds the shared secret to both public keys and the subscription's auth secret (§3.3).
  const keyInfo = concat(encode('WebPush: info\0'), uaPublic, ephemeral.publicKey)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const cek = await hkdf(salt, ikm, encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encode('Content-Encoding: nonce\0'), 12)

  // 0x02 marks the last (here: only) record; no padding.
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))))

  // Header: salt ‖ record size (uint32 BE) ‖ key id length ‖ key id (= the sender's public key).
  const header = new Uint8Array(16 + 4 + 1)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = ephemeral.publicKey.byteLength
  return concat(header, ephemeral.publicKey, ciphertext)
}

/** The `Authorization: vapid t=…, k=…` header value for one push service origin (RFC 8292 §2–3). */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now: Date = new Date()): Promise<string> {
  const publicKey = base64UrlDecode(vapid.publicKey)
  const key = await crypto.subtle.importKey('jwk', p256Jwk(publicKey, base64UrlDecode(vapid.privateKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = base64UrlEncode(encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  // 12 h: well under the 24 h maximum push services accept.
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: vapid.subject }
  const body = base64UrlEncode(encode(JSON.stringify(claims)))
  // WebCrypto's ECDSA signature is already JOSE's raw r ‖ s form.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encode(`${header}.${body}`)))
  return `vapid t=${header}.${body}.${base64UrlEncode(signature)}, k=${vapid.publicKey}`
}

/** Sends one encrypted push message. Never throws for an HTTP failure: the caller decides what a
 *  rejected or expired subscription means (see lib/push/deliver.ts). */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  options: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; fetchImpl?: typeof fetch } = {},
): Promise<PushResult> {
  const endpoint = new URL(subscription.endpoint)
  if (endpoint.protocol !== 'https:') throw new Error('Push endpoint must use https')
  const body = await encryptPayload(encode(payload), subscription)
  const response = await (options.fetchImpl ?? fetch)(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.byteLength),
      // How long the push service keeps the message for an offline phone: a day, then it is stale.
      TTL: String(options.ttlSeconds ?? 24 * 3600),
      Urgency: options.urgency ?? 'normal',
    },
    body,
  })
  if (response.ok) return { ok: true, status: response.status }
  const detail = (await response.text().catch(() => '')).slice(0, 300)
  // 404/410: the push service says this subscription is gone for good (RFC 8030 §7.3).
  return { ok: false, status: response.status, gone: response.status === 404 || response.status === 410, detail }
}

/** A new VAPID key pair (used by `pnpm push:vapid-keys`). */
export async function generateVapidKeys(): Promise<Pick<VapidKeys, 'publicKey' | 'privateKey'>> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  if (!jwk.d) throw new Error('Generated key has no private part')
  return { publicKey: base64UrlEncode(publicKey), privateKey: jwk.d }
}
