// `BUILD_TARGET=cloudflare` is set only by the prepared Cloudflare build (`pnpm cf:build`,
// docs/cloudflare-deployment.md). The Vercel build never sets it, so nothing below changes for Vercel.
const cloudflareBuild = process.env.BUILD_TARGET === 'cloudflare'

// Next.js 16 supports a nonce-based CSP automatically. Keep the rest of the security headers
// explicit here, but do not rely on a static `'unsafe-inline'` script policy anymore.
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Receipt uploads send binary FormData. The raw image cap is 10 MB in
      // lib/receipt-upload-server.ts; this leaves room for multipart overhead above Next's 1 MB default.
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
        // camera by the receipt photo, and nothing needs the microphone. The Content-Security-Policy is
        // not set here: it needs a fresh nonce per request, so proxy.ts builds it (lib/csp.ts).
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
  ...(cloudflareBuild ? { turbopack: { resolveAlias: { sharp: './cloudflare/shims/sharp.js' } } } : {}),
  // pg-cloudflare exposes its Workers socket implementation via the `workerd` condition.
  // Keep it external so OpenNext copies the complete package into the Worker bundle.
  ...(cloudflareBuild ? { serverExternalPackages: ['pg-cloudflare'] } : {}),
  // Inlined at build time. Only the Cloudflare build defines it, so Vercel keeps Vercel Analytics.
  ...(cloudflareBuild ? { env: { ANALYTICS_PROVIDER: 'none' } } : {}),
}

export default nextConfig

