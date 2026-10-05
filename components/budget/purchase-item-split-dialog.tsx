import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EXPENSE_CATEGORY_NAMES, subcategoriesOf, type ExpenseCategory } from '@/lib/expense-categories'
import { userFacingError } from '@/lib/errors'
import { money } from '@/lib/format'
import { automaticExpenseCategory, type ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { PurchaseItem } from '@/lib/types'

type Row = { category: ExpenseCategory; subcategory: string | null; amount: string }

const centsOf = (amount: number) => Math.round(amount * 100)

/** Splits one purchase item's paid amount across one or more expense categories, e.g. "Oblečení"
 *  that was actually half adult, half a child's clothing — a receipt often can't say (owner request,
 *  2026-09-27). A single row is a plain reassignment; the app then also remembers it for the product
 *  (lib/db/purchase-items.ts), so it does not have to be repeated on the next receipt — a genuine,
 *  multi-row split does not, since it is specific to this one purchase. A native <dialog> opened with
 *  showModal() keeps focus inside and closes on Escape by itself (like the account menu's dialogs). */
export function PurchaseItemSplitDialog({
  open,
  item,
  onClose,
  onSave,
}: {
  open: boolean
  /** Only rendered while `item.category` is known — the caller decides that (purchase-history.tsx). */
  item: PurchaseItem & { id: string; category: NonNullable<PurchaseItem['category']> }
  onClose: () => void
  onSave: (splits: ExpenseSplitPart[]) => Promise<void>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const totalAmount = item.price * item.quantity
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Re-seeded every time the dialog opens, from whatever is currently saved — not just once, so
  // reopening after a save (or after another device changed it) shows the real current state.
  useEffect(() => {
    if (!open) return
    const existing = item.expenseSplits ?? []
    setRows(
      existing.length > 0
        ? existing.map((split) => ({ category: split.category, subcategory: split.subcategory, amount: split.amount.toFixed(2) }))
        : [{ category: automaticExpenseCategory(item.category), subcategory: null, amount: totalAmount.toFixed(2) }],
    )
    setError('')
  }, [open, item, totalAmount])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  function updateRow(index: number, changes: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  }

  function addRow() {
    setRows((current) => [...current, { category: automaticExpenseCategory(item.category), subcategory: null, amount: '0' }])
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index))
  }

  const parsedAmounts = rows.map((row) => Number(row.amount.replace(',', '.')))
  const allocatedCents = parsedAmounts.reduce((sum, amount) => sum + (Number.isFinite(amount) ? centsOf(amount) : 0), 0)
  const remainingCents = centsOf(totalAmount) - allocatedCents
  const everyAmountValid = parsedAmounts.every((amount) => Number.isFinite(amount) && amount > 0)
  const canSave = !saving && rows.length > 0 && everyAmountValid && remainingCents === 0

  async function save() {
    setSaving(true)
    setError('')
    try {
      await onSave(rows.map((row, index) => ({ category: row.category, subcategory: row.subcategory, amount: parsedAmounts[index] })))
      onClose()
    } catch (err) {
      setError(userFacingError(err, 'Rozdělení se nepodařilo uložit. Zkuste to prosím znovu.'))
    } finally {
      setSaving(false)
    }
  }

  async function resetToAutomatic() {
    setSaving(true)
    setError('')
    try {
      await onSave([])
      onClose()
    } catch (err) {
      setError(userFacingError(err, 'Nepodařilo se vrátit na automatické přiřazení.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      aria-labelledby="split-item-title"
      className="m-auto w-[min(calc(100vw-1.5rem),28rem)] rounded-3xl border border-border bg-surface-elevated p-0 text-foreground shadow-elevated backdrop:bg-black/40"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="split-item-title" className="break-words text-base font-semibold leading-snug">
              {item.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Celkem {money(totalAmount)}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button -mr-2 -mt-2 shrink-0" aria-label="Zavřít">
            <X />
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Rozdělte částku podle skutečnosti, když ji účtenka sama nerozlišuje — např. oblečení, které bylo napůl pro dítě.
        </p>

        <div className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border p-2">
              <select
                aria-label={`Kategorie části ${index + 1}`}
                value={row.category}
                onChange={(event) => updateRow(index, { category: event.target.value as ExpenseCategory, subcategory: null })}
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs"
              >
                {EXPENSE_CATEGORY_NAMES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Podkategorie části ${index + 1}`}
                value={row.subcategory ?? ''}
                onChange={(event) => updateRow(index, { subcategory: event.target.value || null })}
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="">Bez podkategorie</option>
                {subcategoriesOf(row.category).map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Částka části ${index + 1}`}
                value={row.amount}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
                inputMode="decimal"
                className="min-h-9 w-20 rounded-lg border border-input bg-background px-2 py-1 text-right text-xs"
              />
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(index)} aria-label={`Odebrat část ${index + 1}`} className="icon-button shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" onClick={addRow} className="flex min-h-9 items-center gap-1 text-xs font-medium text-primary">
            <Plus className="h-3.5 w-3.5" /> Přidat část
          </button>
          <p className={`text-xs font-medium ${remainingCents === 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
            {remainingCents === 0 ? 'Součet odpovídá celé částce' : `Zbývá rozdělit: ${money(remainingCents / 100)}`}
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Uložit
          </button>
          {(item.expenseSplits?.length ?? 0) > 0 && (
            <button type="button" onClick={() => void resetToAutomatic()} disabled={saving} className="min-h-10 rounded-xl border border-border px-4 text-sm text-muted-foreground disabled:opacity-60">
              Vrátit na automatické
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
