import { IntroScreen } from '@/components/auth/intro-screen'

// Rendered per request so the Content-Security-Policy nonce (proxy.ts) reaches its scripts.
export const dynamic = 'force-dynamic'

export default function IntroPage() {
  return <IntroScreen />
}
