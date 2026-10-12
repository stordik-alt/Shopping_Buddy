// Rendered on every request, not at build time: the Content-Security-Policy nonce (proxy.ts) can only be
// put on a page's scripts while it is rendered for a request. The sign-in and sign-up pages are client
// components and cannot declare this themselves.
export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
