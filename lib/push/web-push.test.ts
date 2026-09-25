import { describe, expect, it, vi } from 'vitest'
import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  generateVapidKeys,
  importEphemeralKey,
  sendWebPush,
  vapidAuthorization,
} from '@/lib/push/web-push'

const utf8 = (text: string) => new Uint8Array(new TextEncoder().encode(text))

// RFC 8291 Appendix A: the complete worked example, byte for byte.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

/** The receiving browser's side of RFC 8291, to check that a message with random keys decrypts. */
async function decrypt(body: Uint8Array<ArrayBuffer>, uaPublic: Uint8Array<ArrayBuffer>, uaPrivate: CryptoKey, authSecret: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16)
  const idLength = body[20]
  const asPublic = body.slice(21, 21 + idLength)
  const ciphertext = body.slice(21 + idLength)
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivate, 256))
  const hmac = async (key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) =>
    new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data))
  const join = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
    let o = 0
    for (const p of parts) (out.set(p, o), (o += p.byteLength))
    return out
  }
    const ikm = await hmac(await hmac(authSecret, secret), join(utf8('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, join(utf8('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, join(utf8('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  expect(plain[plain.length - 1]).toBe(2) // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1))
}

async function browserSubscription() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return { keys: { endpoint: 'https://push.example.net/send/abc', p256dh: base64UrlEncode(publicKey), auth: base64UrlEncode(auth) }, publicKey, privateKey: pair.privateKey, auth }
}

describe('encryptPayload (RFC 8291)', () => {
  it('reproduces the RFC 8291 Appendix A example exactly', async () => {
    const ephemeral = await importEphemeralKey(base64UrlDecode(RFC.asPublic), base64UrlDecode(RFC.asPrivate))
    const body = await encryptPayload(utf8(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.authSecret }, { salt: base64UrlDecode(RFC.salt), ephemeral })
    expect(base64UrlEncode(body)).toBe(RFC.body)
  })

  it('produces a message the subscribing browser can decrypt, with fresh keys each time', async () => {
    const browser = await browserSubscription()
    const payload = JSON.stringify({ title: 'Rozpočet byl překročen', body: 'Měsíční výdaje právě překročily rozpočet.' })
    const first = await encryptPayload(utf8(payload), browser.keys)
    const second = await encryptPayload(utf8(payload), browser.keys)
    expect(await decrypt(first, browser.publicKey, browser.privateKey, browser.auth)).toBe(payload)
    expect(base64UrlEncode(first)).not.toBe(base64UrlEncode(second)) // new salt and sender key per message
  })

  it('rejects a malformed subscription and an oversized payload', async () => {
    const browser = await browserSubscription()
    await expect(encryptPayload(new Uint8Array(1), { ...browser.keys, auth: 'AAAA' })).rejects.toThrow('auth secret')
    await expect(encryptPayload(new Uint8Array(1), { ...browser.keys, p256dh: 'AAAA' })).rejects.toThrow('uncompressed P-256')
    await expect(encryptPayload(new Uint8Array(5000), browser.keys)).rejects.toThrow('too large')
  })
})

describe('vapidAuthorization (RFC 8292)', () => {
  it('signs an ES256 JWT for the push service origin that verifies with the public key', async () => {
    const keys = await generateVapidKeys()
    const now = new Date('2026-09-25T10:00:00Z')
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', { ...keys, subject: 'mailto:ops@example.com' }, now)

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, head, claims, signature, k] = match!
    expect(k).toBe(keys.publicKey)
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(head)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
      sub: 'mailto:ops@example.com',
    })

    const publicKey = await crypto.subtle.importKey('raw', base64UrlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, base64UrlDecode(signature), utf8(`${head}.${claims}`))
    expect(valid).toBe(true)
    // The private key never appears in what is sent.
    expect(header).not.toContain(keys.privateKey)
  })
})

describe('sendWebPush', () => {
  const vapidPromise = generateVapidKeys().then((keys) => ({ ...keys, subject: 'mailto:ops@example.com' }))

  it('posts the encrypted body with the Web Push headers', async () => {
    const browser = await browserSubscription()
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 201 }))
    const result = await sendWebPush(browser.keys, '{"title":"Ahoj"}', await vapidPromise, { fetchImpl, urgency: 'high' })
    expect(result).toEqual({ ok: true, status: 201 })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(browser.keys.endpoint)
    const headers = init!.headers as Record<string, string>
    expect(headers['Content-Encoding']).toBe('aes128gcm')
    expect(headers.TTL).toBe('86400')
    expect(headers.Urgency).toBe('high')
    expect(headers.Authorization).toMatch(/^vapid t=/)
    const body = init!.body as Uint8Array<ArrayBuffer>
    expect(headers['Content-Length']).toBe(String(body.byteLength))
    expect(await decrypt(body, browser.publicKey, browser.privateKey, browser.auth)).toBe('{"title":"Ahoj"}')
  })

  it('reports an expired subscription as gone and other failures as not gone', async () => {
    const browser = await browserSubscription()
    const vapid = await vapidPromise
    const gone = await sendWebPush(browser.keys, 'x', vapid, { fetchImpl: async () => new Response('unsubscribed', { status: 410 }) })
    expect(gone).toEqual({ ok: false, status: 410, gone: true, detail: 'unsubscribed' })
    const busy = await sendWebPush(browser.keys, 'x', vapid, { fetchImpl: async () => new Response('slow down', { status: 429 }) })
    expect(busy).toMatchObject({ ok: false, status: 429, gone: false })
  })

  it('refuses a non-https endpoint', async () => {
    const browser = await browserSubscription()
    await expect(sendWebPush({ ...browser.keys, endpoint: 'http://push.example.net/x' }, 'x', await vapidPromise, { fetchImpl: vi.fn() })).rejects.toThrow('https')
  })
})
