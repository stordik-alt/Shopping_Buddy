'use client'

import { Lightbulb, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { listIdeasAction } from '@/app/actions/ideas'
import { IdeaForm } from '@/components/shared/idea-form'
import { IdeaStatusBadge } from '@/components/shared/idea-status-badge'
import { ideaDayLabel, type Idea } from '@/lib/ideas'

// "Nápady pro zlepšení": a form for ideas on how to improve the app and the list of the household's
// earlier ideas with their status, so the owner can go through them one by one. A native <dialog>
// opened with showModal() keeps focus inside and closes on Escape by itself (like InstallAppDialog).
export function IdeasDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [listError, setListError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // Loaded each time the dialog opens, so an idea whose status changed since is shown as it is now.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setListError(false)
    listIdeasAction()
      .then((rows) => {
        if (!cancelled) setIdeas(rows)
      })
      .catch((err) => {
        console.error('Loading ideas failed', err)
        if (!cancelled) setListError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, attempt])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> element itself; one inside lands on its content.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      aria-labelledby="ideas-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1.5rem),30rem)] rounded-3xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
            <Lightbulb className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ideas-title" className="text-base font-semibold leading-snug">
              Nápady pro zlepšení
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Co by vám v aplikaci pomohlo? Nápady procházíme a přidáváme ty, které dávají smysl.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button -mr-2 -mt-2" aria-label="Zavřít">
            <X />
          </button>
        </div>

        <div className="mt-4">
          <IdeaForm onSaved={(saved) => setIdeas((current) => [saved, ...(current ?? [])])} />
        </div>

        <section className="mt-5" aria-label="Vaše nápady">
          <h3 className="text-sm font-semibold">Vaše nápady</h3>
          {listError && (
            <p role="alert" className="mt-2 text-sm">
              Nápady se nepodařilo načíst.{' '}
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium text-primary underline">
                Zkusit znovu
              </button>
            </p>
          )}
          {!listError && ideas == null && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Načítám…
            </p>
          )}
          {ideas != null && ideas.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Zatím jste nic neposlali. První nápad napište výše.</p>}
          {ideas != null && ideas.length > 0 && (
            <ul className="mt-2 space-y-2">
              {ideas.map((idea) => (
                <li key={idea.id} className="rounded-2xl bg-muted p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-medium">{idea.title}</p>
                    <IdeaStatusBadge status={idea.status} />
                  </div>
                  {idea.details && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{idea.details}</p>}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {idea.authorName ? `${idea.authorName} · ` : ''}
                    {ideaDayLabel(idea.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </dialog>
  )
}
