import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendExpoPush } from '@/lib/push/deliver'

describe('sendExpoPush', () => {
  const token = 'ExponentPushToken[abc-123_xyz]'
  const endpoint = `https://exp.host/--/api/v2/push/send?to=${encodeURIComponent(token)}`
  const message = { title: 'ANITKA', body: 'Rozpočet', url: '/?tab=rozpocet', tag: 'budget' }

  beforeEach(() => {
    delete process.env.EXPO_ACCESS_TOKEN
  })

  afterEach(() => vi.unstubAllGlobals())

  it('sends the message and target route through Expo Push Service', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket-1' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(sendExpoPush(endpoint, message)).resolves.toEqual({ ok: true, status: 200 })
    expect(fetch).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ to: token, sound: 'default', title: message.title, body: message.body, data: { url: message.url, tag: message.tag } }),
    }))
  })

  it('marks expired Expo tokens for removal', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ data: { status: 'error', message: 'Device not registered', details: { error: 'DeviceNotRegistered' } } }), { status: 200 })))
    await expect(sendExpoPush(endpoint, message)).resolves.toMatchObject({ ok: false, gone: true })
  })

  it('rejects a token endpoint that does not match the Expo gateway', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetch)
    await expect(sendExpoPush('https://example.com/not-expo', message)).resolves.toMatchObject({ ok: false, gone: true })
    expect(fetch).not.toHaveBeenCalled()
  })
})
