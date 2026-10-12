'use client'

import { Check, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { userFacingError } from '@/lib/errors'
import { isNetworkError } from '@/lib/offline-queue'

// How long "Aktuální" stays after a successful refresh before the button goes back to "Obnovit".
const DONE_MS = 3000

/**
 * "Obnovit" for the shopping list. The app does not refresh itself (another member's changes show up
 * only when something re-reads them), so this re-reads just the list on demand, and says what
 * happened: that it is working, that the list is up to date, or why it could not be refreshed.
 * `onRefresh` rejects with a message that is shown as is.
 */
export function RefreshListButton({
  onRefresh,
  offlineText = 'Bez signálu se seznam obnovit nedá.',
  failText = 'Seznam se nepodařilo obnovit.',
  doneText = 'Seznam je aktuální.',
}: {
  onRefresh: () => Promise<void>
  /** What is said without a signal, when it fails, and (for screen readers) when it is up to date. */
  offlineText?: string
  failText?: string
  doneText?: string
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function run() {
    if (status === 'loading') return
    window.clearTimeout(timer.current)
    setStatus('loading')
    setError('')
    try {
      await onRefresh()
      setStatus('done')
      timer.current = window.setTimeout(() => setStatus('idle'), DONE_MS)
    } catch (err) {
      setStatus('error')
      setError(isNetworkError(err, navigator.onLine) ? offlineText : userFacingError(err, failText))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={status === 'loading'}
        className="flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-fg-secondary transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
      >
        {status === 'done' ? (
          <Check className="size-4 text-success" aria-hidden="true" />
        ) : (
          <RefreshCw className={`size-4 ${status === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
        )}
        {status === 'loading' ? 'Obnovuji…' : status === 'done' ? 'Aktuální' : 'Obnovit'}
      </button>
      {/* Read out for screen readers; an error also stays visible until the next try. */}
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'done' ? doneText : ''}
      </span>
      {status === 'error' && (
        <p role="alert" className="basis-full text-right text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
