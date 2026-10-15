'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'
import { Brand } from '@/components/shared/brand'
import { safeInviteToken } from '@/lib/invite-token'
import { authClient } from '@/lib/auth/client'
import { refusalOf } from '@/lib/auth/auth-errors'

type EmailOtpClient = {
  emailOtp: {
    sendVerificationOtp(input: { email: string; type: 'email-verification' }): Promise<{ error?: unknown } | null>
  }
}

export default function SignUpPage() {
  return <Suspense><SignUpForm /></Suspense>
}

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const invite = safeInviteToken(searchParams.get('invite'))
  const [name, setName] = useState('')
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
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
    const refusal = await refusalOf(
      () => authClient.signUp.email({ name: name.trim(), email: email.trim(), password }),
      'Registraci se nepodařilo dokončit.',
    )
    if (refusal) {
      setLoading(false)
      setError(refusal)
      return
    }

    // The intro is public and is not a verification step. Explicitly request an OTP and
    // keep the new account on the verification screen until Neon Auth accepts the code.
    const otpRefusal = await refusalOf(
      () => (authClient as unknown as EmailOtpClient).emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: 'email-verification',
      }),
      'Kód se nepodařilo odeslat.',
    )
    setLoading(false)

    const params = new URLSearchParams({ email: email.trim() })
    if (invite) params.set('invite', invite)
    if (otpRefusal) params.set('delivery', 'failed')
    router.push(`/auth/verify-email?${params.toString()}`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">Založit účet</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vytvořte si domácnost a začněte plánovat nákupy.</p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <label className="text-sm">
              Jméno
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="text-sm">
              E-mail
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="text-sm">
              Heslo
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={loading} className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {loading ? 'Zakládám účet…' : 'Založit účet'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Už máte účet?{' '}
            <Link href={`/auth/sign-in${invite ? `?invite=${invite}&email=${encodeURIComponent(email)}` : ''}`} className="font-medium text-primary hover:underline">Přihlaste se</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
