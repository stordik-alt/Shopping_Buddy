// Makes an error message safe to write to shared logs or return in a response. Kept apart from lib/errors.ts and
// lib/receipt-log.ts so both can use it (docs/37_SECURITY_REMEDIATION_PLAN.md, V6).

const MAX_ERROR_LENGTH = 500

/** Removes credential-looking and data-bearing substrings, then truncates. Redaction runs on the whole text
 *  *before* it is cut, so a secret straddling the cut cannot survive as a fragment.
 *
 *  - Drizzle's "Failed query: <sql>\nparams: <values>": the statement names tables and columns and the
 *    parameters are the household's own data (names, e-mail addresses, amounts), so both are withheld;
 *    the cause that follows (Postgres' own message and code) is kept.
 *  - `key=…` query parameters, bearer tokens and Azure subscription keys (a failing HTTP client can echo the URL).
 *  - AWS-style signed URLs and headers (`X-Amz-Credential`, `X-Amz-Signature`, `AWS4-HMAC-SHA256 Credential=…`),
 *    which the storage client puts into its error messages.
 *  - `user:password@` inside a URL (e.g. a database connection string).
 *  - `token=`, `secret:`, `password=`, `api_key=`, `signature=` style pairs. */
export function redactSecrets(text: string): string {
  return text
    .replace(/Failed query:[\s\S]*?\nparams:.*?(?= ← |$)/gm, 'Failed query: [statement and parameters withheld]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/(Subscription-Key["':=\s]+)[A-Za-z0-9]+/gi, '$1[redacted]')
    .replace(/(X-Amz-(?:Credential|Signature|Security-Token|Signedheaders)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/(AWS4-HMAC-SHA256\s+)[^\n"']*/gi, '$1[redacted]')
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/((?:api[-_]?key|access[-_]?key|token|secret|password|signature)["']?\s*[:=]\s*["']?)[^&\s"',]+/gi, '$1[redacted]')
    .slice(0, MAX_ERROR_LENGTH)
}
