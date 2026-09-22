import { useRef, useState } from 'react'
import { Camera, Plus, Receipt, Trash2 } from 'lucide-react'
import type { ReceiptImportState } from '@/lib/db/queries'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { ItemCategory, ItemUnit, Store } from '@/lib/types'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml']

const emptyRow = (): ReceiptLineItem => ({ name: '', category: 'Potraviny', quantity: 1, unit: 'ks', price: 0 })

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Soubor se nepodařilo přečíst.'))
    reader.readAsDataURL(file)
  })
}

/** Two ways to get a receipt into the system: a real photo (Google Cloud Vision OCR + a cheap
 *  structuring model, see docs/08_OCR_RECEIPT_PIPELINE.md — an owner-approved, narrowly-scoped
 *  exception to CLAUDE.md section 30's AI deferral) or manual entry, kept as the always-available
 *  fallback for a photo that fails to process. Both converge on the same
 *  importReceiptAction/receipt_imports/pantry-restocking path. A photo upload that comes back
 *  `review_required`/`duplicate_review`/failed doesn't just vanish — `onUpload`'s result is handed
 *  to the parent, which surfaces it via `ReceiptPending` for the household to resolve. */
export function ReceiptImport({
  stores,
  onImport,
  onUpload,
}: {
  stores: Store[]
  onImport: (items: ReceiptLineItem[], options: { date?: string; storeLocationId?: string }) => Promise<void>
  onUpload: (base64: string, mimeType: string) => Promise<ReceiptImportState>
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ReceiptLineItem[]>([emptyRow()])
  const [storeLocationId, setStoreLocationId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [lastOcrProvider, setLastOcrProvider] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // lets the same file be picked again after a retry
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const base64 = await readFileAsBase64(file)
      const result = await onUpload(base64, file.type)
      setLastOcrProvider(result.ocrProvider)
      setOpen(false) // result (completed, or needing review) surfaces via ReceiptPending
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotografii se nepodařilo nahrát.')
    } finally {
      setUploading(false)
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
      {lastOcrProvider && (
        <p className="mb-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Poslední OCR: {lastOcrProvider === 'azure_document_intelligence' ? 'Azure Document Intelligence' : 'Google Cloud Vision'}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" capture="environment" onChange={handlePhoto} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Camera className="h-4 w-4" /> {uploading ? 'Zpracovávám účtenku…' : 'Vyfotit nebo nahrát účtenku'}
        </button>
        <span className="text-xs text-muted-foreground">JPG, PNG, WebP, HEIC nebo PDF · nebo zadejte položky ručně níže</span>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
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
      </div>
    </div>
  )
}
