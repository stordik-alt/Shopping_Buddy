import type { MetadataRoute } from 'next'

// Web app manifest: what the phone uses when the app is installed to the home screen (the account
// menu's "Stáhnout aplikaci do mobilu", lib/install-prompt.ts). The icons are the ANITKA symbol
// (cropped from the approved logo, public/brand/anitka/anitka-logo.png — see components/shared/brand.tsx
// for how the crop was made), under /brand/ so they load without signing in — like the manifest
// itself, which browsers fetch without cookies (proxy.ts excludes both from the sign-in redirect).
// The maskable icon has extra margin so Android's round or rounded-square crop never cuts the symbol.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ANITKA – rodinný nákup',
    short_name: 'ANITKA',
    description: 'Vaše chytrá pomocnice pro domácnost: nákupy, zásoby, rozpočet a jídelníček na jednom místě.',
    lang: 'cs',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The splash screen while the app starts.
    background_color: '#ffffff',
    // The app's light background, so the status bar blends with the header.
    theme_color: '#f8f7f3',
    icons: [
      { src: '/brand/anitka-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/anitka-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/anitka-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
