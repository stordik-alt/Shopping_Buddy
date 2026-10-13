/** An invitation token as `inviteMemberAction` makes it: 24 random bytes in base64url. */
const INVITE_TOKEN = /^[A-Za-z0-9_-]{16,256}$/

/** The `?invite=` value of a sign-in or sign-up URL if it is shaped like a token, else `null`. The value
 *  ends up in a path (`/invite/<token>`), so anything else — slashes, dots, query or script text — is
 *  dropped instead of being passed on. It is no open redirect (the prefix is fixed), only unvalidated input. */
export function safeInviteToken(value: string | null): string | null {
  return value !== null && INVITE_TOKEN.test(value) ? value : null
}
