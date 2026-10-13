import { redactSecrets } from '@/lib/redact'

/** The message to show for a failed call to the server. In production Next.js replaces the message
 *  of an error thrown inside a Server Action with a generic one ("Minified React error #441", or "An
 *  error occurred in the Server Components render…"), which means nothing to a user; show `fallback`
 *  then. Any other message (one of ours, from the browser) is shown as is. Pure/testable. */
export function userFacingError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : ''
  if (!message || /Minified React error|Server Components render|digest/i.test(message) || LOOKS_INTERNAL.test(message)) return fallback
  return message
}

/** What an internal error message looks like: a database error with its SQL and parameters, a network failure,
 *  a file path or a stack frame. Our own messages are written for people and contain none of this; a message that
 *  does is shown as the fallback instead (docs/35_SECURITY_AUDIT.md, L5), never as is. */
const LOOKS_INTERNAL = /Failed query|\bparams:|NeonDbError|DrizzleQueryError|relation "[^"]+" does not exist|violates (?:foreign key|unique|check|not-null)|\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)\b|node_modules|\/home\/|\bat \S+ \([^)]*:\d+:\d+\)|X-Amz-|postgres(?:ql)?:\/\//i

/** An error with the causes it wraps, for logs and command-line scripts: "Failed query: … ← relation
 *  "flyer_pages" does not exist (42P01)". Drizzle wraps a database error in a generic "Failed query"
 *  whose message says nothing about why; the reason is in `cause` (for Postgres, with its code). */
export function describeError(err: unknown): string {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; current != null && depth < 5; depth++) {
    if (current instanceof Error) {
      const rawCode: unknown = (current as Error & { code?: unknown }).code
      const code = typeof rawCode === 'string' ? ` (${rawCode})` : ''
      parts.push(`${current.message}${code}`)
      current = current.cause
    } else {
      parts.push(String(current))
      break
    }
  }
  return parts.join(' ← ')
}

/** `describeError` made safe for logs and for response bodies: the SQL and its parameters are withheld and
 *  secrets are removed (lib/redact.ts), which a raw Drizzle or storage-client message is not. */
export function safeErrorMessage(err: unknown): string {
  return redactSecrets(describeError(err))
}
