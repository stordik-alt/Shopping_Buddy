'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteAccountDataAction } from '@/app/actions/account'
import { refusalOf } from '@/lib/auth/auth-errors'
import { authClient } from '@/lib/auth/client'
import { confirmsEmail } from '@/lib/account-deletion'

// Deleting one's own account. The explanation depends on the role: a member only leaves (the household
// stays), the owner takes the household with them (and the server refuses while others are still in it).
// A native <dialog> keeps focus inside and closes on Escape by itself.
export function DeleteAccountDialog({ open, onClose, email, isOwner }: { open: boolean; onClose: () => void; email: string; isOwner: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setTyped('')
      setError('')
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await deleteAccountDataAction(typed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smazání se nezdařilo.')
      setBusy(false)
      return
    }
    // The data is gone. Removing the login itself can still fail (e.g. the auth service does not allow it
    // yet); say so, because then the person is signed in to an empty account and should know.
    const refusal = await refusalOf(() => (authClient as unknown as { deleteUser: () => Promise<{ error?: unknown }> }).deleteUser(), 'Smazání účtu se nezdařilo')
    try {
      await caches.delete('shopping-buddy-page-v1')
    } catch (cacheError) {
      console.error('Could not clear the offline page cache', cacheError)
    }
    if (refusal) {
      setError(`Data jsou smazaná, ale přihlašovací účet se nepodařilo odstranit: ${refusal}. Napište správci aplikace.`)
      setBusy(false)
      return
    }
    router.push('/intro')
    router.refresh()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      aria-labelledby="delete-account-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface-elevated p-5 text-foreground shadow-elevated backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="delete-account-title" className="text-base font-semibold">
          Smazat účet
        </h2>
        <button onClick={onClose} aria-label="Zavřít" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-3 text-sm">
        {isOwner
          ? 'Smažete svůj účet i celou domácnost: seznamy, nákupy, účtenky s fotkami, rozpočet, zásoby a profily všech členů. Nejde to vrátit.'
          : 'Smažete svůj účet a svůj profil v domácnosti. Domácnost a její sdílená data (seznamy, nákupy, účtenky) zůstanou ostatním. Nejde to vrátit.'}
      </p>
      <label className="mt-4 block text-sm">
        Pro potvrzení napište svůj e-mail ({email})
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          type="email"
          autoComplete="off"
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="min-h-11 rounded-xl px-4 text-sm hover:bg-muted">
          Zrušit
        </button>
        <button
          onClick={() => void confirm()}
          disabled={busy || !confirmsEmail(typed, email)}
          className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Mažu…' : 'Smazat navždy'}
        </button>
      </div>
    </dialog>
  )
}
