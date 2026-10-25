'use client'

import Link from 'next/link'
import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function MobilePasswordResetRedirectPage() {
  return <Suspense><RedirectToMobileApp /></Suspense>
}

function RedirectToMobileApp() {
  const params = useSearchParams()
  const token = params.get('token')
  const error = params.get('error')
  const deepLink = `shoppingbuddy:///?auth=reset-password${token ? `&token=${encodeURIComponent(token)}` : error ? `&error=${encodeURIComponent(error)}` : ''}`

  useEffect(() => {
    if (token || error) window.location.assign(deepLink)
  }, [deepLink, error, token])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Obnova hesla</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ? 'Odkaz pro obnovu hesla není platný nebo jeho platnost vypršela. Vraťte se do aplikace a požádejte o nový.' : 'Pokračujte v aplikaci ANITKA a nastavte si nové heslo.'}
        </p>
        <a className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href={deepLink}>
          Otevřít aplikaci ANITKA
        </a>
        <p className="mt-5 text-sm text-muted-foreground"><Link href="/auth/sign-in" className="font-medium text-primary hover:underline">Přejít na přihlášení</Link></p>
      </section>
    </main>
  )
}
