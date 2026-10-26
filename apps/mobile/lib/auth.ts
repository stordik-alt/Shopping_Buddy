import './crypto-polyfill'
import { createAuthClient } from '@neondatabase/auth'
import { Observe } from 'expo-observe'
import { BetterAuthVanillaAdapter } from '@neondatabase/auth/vanilla/adapters'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { getApiUrl } from './config'

const COOKIE_KEY = 'anitka.auth.cookies'
const TOKEN_KEY = 'anitka.auth.jwt'

// Report handled auth failures explicitly: Observe does not automatically collect caught exceptions.
// Only fixed stage/reason labels are sent; never include credentials, tokens, cookies, or user identifiers.
function reportAuthDiagnostic(stage: string, reason: string, status?: number): void {
  try {
    const statusLabel = status && Number.isInteger(status) && status >= 100 && status <= 599 ? `; status=${status}` : ''
    Observe.reportError(new Error(`ANITKA auth diagnostic: stage=${stage}; reason=${reason}${statusLabel}`))
    void Observe.dispatchEvents().catch(() => undefined)
  } catch {
    // Diagnostics must never prevent the user from signing in.
  }
}

function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown'
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { status?: unknown; statusCode?: unknown }
  const status = typeof value.status === 'number' ? value.status : value.statusCode
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined
}
let memoryCookie = ''
let memoryToken = ''
let localSessionAvailable = false

function traceLocalAuth(message: string): void {
  if (usesLocalAuth()) console.info(`[mobile auth] ${message}`)
}

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

function getAuthClient() {
  const localAuth = usesLocalAuth()
  traceLocalAuth('Creating auth client.')
  const client = createAuthClient(`${getApiUrl()}/api/auth`, {
    adapter: BetterAuthVanillaAdapter({
      // NeonAuthAdapterCore replaces customFetchImpl internally, so transport settings must use its
      // supported fetch options. The local API requires this trusted origin and React Native's cookie jar.
      fetchOptions: {
        credentials: localAuth ? 'include' : 'omit',
        headers: { origin: getApiUrl() },
        onRequest: async (request) => {
          traceLocalAuth('Auth request started.')
          const cookie = await readCookie()
          if (cookie) request.headers.set('cookie', cookie)
        },
        onSuccess: async ({ response }) => {
          traceLocalAuth('Auth response succeeded; persisting session data.')
          const cookie = await readCookie()
          const updates = setCookieHeaders(response.headers)
          if (updates.length > 0) await writeCookie(mergeCookies(cookie, updates))
          const token = response.headers.get('set-auth-jwt')
          if (token) await writeToken(token)
          traceLocalAuth('Auth response session data persisted.')
        },
      },
    }),
  })
  traceLocalAuth('Auth client created.')
  return client
}

type SessionResponse = {
  data?: { session?: { token?: string } | null } | null
  error?: { message?: string } | null
}

type NeonTokenResponse = {
  data?: { token?: string } | null
  error?: { message?: string } | null
}

export async function getAccessToken(): Promise<string | null> {
  if (!usesLocalAuth()) {
    try {
      // Neon Auth exposes the bearer JWT through its token endpoint. The token in a
      // Better Auth session is otherwise an opaque session ID, not an API JWT.
      const result = (await getAuthClient().token()) as NeonTokenResponse
      const savedToken = await readToken()
      if (result.error) {
        if (isJwt(savedToken)) return savedToken
        reportAuthDiagnostic('token-response', 'provider_error')
        throw new Error(result.error.message || 'Nepodařilo se ověřit přihlášení.')
      }

      const token = result.data?.token
      if (isJwt(token)) {
        await writeToken(token)
        return token
      }
      if (isJwt(savedToken)) return savedToken
      reportAuthDiagnostic('token-response', 'jwt_missing_or_invalid')
      return null
    } catch (error) {
      const savedToken = await readToken()
      if (isJwt(savedToken)) return savedToken
      reportAuthDiagnostic('token-request', errorKind(error))
      throw error
    }
  }

  try {
    if (localSessionAvailable || (await readCookie())) {
      traceLocalAuth('Using the existing local session without another SDK lookup.')
      return null
    }
    // The server-side session cache returns an opaque session ID in `session.token`.
    // A fresh lookup bypasses that cache and lets Neon Auth attach `set-auth-jwt`,
    // which the adapter's onSuccess hook stores in SecureStore for authenticated API requests.
    traceLocalAuth('Calling getSession.')
    const result = (await getAuthClient().getSession({ query: { disableCookieCache: true } })) as SessionResponse
    traceLocalAuth('getSession returned.')
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
    if (usesLocalAuth()) console.error('[mobile auth] Session lookup failed in local-auth mode.', error)
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

export async function hasLocalAuthSession(): Promise<boolean> {
  return usesLocalAuth() && (localSessionAvailable || Boolean(await readCookie()))
}

function isJwt(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.split('.').length === 3
}

export async function clearAccessToken(): Promise<void> {
  await writeToken('')
}

export async function signIn(email: string, password: string): Promise<void> {
  localSessionAvailable = false
  let providerRejected = false
  try {
    const result = await getAuthClient().signIn.email({ email, password })
    if (result.error) {
      providerRejected = true
      const status = errorStatus(result.error)
      // Keep production mobile login failures diagnosable in Android logcat/CI artifacts.
      // Never log the email, password, session cookie, or access token.
      console.error('[mobile auth] Sign-in rejected by provider.', {
        status: status ?? null,
        message: result.error.message || 'Provider returned no error message.',
      })
      reportAuthDiagnostic('sign-in-response', 'provider_rejected', status)
      if (status === 429) {
        throw new Error('Přihlašovací služba je dočasně přetížená. Počkejte chvíli a zkuste to znovu.')
      }
      throw new Error(result.error.message || 'Přihlášení se nezdařilo.')
    }
  } catch (error) {
    if (!providerRejected) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[mobile auth] Sign-in request failed.', {
        name: errorKind(error),
        status: errorStatus(error) ?? null,
        message,
      })
      reportAuthDiagnostic('sign-in-request', errorKind(error), errorStatus(error))
    }
    throw error
  }
  if (usesLocalAuth()) {
    // A successful local sign-in already populated Better Auth's in-memory cache. On React Native,
    // the SDK's cached getSession path calls Response.json(), which Hermes does not implement.
    localSessionAvailable = true
    return
  }
  const token = await getAccessToken()
  // Local Better Auth sessions use a persisted cookie; only Neon Auth can issue the JWT used in production.
  if (!token && !(usesLocalAuth() && ((await readCookie()) || localSessionAvailable))) {
    reportAuthDiagnostic('post-sign-in-token', 'jwt_missing')
    throw new Error('Přihlášení se nezdařilo. Zkuste to znovu.')
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
