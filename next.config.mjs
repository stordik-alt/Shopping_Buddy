// `BUILD_TARGET=cloudflare` is set only by the prepared Cloudflare build (`pnpm cf:build`,
// docs/cloudflare-deployment.md). The Vercel build never sets it, so nothing below changes for Vercel.
const cloudflareBuild = process.env.BUILD_TARGET === 'cloudflare'

// Content-Security-Policy. Every request the browser code makes goes to the app's own origin (Server
// Actions, /api/auth, receipt routes), images are same-origin files plus data:/blob: previews, and
// the OCR/model providers are only called from the server, so nothing external is allowed. Next.js
// writes small inline bootstrap scripts, which a nonce-based script-src would need on every request
// (and would make every page dynamic), so 'unsafe-inline' stays for scripts for now; the value is in
// the rest: no plugins, no framing, no foreign base/form targets, no third-party connections.
// Dev needs 'unsafe-eval' for React's debugging tools. Cloudflare's build gets Web Analytics.
const isDev = process.env.NODE_ENV !== 'production'
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}${cloudflareBuild ? ' https://static.cloudflareinsights.com' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${cloudflareBuild ? ' https://cloudflareinsights.com' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Playwright's CI web server uses 127.0.0.1 while Next dev serves its page resources through the
  // dev server origin. Explicitly allow that local development origin so browser smoke tests can
  // load the app's scripts/chunks instead of having Next block them as cross-origin resources.
  ...(isDev ? { allowedDevOrigins: ['127.0.0.1'] } : {}),
  experimental: {
    serverActions: {
      // Receipt photo/PDF upload (uploadReceiptAction) sends the file as a base64 string inside the
      // action request. The upload cap is 10 MB of raw bytes (MAX_IMAGE_BYTES in
      // app/actions/receipts.ts); base64 inflates that by ~4/3 (~13.4 MB) plus a little request
      // overhead. Next's 1 MB default would reject a normal phone photo before the action runs.
      bodySizeLimit: '15mb',
    },
    // Next 16's Proxy buffers request bodies before passing them to the route/action. Its default
    // 10 MB buffer truncated larger receipt Server Action requests even though serverActions above
    // allowed 15 MB. That left the action with an incomplete payload and React surfaced the failure
    // in production as minified error #441. Keep both limits aligned with the 10 MB raw-file cap.
    proxyClientMaxBodySize: '15mb',
  },
  // The push service worker (public/sw.js) must never be served from a cache, or a fixed version
  // would not reach phones that already registered it.
  async headers() {
    return [
      {
        // Conservative security headers for every page. The app is never embedded, location is used by the store directory and the
        // camera by the receipt photo, and nothing needs the microphone.
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
  // sharp is a native addon that cannot be bundled into a Worker; the Cloudflare build swaps it for a
  // stub that throws, which the receipt pipeline already treats as "send the original photo to OCR".
  ...(cloudflareBuild ? { turbopack: { resolveAlias: { sharp: './cloudflare/shims/sharp.js', pg: './cloudflare/shims/pg.js' } } } : {}),
  // Inlined at build time. Only the Cloudflare build defines it, so Vercel keeps Vercel Analytics.
  ...(cloudflareBuild ? { env: { ANALYTICS_PROVIDER: 'none' } } : {}),
}

export default nextConfig
