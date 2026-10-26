import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-observe', () => ({ Observe: { reportError: vi.fn(), dispatchEvents: vi.fn().mockResolvedValue(undefined) } }))

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getToken: vi.fn(),
  signInEmail: vi.fn(),
  signOut: vi.fn().mockResolvedValue({}),
  adapterOptions: vi.fn(),
  values: new Map<string, string>(),
  config: { localAuth: false },
}))

vi.mock('@neondatabase/auth', () => ({
  createAuthClient: () => ({ getSession: mocks.getSession, token: mocks.getToken, signIn: { email: mocks.signInEmail }, signOut: mocks.signOut }),
}))
vi.mock('@neondatabase/auth/vanilla/adapters', () => ({
  BetterAuthVanillaAdapter: (options: unknown) => {
    mocks.adapterOptions(options)
    return () => ({})
  },
}))
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: mocks.config } } }))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'mobile-auth-test-id',
  getRandomValues: (typedArray: Uint8Array) => typedArray,
}))
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mocks.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mocks.values.set(key, value),
  deleteItemAsync: async (key: string) => void mocks.values.delete(key),
}))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('./config', () => ({ getApiUrl: () => 'https://anitka.example' }))

import { Observe } from 'expo-observe'
import { getAccessToken, hasLocalAuthSession, signIn, signOut } from './auth'

const TEST_JWT = 'header.payload.signature'

describe('mobile auth token cache', () => {
  beforeEach(async () => {
    mocks.values.clear()
    mocks.config.localAuth = false
    await signOut()
    vi.clearAllMocks()
  })

  it('uses the last saved bearer token when refresh cannot reach Neon Auth', async () => {
    mocks.values.set('anitka.auth.jwt', TEST_JWT)
    mocks.getToken.mockRejectedValue(new Error('Network request failed'))

    await expect(getAccessToken()).resolves.toBe(TEST_JWT)
  })

  it('stores and returns a fresh bearer token from Neon Auth', async () => {
    mocks.getToken.mockResolvedValue({ data: { token: TEST_JWT } })

    await expect(getAccessToken()).resolves.toBe(TEST_JWT)
    expect(mocks.getToken).toHaveBeenCalledOnce()
    expect(mocks.values.get('anitka.auth.jwt')).toBe(TEST_JWT)
  })

  it('does not return a non-JWT response as a bearer token', async () => {
    mocks.getToken.mockResolvedValue({ data: { token: 'opaque-session-id' } })

    await expect(getAccessToken()).resolves.toBeNull()
    expect(mocks.values.has('anitka.auth.jwt')).toBe(false)
  })

  it('accepts a stored local-auth cookie when the session has no Neon JWT', async () => {
    mocks.config.localAuth = true
    mocks.values.set('anitka.auth.cookies', 'better-auth.session_token=local-session')
    mocks.signInEmail.mockResolvedValue({ data: {} })
    mocks.getSession.mockResolvedValue({ data: { session: { token: 'opaque-session-id' } } })

    await expect(signIn('mobile@example.com', 'password123')).resolves.toBeUndefined()
  })

  it('accepts a local session managed by the React Native cookie jar', async () => {
    mocks.config.localAuth = true
    mocks.signInEmail.mockResolvedValue({ data: {} })
    mocks.getSession.mockResolvedValue({ data: { session: { token: 'opaque-session-id' } } })

    await expect(signIn('mobile@example.com', 'password123')).resolves.toBeUndefined()
    expect(mocks.values.has('anitka.auth.cookies')).toBe(false)
    expect(mocks.adapterOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      fetchOptions: expect.objectContaining({
        credentials: 'include',
        headers: { origin: 'https://anitka.example' },
        onSuccess: expect.any(Function),
      }),
    }))
    await expect(hasLocalAuthSession()).resolves.toBe(true)
    await expect(getAccessToken()).resolves.toBeNull()
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('does not query Neon Auth again after a local session has been verified', async () => {
    mocks.config.localAuth = true
    mocks.getSession.mockResolvedValue({ data: { session: { token: 'opaque-session-id' } } })

    await expect(getAccessToken()).resolves.toBeNull()
    await expect(getAccessToken()).resolves.toBeNull()

    expect(mocks.getSession).toHaveBeenCalledTimes(1)
    await expect(hasLocalAuthSession()).resolves.toBe(true)
  })

  it('persists cookies and Neon JWTs from the adapter response hook', async () => {
    mocks.config.localAuth = true
    mocks.signInEmail.mockResolvedValue({ data: {} })
    mocks.getSession.mockResolvedValue({ data: { session: { token: 'opaque-session-id' } } })
    await signIn('mobile@example.com', 'password123')

    const options = mocks.adapterOptions.mock.lastCall?.[0] as {
      fetchOptions: { onSuccess: (context: { response: Response }) => Promise<void> }
    }
    await options.fetchOptions.onSuccess({
      response: new Response(null, {
        headers: {
          'set-cookie': 'better-auth.session_token=signed-session; Path=/; HttpOnly; Max-Age=3600',
          'set-auth-jwt': TEST_JWT,
        },
      }),
    })

    expect(mocks.values.get('anitka.auth.cookies')).toBe('better-auth.session_token=signed-session')
    expect(mocks.values.get('anitka.auth.jwt')).toBe(TEST_JWT)
  })

  it('sends the persisted Neon Auth cookie with later auth requests', async () => {
    mocks.values.set('anitka.auth.cookies', 'neon-auth.session_token=signed-session')
    mocks.getToken.mockResolvedValue({ data: { token: TEST_JWT } })

    await getAccessToken()

    const options = mocks.adapterOptions.mock.lastCall?.[0] as {
      fetchOptions: { onRequest: (request: { headers: Headers }) => Promise<void> }
    }
    const request = { headers: new Headers() }
    await options.fetchOptions.onRequest(request)

    expect(request.headers.get('cookie')).toBe('neon-auth.session_token=signed-session')
  })

  it('reports Neon Auth 429 and shows a temporary service message', async () => {
    mocks.signInEmail.mockResolvedValue({ error: { status: 429, message: 'Too Many Requests' } })

    await expect(signIn('mobile@example.com', 'password123')).rejects.toThrow(
      'Přihlašovací služba je dočasně přetížená. Počkejte chvíli a zkuste to znovu.',
    )
    expect(Observe.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ANITKA auth diagnostic: stage=sign-in-response; reason=provider_rejected; status=429' }),
    )
  })

  it('still requires a Neon JWT outside the local-auth mode', async () => {
    mocks.signInEmail.mockResolvedValue({ data: {} })
    mocks.getToken.mockResolvedValue({ data: { token: 'opaque-session-id' } })

    await expect(signIn('mobile@example.com', 'password123')).rejects.toThrow('Přihlášení se nezdařilo. Zkuste to znovu.')
  })

  it('surfaces session errors when no cached token exists', async () => {
    mocks.getToken.mockResolvedValue({ error: { message: 'Token unavailable' } })

    await expect(getAccessToken()).rejects.toThrow('Token unavailable')
  })
})
