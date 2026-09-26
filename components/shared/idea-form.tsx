'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { submitIdeaAction } from '@/app/actions/ideas'
import { userFacingError } from '@/lib/errors'
import { IDEA_DETAILS_MAX, IDEA_TITLE_MAX, validateIdeaInput, type AdminIdea } from '@/lib/ideas'

/** The form for a new improvement idea, used in the account-menu dialog and on the administrator's
 *  screen. Calls `onSaved` with the stored idea. */
export function IdeaForm({ onSaved }: { onSaved: (idea: AdminIdea) => void }) {
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      onSaved(saved)
      setTitle('')
      setDetails('')
    } catch (err) {
      console.error('Saving idea failed', err)
      // In production the message of a failed Server Action is replaced by a generic one.
      setError(userFacingError(err, 'Nápad se nepodařilo uložit. Zkuste to prosím znovu.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
  )
}
