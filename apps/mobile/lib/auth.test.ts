import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  values: new Map<string, string>(),
}))

vi.mock('@neondatabase/auth', () => ({
  createAuthClient: () => ({ getSession: mocks.getSession }),
}))
vi.mock('@neondatabase/auth/vanilla/adapters', () => ({ BetterAuthVanillaAdapter: () => ({}) }))
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

import { getAccessToken } from './auth'

describe('mobile auth token cache', () => {
  beforeEach(() => {
    mocks.values.clear()
    vi.clearAllMocks()
  })

  it('uses the last saved bearer token when session refresh cannot reach Neon Auth', async () => {
    mocks.values.set('anitka.auth.jwt', 'cached-token')
    mocks.getSession.mockResolvedValue({ error: { message: 'Network request failed' } })

    await expect(getAccessToken()).resolves.toBe('cached-token')
  })

  it('stores and returns a fresh token from the session response', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { token: 'fresh-token' } } })

    await expect(getAccessToken()).resolves.toBe('fresh-token')
    expect(mocks.values.get('anitka.auth.jwt')).toBe('fresh-token')
  })

  it('surfaces session errors when no cached token exists', async () => {
    mocks.getSession.mockResolvedValue({ error: { message: 'Session unavailable' } })

    await expect(getAccessToken()).rejects.toThrow('Session unavailable')
  })
})
