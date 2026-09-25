import { describe, expect, it } from 'vitest'
import { isKnownPushService, parsePushSubscription } from '@/lib/push/subscription'
import { base64UrlEncode } from '@/lib/push/web-push'

const p256dh = base64UrlEncode(new Uint8Array([4, ...new Array(64).fill(7)]))
const auth = base64UrlEncode(new Uint8Array(16).fill(9))

describe('parsePushSubscription', () => {
  it('accepts the subscriptions Chrome, Safari, Firefox and Edge create', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/dXk3:APA91b',
      'https://web.push.apple.com/QGuQyavXutnMYnUV8NJ7p',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
    ]) {
      expect(parsePushSubscription({ endpoint, keys: { p256dh, auth }, expirationTime: null })).toEqual({ ok: true, value: { endpoint, p256dh, auth } })
    }
  })

  it('refuses endpoints the server must never be made to call', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/x', // not https
      'https://169.254.169.254/latest/meta-data', // cloud metadata
      'https://localhost/x',
      'https://fcm.googleapis.com.evil.example/x', // look-alike host
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'not a url',
      `https://fcm.googleapis.com/${'x'.repeat(2100)}`,
    ]) {
      expect(parsePushSubscription({ endpoint, keys: { p256dh, auth } }).ok).toBe(false)
    }
  })

  it('refuses malformed keys', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/x'
    expect(parsePushSubscription({ endpoint, keys: { p256dh: auth, auth } }).ok).toBe(false) // wrong length
    expect(parsePushSubscription({ endpoint, keys: { p256dh: base64UrlEncode(new Uint8Array(65).fill(2)), auth } }).ok).toBe(false) // not uncompressed
    expect(parsePushSubscription({ endpoint, keys: { p256dh, auth: p256dh } }).ok).toBe(false)
    expect(parsePushSubscription({ endpoint, keys: { p256dh: '***', auth } }).ok).toBe(false)
    expect(parsePushSubscription({ endpoint }).ok).toBe(false)
    expect(parsePushSubscription(null).ok).toBe(false)
  })
})

describe('isKnownPushService', () => {
  it('matches whole host names only', () => {
    expect(isKnownPushService('FCM.googleapis.com')).toBe(true)
    expect(isKnownPushService('evilfcm.googleapis.com')).toBe(false)
    expect(isKnownPushService('push.apple.com.example')).toBe(false)
  })
})
