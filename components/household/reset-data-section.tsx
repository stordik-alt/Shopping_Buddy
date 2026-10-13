'use client'

import { AlertTriangle, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { resetHouseholdDataAction } from '@/app/actions/data-reset'
import { CollapsibleSection } from '@/components/shared/collapsible-section'
import { confirmsHouseholdName, DATA_RESET_GROUPS, DATA_RESET_LABELS, type DataResetGroup } from '@/lib/data-reset'
import { userFacingError } from '@/lib/errors'

// The owner's "Smazání dat" (docs/39_DATA_RESET.md): wipes the chosen user data and keeps the profile. The
// red warning and the typed household name are there to stop an accidental tap; the server checks the name
// and the owner role again. A native <dialog> keeps focus inside and closes on Escape by itself.
export function ResetDataSection({ householdName }: { householdName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<DataResetGroup[]>([])
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setChosen([])
      setTyped('')
      setError('')
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const allChosen = chosen.length === DATA_RESET_GROUPS.length
  const canConfirm = chosen.length > 0 && confirmsHouseholdName(typed, householdName) && !busy

  function toggle(group: DataResetGroup) {
    setChosen((current) => (current.includes(group) ? current.filter((entry) => entry !== group) : [...current, group]))
  }

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await resetHouseholdDataAction(chosen, typed)
    } catch (err) {
      setError(userFacingError(err, 'Smazání se nezdařilo.'))
      setBusy(false)
      return
    }
    // The data is gone; the offline copy of the pages still shows it, so it goes too, and a full reload
    // gives every part of the app (list, pantry, budget …) a clean start instead of stale screens.
    try {
      await caches.delete('shopping-buddy-page-v1')
    } catch (cacheError) {
      console.error('Could not clear the offline page cache', cacheError)
    }
    window.location.reload()
  }

  return (
    <CollapsibleSection title="Smazání dat" icon={<Trash2 />} summary="Nevratně smaže vybraná data, profil zůstane">
      <p className="text-sm text-fg-muted">
        Smaže vámi vybraná uživatelská data domácnosti (nákupy, výdaje, příjmy, rozpočty a podobně). Nastavení profilu, členové, děti, preference a obchody zůstanou.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-medium text-white hover:opacity-90"
      >
        <Trash2 className="size-4" aria-hidden="true" /> Smazat data…
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current && !busy) setOpen(false)
        }}
        aria-labelledby="reset-data-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-destructive bg-surface-elevated p-5 text-foreground shadow-elevated backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="reset-data-title" className="text-base font-semibold text-destructive">
            Smazat data domácnosti
          </h2>
          <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Zavřít" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-destructive bg-destructive-subtle p-3 text-sm font-medium text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Pozor, smazání je nevratné. Smazaná data nejde obnovit, ani my je nedokážeme vrátit. Smaže se pro celou domácnost, všem členům.
          </p>
        </div>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">Co smazat</legend>
          <label className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-sm font-medium">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-[var(--destructive)]"
              checked={allChosen}
              onChange={() => setChosen(allChosen ? [] : [...DATA_RESET_GROUPS])}
            />
            Vybrat vše
          </label>
          {DATA_RESET_GROUPS.map((group) => (
            <label key={group} className="flex min-h-11 items-start gap-3 rounded-xl px-1 py-1.5 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--destructive)]" checked={chosen.includes(group)} onChange={() => toggle(group)} />
              <span className="min-w-0">
                <span className="block font-medium">{DATA_RESET_LABELS[group].title}</span>
                <span className="block text-fg-muted">{DATA_RESET_LABELS[group].description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="mt-4 block text-sm">
          Pro potvrzení napište název domácnosti ({householdName})
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
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
          <button type="button" onClick={() => setOpen(false)} disabled={busy} className="min-h-11 rounded-xl px-4 text-sm hover:bg-muted">
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!canConfirm}
            className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Mažu…' : 'Smazat navždy'}
          </button>
        </div>
      </dialog>
    </CollapsibleSection>
  )
}
