import './crypto-polyfill'
import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthVanillaAdapter } from '@neondatabase/auth/vanilla/adapters'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { getApiUrl } from './config'

const COOKIE_KEY = 'anitka.auth.cookies'
const TOKEN_KEY = 'anitka.auth.jwt'
let memoryCookie = ''
let memoryToken = ''
let localSessionAvailable = false

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
  const getSetCookie = nativeHeaders.getSetCookie
  const cookies = typeof getSetCookie === 'function' ? getSetCookie.call(nativeHeaders) : []
  if (cookies.length > 0) return cookies
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
  // React Native's cookie jar is the reliable fallback when its Headers implementation hides
  // Set-Cookie. Keep the explicit SecureStore cookie for API requests and use both paths locally.
  const response = await fetch(input, { ...init, headers, credentials: usesLocalAuth() ? 'include' : 'omit' })
  const updates = setCookieHeaders(response.headers)
  if (updates.length > 0) await writeCookie(mergeCookies(cookie, updates))
  const token = response.headers.get('set-auth-jwt')
  if (token) await writeToken(token)
  return response
}

type CustomFetchImpl = NonNullable<
  NonNullable<NonNullable<Parameters<typeof BetterAuthVanillaAdapter>[0]>['fetchOptions']>['customFetchImpl']
>

function getAuthClient() {
  return createAuthClient(`${getApiUrl()}/api/auth`, {
    // TypeScript 6 types the auth client's fetch with DOM `RequestInfo`, which lacks `URL`; React Native's
    // fetch accepts it, so the cast only reconciles the two declarations.
    adapter: BetterAuthVanillaAdapter({
      fetchOptions: { customFetchImpl: nativeFetch as unknown as CustomFetchImpl },
    }),
  })
}

type SessionResponse = {
  data?: { session?: { token?: string } | null } | null
  error?: { message?: string } | null
}

export async function getAccessToken(): Promise<string | null> {
  try {
    // The server-side session cache returns an opaque session ID in `session.token`.
    // A fresh lookup bypasses that cache and lets Neon Auth attach `set-auth-jwt`,
    // which nativeFetch stores in SecureStore for authenticated API requests.
    const result = (await getAuthClient().getSession({ query: { disableCookieCache: true } })) as SessionResponse
    const savedToken = await readToken()
    if (result.error) {
      localSessionAvailable = false
      if (isJwt(savedToken)) return savedToken
      throw new Error(result.error.message || 'Nepodařilo se ověřit přihlášení.')
    }
    localSessionAvailable = usesLocalAuth() && Boolean(result.data?.session)
    const sessionToken = result.data?.session?.token
    if (isJwt(savedToken)) return savedToken
    if (isJwt(sessionToken)) {
      await writeToken(sessionToken)
      return sessionToken
    }
  } catch (error) {
    localSessionAvailable = false
    const savedToken = await readToken()
    if (isJwt(savedToken)) return savedToken
    throw error
  }
  return null
}

export function usesLocalAuth(): boolean {
  return Constants.expoConfig?.extra?.localAuth === true
}

export async function getStoredAuthCookie(): Promise<string> {
  return readCookie()
}

function isJwt(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.split('.').length === 3
}

export async function clearAccessToken(): Promise<void> {
  await writeToken('')
}

export async function signIn(email: string, password: string): Promise<void> {
  localSessionAvailable = false
  let stage = 'sign-in request'
  try {
    const result = await getAuthClient().signIn.email({ email, password })
    if (result.error) throw new Error(result.error.message || 'Přihlášení se nezdařilo.')
    stage = 'session verification'
    const token = await getAccessToken()
    // Local Better Auth sessions use a persisted cookie; only Neon Auth can issue the JWT used in production.
    stage = 'cookie validation'
    if (!token && !(usesLocalAuth() && ((await readCookie()) || localSessionAvailable))) {
      throw new Error('Přihlášení se nezdařilo. Zkuste to znovu.')
    }
  } catch (error) {
    // Local auth is used by the isolated emulator and local development only. Log the failing step without
    // credentials or cookie contents so device diagnostics can distinguish transport and session failures.
    if (usesLocalAuth()) console.error(`[mobile-auth] ${stage} failed`, error)
    throw error
  }
}

export async function signUp(email: string, password: string, name: string): Promise<void> {
  const client = getAuthClient()
  const result = await client.signUp.email({ email, password, name })
  if (result.error) throw new Error(result.error.message || 'Registrace se nezdařila.')
}

type EmailOtpClient = {
  emailOtp: {
    sendVerificationOtp(input: { email: string; type: 'email-verification' }): Promise<{ error?: { message?: string } | null } | null>
    verifyEmail(input: { email: string; otp: string }): Promise<{ error?: { message?: string } | null } | null>
  }
}

export async function sendVerificationCode(email: string): Promise<void> {
  const result = await (getAuthClient() as unknown as EmailOtpClient).emailOtp.sendVerificationOtp({
    email,
    type: 'email-verification',
  })
  if (result?.error) throw new Error(result.error.message || 'Ověřovací kód se nepodařilo odeslat.')
}

export async function verifyEmailCode(email: string, otp: string): Promise<void> {
  const result = await (getAuthClient() as unknown as EmailOtpClient).emailOtp.verifyEmail({ email, otp })
  if (result?.error) throw new Error(result.error.message || 'Kód není správný nebo jeho platnost vypršela.')
}

export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const result = await getAuthClient().requestPasswordReset({ email, redirectTo })
  if (result.error) throw new Error(result.error.message || 'Odkaz pro obnovu hesla se nepodařilo odeslat.')
}

export function passwordResetCallbackUrl(): string {
  return new URL('/auth/mobile-reset', getApiUrl()).toString()
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const result = await getAuthClient().resetPassword({ token, newPassword })
  if (result.error) throw new Error(result.error.message || 'Heslo se nepodařilo změnit. Odkaz mohl vypršet.')
}

export async function verifyEmailLink(token: string): Promise<void> {
  const result = await getAuthClient().verifyEmail({ query: { token } })
  if (result.error) throw new Error(result.error.message || 'Ověřovací odkaz není platný nebo jeho platnost vypršela.')
}

export async function signOut(): Promise<void> {
  localSessionAvailable = false
  try {
    await getAuthClient().signOut()
  } finally {
    await writeCookie('')
    await writeToken('')
  }
}

export async function deleteSignedInUser(): Promise<void> {
  const result = await getAuthClient().deleteUser()
  if (result.error) throw new Error(result.error.message || 'Přihlašovací účet se nepodařilo odstranit.')
  await writeCookie('')
  await writeToken('')
  localSessionAvailable = false
}
