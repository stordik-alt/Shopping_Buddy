'use client'

import { useState } from 'react'
import { PushToggle } from '@/components/notifications/push-toggle'
import { userFacingError } from '@/lib/errors'
import { NOTIFICATION_KINDS } from '@/lib/notification-kinds'
import { cn } from '@/lib/utils'

/** Profil ▸ Upozornění: which kinds of notification this member wants (docs/14_NOTIFICATION_PREFERENCES.md).
 *  Each kind is a switch, on by default; a kind switched off reaches neither this member's bell panel
 *  nor their phone. The device's own push permission is the separate switch under it. */
export function NotificationSettings({
  off,
  onChange,
  pushPublicKey,
}: {
  /** The kinds this member switched off. */
  off: string[]
  onChange: (kind: string, enabled: boolean) => Promise<void>
  pushPublicKey: string | null
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(kind: string, enabled: boolean) {
    setBusy(kind)
    setError(null)
    try {
      await onChange(kind, enabled)
    } catch (err) {
      setError(userFacingError(err, 'Nastavení se nepodařilo uložit. Zkuste to prosím znovu.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-secondary">Vyberte, co chcete dostávat. Platí jen pro vás — ostatní členové domácnosti si volí sami.</p>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {NOTIFICATION_KINDS.map((kind) => {
          const enabled = !off.includes(kind.key)
          return (
            <li key={kind.key}>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={busy === kind.key}
                onClick={() => void toggle(kind.key, !enabled)}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{kind.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{kind.description}</span>
                </span>
                {/* The switch says its state in words too, not by colour alone. */}
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-medium text-fg-secondary">{enabled ? 'Zapnuto' : 'Vypnuto'}</span>
                  <span aria-hidden="true" className={cn('relative h-6 w-11 rounded-full transition-colors', enabled ? 'bg-accent-solid' : 'bg-input')}>
                    <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {pushPublicKey && (
        <div>
          <p className="mb-2 text-sm font-medium">Upozornění na tomto zařízení</p>
          <PushToggle publicKey={pushPublicKey} />
        </div>
      )}
    </div>
  )
}
