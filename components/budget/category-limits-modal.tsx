import { useState } from 'react'
import { X } from 'lucide-react'
import { EXPENSE_CATEGORY_NAMES, type ExpenseCategory } from '@/lib/expense-categories'
import type { CategoryBudgets } from '@/lib/types'

/** Monthly limits per expense category. An empty field means no limit. Only the changed categories
 *  are sent; the server checks each amount again (setCategoryBudgetAction). */
export function CategoryLimitsModal({
  limits,
  onClose,
  onSave,
}: {
  limits: CategoryBudgets
  onClose: () => void
  onSave: (changes: { category: ExpenseCategory; amount: number | null }[]) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(EXPENSE_CATEGORY_NAMES.map((category) => [category, limits[category] != null ? String(limits[category]).replace('.', ',') : ''])),
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const changes: { category: ExpenseCategory; amount: number | null }[] = []
    for (const category of EXPENSE_CATEGORY_NAMES) {
      const text = drafts[category].replace(/[\s ]/g, '').replace(',', '.')
      const amount = text === '' ? null : Number(text)
      if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
        setError(`Limit pro ${category} musí být částka větší než 0, nebo prázdný.`)
        return
      }
      if (amount !== (limits[category] ?? null)) changes.push({ category, amount })
    }
    setBusy(true)
    setError('')
    try {
      await onSave(changes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Limity se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="min-w-0 text-lg font-semibold">Měsíční limity kategorií</h2>
          <button onClick={onClose} aria-label="Zavřít" className="icon-button shrink-0">
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Při 80 % a 100 % limitu přijde upozornění. Prázdné pole znamená bez limitu.</p>
        <div className="mt-5 space-y-3">
          {EXPENSE_CATEGORY_NAMES.map((category) => (
            <label key={category} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">{category}</span>
              <span className="flex shrink-0 items-center gap-2">
                <input
                  value={drafts[category]}
                  onChange={(event) => setDrafts((current) => ({ ...current, [category]: event.target.value }))}
                  type="text"
                  inputMode="decimal"
                  placeholder="bez limitu"
                  aria-label={`Limit ${category}`}
                  className="min-h-10 w-32 rounded-xl border border-input bg-background px-3 text-right outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="text-muted-foreground">Kč</span>
              </span>
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          onClick={() => void save()}
          disabled={busy}
          className="mt-5 min-h-11 w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {busy ? 'Ukládám…' : 'Uložit limity'}
        </button>
      </div>
    </div>
  )
}
