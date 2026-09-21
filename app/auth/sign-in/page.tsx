'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'
import { Brand } from '@/components/shared/brand'
import { authClient } from '@/lib/auth/client'

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
  const invite = searchParams.get('invite')
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Vyplňte e-mail a heslo.')
      return
    }
    setLoading(true)
    const { error: signInError } = await authClient.signIn.email({ email: email.trim(), password })
    setLoading(false)
    if (signInError) {
      setError(signInError.message || 'Přihlášení se nezdařilo.')
      return
    }
    router.push(invite ? `/invite/${invite}` : '/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">Přihlásit se</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vítejte zpátky. Pojďme uhlídat rozpočet.</p>
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
