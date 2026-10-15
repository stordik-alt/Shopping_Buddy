'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useState } from 'react'
import { safeInviteToken } from '@/lib/invite-token'
import { authClient } from '@/lib/auth/client'
import { refusalOf } from '@/lib/auth/auth-errors'

type EmailOtpClient = {
  emailOtp: {
    sendVerificationOtp(input: { email: string; type: 'email-verification' }): Promise<{ error?: unknown } | null>
    verifyEmail(input: { email: string; otp: string }): Promise<{ error?: unknown } | null>
  }
}

export default function VerifyEmailPage() {
  return <Suspense><VerifyEmailForm /></Suspense>
}

function VerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const invite = safeInviteToken(searchParams.get('invite'))
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState(searchParams.get('delivery') === 'failed'
    ? 'Registrace proběhla, ale kód se nepodařilo odeslat. Zkuste ho odeslat znovu.'
    : '')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function verify(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!email.trim() || !/^\d{6}$/.test(otp.trim())) {
      setError('Zadejte e-mail a šestimístný ověřovací kód.')
      return
    }
    setLoading(true)
    const refusal = await refusalOf(
      () => (authClient as unknown as EmailOtpClient).emailOtp.verifyEmail({ email: email.trim(), otp: otp.trim() }),
      'Kód není správný nebo jeho platnost vypršela.',
    )
    setLoading(false)
    if (refusal) {
      setError(refusal)
      return
    }
    const params = new URLSearchParams({ verified: '1', email: email.trim() })
    if (invite) params.set('invite', invite)
    router.replace(`/auth/sign-in?${params.toString()}`)
  }

  async function resend() {
    setError('')
    setNotice('')
    if (!email.trim()) {
      setError('Nejprve zadejte e-mailovou adresu.')
      return
    }
    setLoading(true)
    const refusal = await refusalOf(
      () => (authClient as unknown as EmailOtpClient).emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' }),
      'Nový kód se nepodařilo odeslat.',
    )
    setLoading(false)
    if (refusal) setError(refusal)
    else setNotice('Pokud je účet potřeba ověřit, poslali jsme nový kód na zadaný e-mail.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-sm rounded-3xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold tracking-tight">Ověření e-mailu</h1>
        <p className="mt-2 text-sm text-muted-foreground">Na váš e-mail jsme poslali šestimístný ověřovací kód. Zadejte ho níže, abyste dokončili registraci.</p>
        <form onSubmit={verify} className="mt-6 flex flex-col gap-3">
          <label className="text-sm">
            E-mail
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            Ověřovací kód
            <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" required className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.35em] outline-none focus:ring-2 focus:ring-ring" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          <button type="submit" disabled={loading} className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {loading ? 'Ověřuji…' : 'Ověřit e-mail'}
          </button>
        </form>
        <button type="button" onClick={resend} disabled={loading} className="mt-4 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">
          Odeslat nový kód
        </button>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Zadali jste špatný e-mail? <Link href="/auth/sign-up" className="font-medium text-primary hover:underline">Vraťte se k registraci</Link>
        </p>
      </section>
    </main>
  )
}
