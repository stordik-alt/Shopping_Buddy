// What the sign-in and sign-up forms show when the auth service refuses a request.
//
// The Neon Auth client *throws* an `AuthApiError` for a refused request (wrong password, e-mail already
// registered, …) instead of returning `{ error }`. A form that only checks the return value never gets to
// reset its button, so it stayed on "Přihlašuji…" with no message at all.

// The Neon Auth client reports Better Auth's codes translated to its own snake_case ones (`invalid_credentials`,
// `email_not_confirmed`, …), so both spellings are listed.
const KNOWN: Array<{ codes: string[]; message?: RegExp; text: string }> = [
  { codes: ['INVALID_EMAIL_OR_PASSWORD', 'invalid_credentials'], message: /invalid (email or password|login credentials)/i, text: 'Nesprávný e-mail nebo heslo.' },
  { codes: ['USER_ALREADY_EXISTS', 'user_already_exists', 'email_exists'], message: /already (exists|registered)/i, text: 'Účet s tímto e-mailem už existuje. Zkuste se přihlásit.' },
  { codes: ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG', 'weak_password'], message: /password (too short|too long|is too weak)/i, text: 'Heslo nevyhovuje požadavkům (je příliš krátké nebo slabé).' },
  { codes: ['INVALID_EMAIL', 'email_address_invalid'], message: /invalid email$/i, text: 'Zadejte platný e-mail.' },
  { codes: ['EMAIL_NOT_VERIFIED', 'email_not_confirmed'], message: /email not (verified|confirmed)/i, text: 'E-mail tohoto účtu zatím není ověřený, proto se nelze přihlásit. Ověřte ho odkazem z e-mailu.' },
  { codes: ['over_request_rate_limit', 'over_email_send_rate_limit'], message: /rate limit|too many/i, text: 'Příliš mnoho pokusů. Zkuste to prosím za chvíli.' },
]

/** A user-facing Czech message for whatever the auth client returned or threw. */
export function authErrorMessage(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error != null && 'code' in error ? String((error as { code: unknown }).code) : undefined
  const message = typeof error === 'object' && error != null && 'message' in error && typeof (error as { message: unknown }).message === 'string' ? (error as { message: string }).message : undefined
  const known = KNOWN.find((entry) => (code && entry.codes.includes(code)) || (message && entry.message?.test(message)))
  if (known) return known.text
  // An unknown refusal: its code (a short identifier, no personal data) goes with the message so it can be reported.
  return code ? `${fallback} (kód: ${code})` : fallback
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
