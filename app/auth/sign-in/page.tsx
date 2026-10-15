'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'
import { safeInviteToken } from '@/lib/invite-token'
import { authClient } from '@/lib/auth/client'
import { refusalOf } from '@/lib/auth/auth-errors'
import { rememberLoginTiming } from '@/lib/rum-client'

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const invite = safeInviteToken(searchParams.get('invite'))
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const verified = searchParams.get('verified') === '1'
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Vyplňte e-mail a heslo.')
      return
    }
    setLoading(true)
    const signInStarted = performance.now()
    const refusal = await refusalOf(() => authClient.signIn.email({ email: email.trim(), password }), 'Přihlášení se nezdařilo.')
    // Opt-in timing (lib/rum.ts): the next app load reports how long signing in took on this device.
    rememberLoginTiming(performance.now() - signInStarted)
    setLoading(false)
    if (refusal) {
      setError(refusal)
      return
    }
    router.push(invite ? `/invite/${invite}` : '/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config; the approved logo is a plain static asset */}
          <img src="/brand/anitka/anitka-logo.png" alt="ANITKA" width={2172} height={724} className="h-auto w-full max-w-[15rem]" />
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground/70">Powered by ANITKA AI</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">Přihlásit se</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vítejte zpátky. Pojďme uhlídat rozpočet.</p>
          {verified && <p role="status" className="mt-3 text-sm text-emerald-700">E-mail byl ověřen. Nyní se přihlaste.</p>}
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label className="text-sm">
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="text-sm">
              Heslo
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? 'Přihlašuji…' : 'Přihlásit se'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Ještě nemáte účet?{' '}
            <Link href={`/auth/sign-up${invite ? `?invite=${invite}&email=${encodeURIComponent(email)}` : ''}`} className="font-medium text-primary hover:underline">
              Založte si ho
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
