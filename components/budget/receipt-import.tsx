import { useState } from 'react'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { ItemCategory, ItemUnit, Store } from '@/lib/types'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml']

const emptyRow = (): ReceiptLineItem => ({ name: '', category: 'Potraviny', quantity: 1, unit: 'ks', price: 0 })

/** Manual receipt entry — the usable path until a real OCR provider exists (lib/receipts.ts's
 *  ReceiptOcrProvider). Every line item entered here goes through exactly the same
 *  importReceiptAction/receipt_imports/pantry-restocking path a future scanned receipt would, so
 *  wiring up OCR later only needs to replace how `items` gets populated — not this component or
 *  the Server Action. */
export function ReceiptImport({
  stores,
  onImport,
}: {
  stores: Store[]
  onImport: (items: ReceiptLineItem[], options: { date?: string; storeLocationId?: string }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ReceiptLineItem[]>([emptyRow()])
  const [storeLocationId, setStoreLocationId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateRow(index: number, changes: Partial<ReceiptLineItem>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()])
  }

  function removeRow(index: number) {
    setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current))
  }

  async function submit() {
    const items = rows.filter((row) => row.name.trim().length > 0)
    if (items.length === 0) {
      setError('Přidejte alespoň jednu položku s názvem.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onImport(items, { date, storeLocationId: storeLocationId || undefined })
      setRows([emptyRow()])
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nákup se nepodařilo uložit.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted"
      >
        <Receipt className="h-4 w-4" /> Přidat nákup z účtenky
      </button>
    )
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Nákup z účtenky</p>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">
          Zavřít
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Automatické čtení účtenky (OCR) zatím není k dispozici — zadejte prosím položky ručně. Jakmile bude doplněno, projde stejným zpracováním jako teď.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
          Datum
          <input aria-label="Datum nákupu" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
          Obchod
          <select aria-label="Obchod" value={storeLocationId} onChange={(e) => setStoreLocationId(e.target.value)} className="bg-transparent outline-none">
            <option value="">Neurčeno</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.chain} – {store.name}, {store.city}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
            <input
              aria-label={`Název položky ${index + 1}`}
              value={row.name}
              onChange={(e) => updateRow(index, { name: e.target.value })}
              placeholder="Název"
              className="min-w-[8rem] flex-1 bg-transparent px-2 py-1 text-sm outline-none"
            />
            <select
              aria-label={`Kategorie položky ${index + 1}`}
              value={row.category}
              onChange={(e) => updateRow(index, { category: e.target.value as ItemCategory })}
              className="rounded-lg border border-input bg-background px-2 py-1 text-xs"
            >
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <input
              aria-label={`Množství položky ${index + 1}`}
              type="number"
              min="1"
              value={row.quantity}
              onChange={(e) => updateRow(index, { quantity: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-xs"
            />
            <select
              aria-label={`Jednotka položky ${index + 1}`}
              value={row.unit}
              onChange={(e) => updateRow(index, { unit: e.target.value as ItemUnit })}
              className="rounded-lg border border-input bg-background px-2 py-1 text-xs"
            >
              {UNITS.map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
            <input
              aria-label={`Cena položky ${index + 1}`}
              type="number"
              min="0"
              step="0.1"
              value={row.price}
              onChange={(e) => updateRow(index, { price: Math.max(0, Number(e.target.value) || 0) })}
              className="w-20 rounded-lg border border-input bg-background px-2 py-1 text-xs"
            />
            <button
              aria-label={`Odstranit položku ${index + 1}`}
              onClick={() => removeRow(index)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={addRow} className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
          <Plus className="h-4 w-4" /> Přidat položku
        </button>
        <button onClick={submit} disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {saving ? 'Ukládám…' : 'Uložit nákup'}
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}
