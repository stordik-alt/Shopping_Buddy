import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { InstallPromptCapture } from '@/components/shared/install-prompt-capture'
import './globals.css'

// latin-ext is required for Czech diacritics (ě, š, č, ř, ž, ý, á, í, é, ů, ú).
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'ANITKA | Chytré nákupy a rozpočet',
  description: 'ANITKA — vaše chytrá pomocnice pro domácnost: nákupy, zásoby, rozpočet a jídelníček na jednom místě.',
  generator: 'v0.app',
  // The ANITKA symbol, like the installed app's icon (app/manifest.ts). Under /brand/ so they load before sign-in.
  icons: {
    icon: [{ url: '/brand/anitka-favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: '/brand/anitka-apple-touch-icon.png',
  },
  // iPhone: "Přidat na plochu" opens the app full-screen under the name ANITKA.
  appleWebApp: { capable: true, title: 'ANITKA', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  // Lets the fixed bottom navigation respect the iPhone home-indicator inset (env(safe-area-inset-bottom)).
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f7f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0e191c' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="cs" className={inter.variable}>
      <body className="antialiased">
        {children}
        <InstallPromptCapture />
        {/* Vercel Analytics reports to /_vercel/insights, which exists only on Vercel; the Cloudflare
            build sets ANALYTICS_PROVIDER=none (next.config.mjs) and uses Cloudflare Web Analytics. */}
        {process.env.NODE_ENV === 'production' && process.env.ANALYTICS_PROVIDER !== 'none' && <Analytics />}
      </body>
    </html>
  )
}
