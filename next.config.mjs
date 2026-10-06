// `BUILD_TARGET=cloudflare` is set only by the prepared Cloudflare build (`pnpm cf:build`,
// docs/cloudflare-deployment.md). The Vercel build never sets it, so nothing below changes for Vercel.
const cloudflareBuild = process.env.BUILD_TARGET === 'cloudflare'

// Next.js 16 supports a nonce-based CSP automatically. Keep the rest of the security headers
// explicit here, but do not rely on a static `'unsafe-inline'` script policy anymore.
const isDev = process.env.NODE_ENV !== 'production'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    // Let Next inject a per-request nonce and generate the CSP header instead of allowing a static
    // inline-script exception. This keeps the app safe without breaking the framework's own inline
    // bootstrap scripts.
    csp: true,
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
        // camera by the receipt photo, and nothing needs the microphone. The CSP is handled by Next.js
        // via its per-request nonce support (`experimental.csp: true`), so we no longer allow static inline scripts.
        source: '/:path*',
        headers: [
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
