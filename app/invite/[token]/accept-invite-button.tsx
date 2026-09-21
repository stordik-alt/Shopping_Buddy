'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { acceptInvitationAction } from '@/app/actions/household'

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function accept() {
    setLoading(true)
    setError('')
    try {
      await acceptInvitationAction(token)
      router.push('/')
      router.refresh()
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Přijetí pozvánky se nezdařilo.')
    }
  }

  return (
    <div>
      <button
        onClick={accept}
        disabled={loading}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? 'Přidávám vás do domácnosti…' : 'Přijmout pozvánku'}
      </button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
