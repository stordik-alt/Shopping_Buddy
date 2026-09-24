import { useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, Loader2, Plus, Receipt, Trash2 } from 'lucide-react'
import type { ReceiptImportState } from '@/lib/db/queries'
import { ocrProviderLabel } from '@/lib/receipt-ocr-provider'
import { RECEIPT_STEPS, receiptProgress, type ReceiptProgress } from '@/lib/receipt-progress'
import { assertReceiptFitsUpload, optimizeReceiptImage } from '@/lib/receipt-upload'
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

/** The five stages of a photo import (docs/08_OCR_RECEIPT_PIPELINE.md section 20), driven by the
 *  import's real status rather than a timer. Laid out as a wrapping vertical list so long labels
 *  never overflow a phone screen. */
function ReceiptProgressSteps({ progress }: { progress: ReceiptProgress }) {
  return (
    <ol role="status" aria-live="polite" aria-label="Průběh zpracování účtenky" className="mt-3 space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-xs">
      {RECEIPT_STEPS.map((label, index) => {
        const done = index < progress.step || (progress.step === RECEIPT_STEPS.length - 1 && index === progress.step)
        const failed = progress.failed && index === progress.step
        const current = !done && !failed && index === progress.step
        return (
          <li key={label} className={`flex items-center gap-2 ${done || current || failed ? 'text-foreground' : 'text-muted-foreground'}`}>
            {failed ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            ) : done ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : current ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
            )}
            <span className={current ? 'font-medium' : ''}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
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
  onUpload: (base64: string, mimeType: string, onProgress: (status: string) => void) => Promise<ReceiptImportState>
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ReceiptLineItem[]>([emptyRow()])
  const [storeLocationId, setStoreLocationId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<ReceiptProgress | null>(null)
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
    const selectedFile = event.target.files?.[0]
    event.target.value = '' // lets the same file be picked again after a retry
    if (!selectedFile) return

    setUploading(true)
    setError('')
    setProgress(receiptProgress('uploading'))

    try {
      const file = await optimizeReceiptImage(selectedFile)
      assertReceiptFitsUpload(file)
      const base64 = await readFileAsBase64(file)
      const result = await onUpload(base64, file.type, (status) => setProgress(receiptProgress(status)))
      setLastOcrProvider(result.ocrProvider)
      setOpen(false) // result (completed, or needing review) surfaces via ReceiptPending
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fotografii se nepodařilo nahrát.')
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  if (!open) {
    return (
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Camera className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Nákup z účtenky</p>
            <p className="text-xs text-muted-foreground">Vyfoťte účtenku — doplníme historii i zásoby.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Receipt className="h-4 w-4" aria-hidden="true" /> Nahrát účtenku
        </button>
      </div>
    )
  }

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Nákup z účtenky</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">
          Zavřít
        </button>
      </div>
      {lastOcrProvider && (
        <p className="mb-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Poslední OCR: {ocrProviderLabel(lastOcrProvider)}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          // HEIC is deliberately not listed: when it isn't, iOS converts a chosen photo to JPEG
          // itself, and neither Google Vision nor the server's image library can read HEIC.
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          onChange={handlePhoto}
          className="sr-only"
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground ${uploading ? 'opacity-60' : ''}`}
        >
          <Camera className="h-4 w-4" /> {uploading ? 'Zpracovávám účtenku…' : 'Vyfotit nebo nahrát účtenku'}
        </button>
        <span className="text-xs text-muted-foreground">JPG, PNG, WebP nebo PDF · nebo zadejte položky ručně níže</span>
      </div>
      {progress && <ReceiptProgressSteps progress={progress} />}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
          Datum
          <input aria-label="Datum nákupu" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent outline-none" />
        </label>
        <label className="flex min-w-0 max-w-full basis-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs sm:basis-auto">
          Obchod
          <select aria-label="Obchod" value={storeLocationId} onChange={(e) => setStoreLocationId(e.target.value)} className="min-w-0 max-w-full flex-1 truncate bg-transparent outline-none">
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
              min="0.001"
              step="any"
              value={row.quantity}
              onChange={(e) => updateRow(index, { quantity: Math.max(0.001, Number(e.target.value) || 0.001) })}
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
              type="button"
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
        <button type="button" onClick={addRow} className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
          <Plus className="h-4 w-4" /> Přidat položku
        </button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {saving ? 'Ukládám…' : 'Uložit nákup'}
        </button>
      </div>
    </div>
  )
}
