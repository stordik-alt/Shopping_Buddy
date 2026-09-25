// `BUILD_TARGET=cloudflare` is set only by the prepared Cloudflare build (`pnpm cf:build`,
// docs/cloudflare-deployment.md). The Vercel build never sets it, so nothing below changes for Vercel.
const cloudflareBuild = process.env.BUILD_TARGET === 'cloudflare'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
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
  // Inlined at build time. Only the Cloudflare build defines it, so Vercel keeps Vercel Analytics.
  ...(cloudflareBuild ? { env: { ANALYTICS_PROVIDER: 'none' } } : {}),
}

export default nextConfig
