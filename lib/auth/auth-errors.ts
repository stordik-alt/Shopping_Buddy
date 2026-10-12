// What the sign-in and sign-up forms show when the auth service refuses a request.
//
// The Neon Auth client *throws* an `AuthApiError` for a refused request (wrong password, e-mail already
// registered, …) instead of returning `{ error }`. A form that only checks the return value never gets to
// reset its button, so it stayed on "Přihlašuji…" with no message at all.

const KNOWN: Array<{ code?: string; message?: RegExp; text: string }> = [
  { code: 'INVALID_EMAIL_OR_PASSWORD', message: /invalid email or password/i, text: 'Nesprávný e-mail nebo heslo.' },
  { code: 'USER_ALREADY_EXISTS', message: /already exists/i, text: 'Účet s tímto e-mailem už existuje. Zkuste se přihlásit.' },
  { code: 'PASSWORD_TOO_SHORT', message: /password too short/i, text: 'Heslo je příliš krátké.' },
  { code: 'INVALID_EMAIL', message: /invalid email$/i, text: 'Zadejte platný e-mail.' },
  { code: 'EMAIL_NOT_VERIFIED', message: /email not verified/i, text: 'E-mail zatím není ověřený. Zkontrolujte svou schránku.' },
]

/** A user-facing Czech message for whatever the auth client returned or threw. */
export function authErrorMessage(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error != null && 'code' in error ? String((error as { code: unknown }).code) : undefined
  const message = typeof error === 'object' && error != null && 'message' in error && typeof (error as { message: unknown }).message === 'string' ? (error as { message: string }).message : undefined
  const known = KNOWN.find((entry) => (code && entry.code === code) || (message && entry.message?.test(message)))
  return known?.text ?? fallback
}

/** Runs an auth call and turns a returned or thrown refusal into a message (null when it went through). */
export async function refusalOf(call: () => Promise<{ error?: unknown } | null | undefined>, fallback: string): Promise<string | null> {
  try {
    const result = await call()
    return result?.error ? authErrorMessage(result.error, fallback) : null
  } catch (error) {
    // Logged for debugging; the user sees only the message.
    console.error('[auth]', error)
    return authErrorMessage(error, fallback)
  }
}
