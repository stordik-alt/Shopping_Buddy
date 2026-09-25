import { describe, expect, it } from 'vitest'
import { pushAvailability, type BrowserPushFacts } from '@/lib/push/client'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const SAFARI_IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

const full: BrowserPushFacts = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: 'default', userAgent: CHROME_ANDROID, maxTouchPoints: 5 }

describe('pushAvailability', () => {
  it('is available where the browser has Web Push and the user has not blocked it', () => {
    expect(pushAvailability(full)).toBe('available')
    expect(pushAvailability({ ...full, permission: 'granted' })).toBe('available')
    // The installed iPhone app has PushManager: available like anywhere else.
    expect(pushAvailability({ ...full, userAgent: SAFARI_IPHONE })).toBe('available')
  })

  it('asks iPhone and iPad users to add the app to the home screen first', () => {
    const tab = { ...full, hasPushManager: false, hasNotification: false }
    expect(pushAvailability({ ...tab, userAgent: SAFARI_IPHONE })).toBe('ios-needs-install')
    expect(pushAvailability({ ...tab, userAgent: SAFARI_IPAD, maxTouchPoints: 5 })).toBe('ios-needs-install')
  })

  it('reports a blocked permission and a browser without push', () => {
    expect(pushAvailability({ ...full, permission: 'denied' })).toBe('denied')
    expect(pushAvailability({ ...full, hasServiceWorker: false })).toBe('unsupported')
    expect(pushAvailability({ ...full, hasPushManager: false, userAgent: SAFARI_IPAD, maxTouchPoints: 0 })).toBe('unsupported') // a real Mac
  })
})
