'use client'

import { Lightbulb, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { listIdeasAction, submitIdeaAction } from '@/app/actions/ideas'
import { IDEA_DETAILS_MAX, IDEA_STATUS_LABEL, IDEA_TITLE_MAX, validateIdeaInput, type Idea, type IdeaStatus } from '@/lib/ideas'

// "Nápady pro zlepšení": a form for ideas on how to improve the app and the list of the household's
// earlier ideas with their status, so the owner can go through them one by one. A native <dialog>
// opened with showModal() keeps focus inside and closes on Escape by itself (like InstallAppDialog).

const STATUS_STYLE: Record<IdeaStatus, string> = {
  new: 'bg-muted text-muted-foreground',
  planned: 'bg-primary/15 text-primary',
  done: 'bg-success/15 text-success',
  declined: 'bg-destructive/10 text-destructive',
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })

export function IdeasDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    // The server checks the same rules; checking here only saves a round trip.
    const checked = validateIdeaInput({ title, details })
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await submitIdeaAction({ title, details })
      setIdeas((current) => [saved, ...(current ?? [])])
      setTitle('')
      setDetails('')
    } catch (err) {
      console.error('Saving idea failed', err)
      setError(err instanceof Error && err.message ? err.message : 'Nápad se nepodařilo uložit. Zkuste to prosím znovu.')
    } finally {
      setSaving(false)
    }
  }

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

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Nápad
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={IDEA_TITLE_MAX}
              placeholder="Např. Sdílet nákupní seznam odkazem"
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block text-sm font-medium">
            Podrobnosti <span className="font-normal text-muted-foreground">(nepovinné)</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={IDEA_DETAILS_MAX}
              rows={4}
              placeholder="Kdy by se to hodilo a jak by to mělo fungovat?"
              className="mt-1 w-full resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Odeslat nápad
          </button>
        </form>

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
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[idea.status]}`}>{IDEA_STATUS_LABEL[idea.status]}</span>
                  </div>
                  {idea.details && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{idea.details}</p>}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {idea.authorName ? `${idea.authorName} · ` : ''}
                    {dayLabel(idea.createdAt)}
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
