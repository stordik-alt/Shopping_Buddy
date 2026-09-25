import type { MetadataRoute } from 'next'

// Web app manifest: what the phone uses when the app is installed to the home screen (the account
// menu's "Stáhnout aplikaci do mobilu", lib/install-prompt.ts). The icons are Buddy from the intro
// artwork, under /brand/ so they load without signing in — like the manifest itself, which browsers
// fetch without cookies (proxy.ts excludes both from the sign-in redirect). The maskable icon has
// extra margin so Android's round or rounded-square crop keeps Buddy's whole head.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Buddy – rodinný nákup',
    short_name: 'Buddy',
    description: 'Chytrý nákupní asistent pro vaši domácnost: nákupní seznam, ceny, akce a rozpočet.',
    lang: 'cs',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The splash screen while the app starts: the intro artwork's navy, behind Buddy's icon.
    background_color: '#001123',
    // The app's light background, so the status bar blends with the header.
    theme_color: '#f8f7f3',
    icons: [
      { src: '/brand/buddy-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/buddy-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/buddy-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
