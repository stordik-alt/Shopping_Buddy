'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Brand } from '@/components/shared/brand'
import { authClient } from '@/lib/auth/client'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError('Vyplňte jméno, e-mail a heslo (alespoň 8 znaků).')
      return
    }
    setLoading(true)
    const { error: signUpError } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
    setLoading(false)
    if (signUpError) {
      setError(signUpError.message || 'Registraci se nepodařilo dokončit.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">Založit účet</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vytvořte si domácnost a začněte plánovat nákupy.</p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label className="text-sm">
              Jméno
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
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
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? 'Zakládám účet…' : 'Založit účet'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Už máte účet?{' '}
            <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
              Přihlaste se
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
