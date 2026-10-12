'use client'

import { useEffect, useState, type ReactNode } from 'react'

// How long the "Odebrat / Zrušit" question stays open before it folds back by itself, so a stray
// tap never leaves a one-tap delete armed.
const CONFIRM_TIMEOUT_MS = 6000

/**
 * An icon button that removes something only after a second, explicit tap.
 *
 * The first tap does not remove anything: it swaps the icon for "Odebrat" / "Zrušit". Removing a
 * household member or child throws away their allergies and food preferences, which the household
 * would have to re-enter, so a single mis-tap on a small ✕ must not be enough.
 */
export function ConfirmRemoveButton({
  label,
  onConfirm,
  disabled = false,
  className = 'flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
  children,
}: {
  /** What is removed, for the accessible names: "Odebrat {label}". */
  label: string
  onConfirm: () => void
  disabled?: boolean
  /** Styling of the initial icon button. */
  className?: string
  /** The icon shown before the question opens. */
  children: ReactNode
}) {
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    if (!asking) return
    const timer = window.setTimeout(() => setAsking(false), CONFIRM_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [asking])

  if (!asking) {
    return (
      <button type="button" aria-label={`Odebrat ${label}`} onClick={() => setAsking(true)} disabled={disabled} className={className}>
        {children}
      </button>
    )
  }

  return (
    <div role="group" aria-label={`Opravdu odebrat ${label}?`} className="flex shrink-0 items-center gap-1.5" onKeyDown={(event) => event.key === 'Escape' && setAsking(false)}>
      <button
        type="button"
        autoFocus
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
        className="min-h-10 rounded-lg bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
      >
        Odebrat
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="min-h-10 rounded-lg px-3 text-sm text-fg-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Zrušit
      </button>
    </div>
  )
}
