'use client'

import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { decideCategoryChangeAction } from '@/app/actions/category-changes'
import { decideSubcategoryChangeAction } from '@/app/actions/subcategory-changes'
import type { PendingSubcategoryChange } from '@/lib/db/subcategory-changes'
import type { PendingCategoryChange } from '@/lib/db/category-changes'
import { userFacingError } from '@/lib/errors'
import { safeLocalStorage } from '@/lib/safe-storage'
import { readThemeChoice, resolveDark } from '@/lib/theme-preference'

/** The administrator's queue of catalog subcategory moves that needed approval (a product moved more
 *  than a few times): approve applies it to the shared catalog for every household, reject keeps it. */
export function AdminSubcategoryChanges({ initialChanges, initialCategoryChanges }: { initialChanges: PendingSubcategoryChange[]; initialCategoryChanges: PendingCategoryChange[] }) {
  const [changes, setChanges] = useState(initialChanges)
  const [categoryChanges, setCategoryChanges] = useState(initialCategoryChanges)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dark, setDark] = useState(false)

  // Outside the app shell, so it follows the saved theme choice itself (lib/theme-preference.ts).
  useEffect(() => {
    setDark(resolveDark(readThemeChoice(safeLocalStorage()), window.matchMedia('(prefers-color-scheme: dark)').matches))
  }, [])

  async function decide(id: string, approve: boolean) {
    setBusyId(id)
    setError(null)
    try {
      await decideSubcategoryChangeAction(id, approve)
      setChanges((current) => current.filter((change) => change.id !== id))
    } catch (err) {
      console.error('Deciding a subcategory change failed', err)
      setError(userFacingError(err, 'Rozhodnutí se nepodařilo uložit. Zkuste to prosím znovu.'))
    } finally {
      setBusyId(null)
    }
  }

  async function decideCategory(id: string, approve: boolean) {
    setBusyId(id)
    setError(null)
    try {
      await decideCategoryChangeAction(id, approve)
      setCategoryChanges((current) => current.filter((change) => change.id !== id))
    } catch (err) {
      console.error('Deciding a category change failed', err)
      setError(userFacingError(err, 'Rozhodnutí se nepodařilo uložit. Zkuste to prosím znovu.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
          <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Zpět do aplikace
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Schvalování kategorií a podkategorií</h1>
          <p className="mt-1 text-sm text-muted-foreground">Produkt, který domácnosti přesunuly víckrát, čeká tady. Schválení změní podkategorii ve sdíleném katalogu pro všechny.</p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <h2 className="mt-6 text-lg font-semibold">Kategorie produktů</h2>
          <p className="mt-1 text-sm text-muted-foreground">Rozhodnutí je konečné: kategorie produktu se pak už nedá změnit, ať návrh schválíte, nebo zamítnete.</p>
          {categoryChanges.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nic nečeká na schválení.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {categoryChanges.map((change) => (
                <li key={change.id} className="surface p-4">
                  <p className="min-w-0 break-words text-sm font-semibold">{change.productName}</p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {change.fromName} → <span className="font-medium text-foreground">{change.toName}</span>
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {change.householdName} · {new Date(change.createdAt).toLocaleDateString('cs-CZ')}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === change.id}
                      onClick={() => void decideCategory(change.id, true)}
                      className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      Schválit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === change.id}
                      onClick={() => void decideCategory(change.id, false)}
                      className="min-h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
                    >
                      Zamítnout
                    </button>
                    {busyId === change.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-8 text-lg font-semibold">Podkategorie produktů</h2>
          {changes.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nic nečeká na schválení.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {changes.map((change) => (
                <li key={change.id} className="surface p-4">
                  <p className="min-w-0 break-words text-sm font-semibold">{change.productName}</p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {change.category}: {change.fromName ?? 'bez podkategorie'} → <span className="font-medium text-foreground">{change.toName}</span>
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {change.householdName} · {new Date(change.createdAt).toLocaleDateString('cs-CZ')}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === change.id}
                      onClick={() => void decide(change.id, true)}
                      className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      Schválit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === change.id}
                      onClick={() => void decide(change.id, false)}
                      className="min-h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
                    >
                      Zamítnout
                    </button>
                    {busyId === change.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}
