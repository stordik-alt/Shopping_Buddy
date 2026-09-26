'use client'

import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { setIdeaStatusAction } from '@/app/actions/ideas'
import { IdeaForm } from '@/components/shared/idea-form'
import { IdeaStatusBadge } from '@/components/shared/idea-status-badge'
import { userFacingError } from '@/lib/errors'
import { IDEA_STATUS_LABEL, IDEA_STATUSES, ideaDayLabel, type AdminIdea, type IdeaStatus } from '@/lib/ideas'
import { safeLocalStorage } from '@/lib/safe-storage'
import { readThemeChoice, resolveDark } from '@/lib/theme-preference'

type Filter = IdeaStatus | 'all'

/** The administrator's screen: every household's ideas with a status to change, and a form to add
 *  one's own ideas to keep for later (they go to the administrator's own household like anyone's). */
export function AdminIdeas({ initialIdeas }: { initialIdeas: AdminIdea[] }) {
  const [ideas, setIdeas] = useState(initialIdeas)
  const [filter, setFilter] = useState<Filter>('new')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dark, setDark] = useState(false)

  // This page is outside the app shell, so it follows the saved theme choice itself (lib/theme-preference.ts).
  useEffect(() => {
    setDark(resolveDark(readThemeChoice(safeLocalStorage()), window.matchMedia('(prefers-color-scheme: dark)').matches))
  }, [])

  const countOf = (status: IdeaStatus) => ideas.filter((idea) => idea.status === status).length
  const shown = filter === 'all' ? ideas : ideas.filter((idea) => idea.status === filter)

  async function changeStatus(id: string, status: IdeaStatus) {
    setBusyId(id)
    setError(null)
    try {
      await setIdeaStatusAction(id, status)
      setIdeas((current) => current.map((idea) => (idea.id === id ? { ...idea, status } : idea)))
    } catch (err) {
      console.error('Changing idea status failed', err)
      setError(userFacingError(err, 'Stav se nepodařilo změnit. Zkuste to prosím znovu.'))
    } finally {
      setBusyId(null)
    }
  }

  const filters: { value: Filter; label: string; count: number }[] = [
    ...IDEA_STATUSES.map((status) => ({ value: status, label: IDEA_STATUS_LABEL[status], count: countOf(status) })),
    { value: 'all', label: 'Vše', count: ideas.length },
  ]

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Zpět do aplikace
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Správa nápadů</h1>
          <p className="mt-1 text-sm text-muted-foreground">Nápady od všech domácností. Změňte stav, nebo si přidejte vlastní nápad na později.</p>

          <section className="surface mt-5 p-5" aria-label="Přidat nápad">
            <h2 className="mb-3 text-sm font-semibold">Přidat vlastní nápad</h2>
            <IdeaForm onSaved={(saved) => setIdeas((current) => [saved, ...current])} />
          </section>

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filtr podle stavu">
            {filters.map((entry) => (
              <button
                key={entry.value}
                onClick={() => setFilter(entry.value)}
                aria-pressed={filter === entry.value}
                className={`min-h-9 rounded-full px-3 text-xs font-medium transition ${filter === entry.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-primary/10'}`}
              >
                {entry.label} ({entry.count})
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {shown.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {ideas.length === 0 ? 'Zatím nikdo neposlal žádný nápad.' : 'V tomto stavu teď žádný nápad není.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {shown.map((idea) => (
                <li key={idea.id} className="surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold">{idea.title}</p>
                    <IdeaStatusBadge status={idea.status} />
                  </div>
                  {idea.details && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{idea.details}</p>}
                  <p className="mt-2 break-words text-xs text-muted-foreground">
                    {idea.authorName ? `${idea.authorName} · ` : ''}
                    {idea.householdName} · {ideaDayLabel(idea.createdAt)}
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-xs font-medium">
                    Stav
                    <select
                      value={idea.status}
                      disabled={busyId === idea.id}
                      onChange={(event) => void changeStatus(idea.id, event.target.value as IdeaStatus)}
                      className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm font-normal disabled:opacity-60 sm:flex-none"
                    >
                      {IDEA_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {IDEA_STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                    {busyId === idea.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}
