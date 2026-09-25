/** The message to show for a failed call to the server. In production Next.js replaces the message
 *  of an error thrown inside a Server Action with a generic one ("Minified React error #441", or "An
 *  error occurred in the Server Components render…"), which means nothing to a user; show `fallback`
 *  then. Any other message (one of ours, from the browser) is shown as is. Pure/testable. */
export function userFacingError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : ''
  if (!message || /Minified React error|Server Components render|digest/i.test(message)) return fallback
  return message
}

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
