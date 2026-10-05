import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
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
      const text = drafts[category].replace(/[\s ]/g, '').replace(',', '.')
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
    <Sheet
      open
      onClose={onClose}
      title="Měsíční limity kategorií"
      description="Při 80 % a 100 % limitu přijde upozornění. Prázdné pole znamená bez limitu."
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={() => void save()} disabled={busy}>
            {busy ? 'Ukládám…' : 'Uložit limity'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {EXPENSE_CATEGORY_NAMES.map((category) => (
          <label key={category} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{category}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Input
                value={drafts[category]}
                onChange={(event) => setDrafts((current) => ({ ...current, [category]: event.target.value }))}
                type="text"
                inputMode="decimal"
                placeholder="bez limitu"
                aria-label={`Limit ${category}`}
                className="w-32 px-3 text-right"
              />
              <span className="text-fg-muted">Kč</span>
            </span>
          </label>
        ))}
      </div>
    </Sheet>
  )
}
