import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthVanillaAdapter } from '@neondatabase/auth/vanilla/adapters'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { getApiUrl } from './config'

const COOKIE_KEY = 'anitka.auth.cookies'
const TOKEN_KEY = 'anitka.auth.jwt'
let memoryCookie = ''
let memoryToken = ''

async function readCookie(): Promise<string> {
  if (Platform.OS === 'web') return memoryCookie
  return (await SecureStore.getItemAsync(COOKIE_KEY)) ?? ''
}

async function writeCookie(value: string): Promise<void> {
  memoryCookie = value
  if (Platform.OS === 'web') return
  if (value) await SecureStore.setItemAsync(COOKIE_KEY, value)
  else await SecureStore.deleteItemAsync(COOKIE_KEY)
}

async function readToken(): Promise<string> {
  if (Platform.OS === 'web') return memoryToken
  return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? ''
}

async function writeToken(value: string): Promise<void> {
  memoryToken = value
  if (Platform.OS === 'web') return
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value)
  else await SecureStore.deleteItemAsync(TOKEN_KEY)
}

function setCookieHeaders(headers: Headers): string[] {
  const nativeHeaders = headers as Headers & { getSetCookie?: () => string[] }
  if (nativeHeaders.getSetCookie) return nativeHeaders.getSetCookie()
  const combined = headers.get('set-cookie')
  return combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []
}

function mergeCookies(existing: string, updates: string[]): string {
  const cookies = new Map<string, string>()
  for (const entry of existing.split(';')) {
    const separator = entry.indexOf('=')
    if (separator > 0) cookies.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim())
  }

  for (const update of updates) {
    const [pair, ...attributes] = update.split(';')
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    const expires = attributes.find((attribute) => /^max-age=/i.test(attribute.trim()))
    if (!value || (expires && Number(expires.split('=')[1]) <= 0)) cookies.delete(name)
    else cookies.set(name, value)
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

const nativeFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('origin', getApiUrl())
  const cookie = await readCookie()
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(input, { ...init, headers, credentials: 'omit' })
  const updates = setCookieHeaders(response.headers)
  if (updates.length > 0) await writeCookie(mergeCookies(cookie, updates))
  const token = response.headers.get('set-auth-jwt')
  if (token) await writeToken(token)
  return response
}

function getAuthClient() {
  return createAuthClient(`${getApiUrl()}/api/auth`, {
    adapter: BetterAuthVanillaAdapter({ fetchOptions: { customFetchImpl: nativeFetch } }),
  })
}

type SessionResponse = {
  data?: { session?: { token?: string } | null } | null
  error?: { message?: string } | null
}

export async function getAccessToken(): Promise<string | null> {
  const result = (await getAuthClient().getSession()) as SessionResponse
  if (result.error) throw new Error(result.error.message || 'Nepodařilo se ověřit přihlášení.')
  const sessionToken = result.data?.session?.token
  if (sessionToken) {
    await writeToken(sessionToken)
    return sessionToken
  }
  return (await readToken()) || null
}

export async function clearAccessToken(): Promise<void> {
  await writeToken('')
}

export async function signIn(email: string, password: string): Promise<void> {
  const result = await getAuthClient().signIn.email({ email, password })
  if (result.error) throw new Error(result.error.message || 'Přihlášení se nezdařilo.')
  const token = await getAccessToken()
  if (!token) throw new Error('Přihlášení se nezdařilo. Zkuste to znovu.')
}

export async function signOut(): Promise<void> {
  try {
    await getAuthClient().signOut()
  } finally {
    await writeCookie('')
    await writeToken('')
  }
}
