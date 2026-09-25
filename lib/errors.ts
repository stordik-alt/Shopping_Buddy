/** The message to show for a failed call to the server. In production Next.js replaces the message
 *  of an error thrown inside a Server Action with a generic one ("Minified React error #441", or "An
 *  error occurred in the Server Components render…"), which means nothing to a user; show `fallback`
 *  then. Any other message (one of ours, from the browser) is shown as is. Pure/testable. */
export function userFacingError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : ''
  if (!message || /Minified React error|Server Components render|digest/i.test(message)) return fallback
  return message
}
