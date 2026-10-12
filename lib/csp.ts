// Content-Security-Policy for the pages (docs/37_SECURITY_REMEDIATION_PLAN.md, K1).
//
// Next.js reads the nonce from the request's CSP header while rendering and puts it on its own
// scripts (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). `proxy.ts`
// generates a fresh nonce for every request and sets the header with the value built here.

/** Header name for the mode: the policy is only reported until `CSP_ENFORCE=1` is set, so a mistake
 *  in it shows up in the browser console instead of breaking the app. */
export function cspHeaderName(enforce: boolean): 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only' {
  return enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64')
}

export function buildCsp(nonce: string, options: { isDev: boolean }): string {
  const directives = [
    `default-src 'self'`,
    // `strict-dynamic` lets the nonce'd Next.js scripts load their own chunks; an injected script has no
    // nonce and so does not run. React needs eval only in development.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.isDev ? " 'unsafe-eval'" : ''}`,
    // Styles keep 'unsafe-inline': React renders `style=""` attributes, which a nonce cannot cover. Scripts
    // are what matters for XSS, and they stay strict.
    `style-src 'self' 'unsafe-inline'`,
    // Recipe photos come from the recipe sites themselves (https), receipt previews are blob: URLs.
    `img-src 'self' blob: data: https:`,
    `font-src 'self'`,
    // Server Actions, route handlers and Vercel Analytics (/_vercel/insights) are all same-origin.
    `connect-src 'self'`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ]
  return directives.join('; ')
}
