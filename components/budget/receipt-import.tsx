import { useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, ChevronDown, ImageUp, Loader2, Plus, Receipt, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import type { ReceiptImportState } from '@/lib/db/queries'
import { ocrProviderLabel } from '@/lib/receipt-ocr-provider'
import { RECEIPT_STEPS, receiptProgress, type ReceiptProgress } from '@/lib/receipt-progress'
import { userFacingError } from '@/lib/errors'
import { HEIC_UNSUPPORTED_MESSAGE, isHeicFile, optimizeReceiptImage } from '@/lib/receipt-upload'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import type { ReceiptLineItem } from '@/lib/receipts'
import type { ItemCategory, ItemUnit, Store } from '@/lib/types'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml']

const emptyRow = (): ReceiptLineItem => ({ name: '', category: 'Potraviny', quantity: 1, unit: 'ks', price: 0, classificationSource: 'manual' })

/** The five stages of a photo import (docs/08_OCR_RECEIPT_PIPELINE.md section 20), driven by the
 *  import's real status rather than a timer. Laid out as a wrapping vertical list so long labels
 *  never overflow a phone screen. */
function ReceiptProgressSteps({ progress }: { progress: ReceiptProgress }) {
  return (
    <ol role="status" aria-live="polite" aria-label="Průběh zpracování účtenky" className="mt-3 space-y-1.5 rounded-xl bg-muted p-3 text-sm">
      {RECEIPT_STEPS.map((label, index) => {
        const done = index < progress.step || (progress.step === RECEIPT_STEPS.length - 1 && index === progress.step)
        const failed = progress.failed && index === progress.step
        const current = !done && !failed && index === progress.step
        return (
          <li key={label} className={`flex items-center gap-2 ${done || current || failed ? 'text-foreground' : 'text-fg-muted'}`}>
            {failed ? (
              <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            ) : done ? (
              <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
            ) : current ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-accent-text" aria-hidden="true" />
            ) : (
              <span className="size-4 shrink-0 rounded-full border border-border" aria-hidden="true" />
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
  onUpload: (file: File, onProgress: (status: string) => void) => Promise<ReceiptImportState>
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
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function updateRow(index: number, changes: Partial<ReceiptLineItem>) {
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row
      const next = { ...row, ...changes }
      if ('category' in changes || 'subcategory' in changes) next.classificationSource = 'manual'
      return next
    }))
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
      setError(userFacingError(err, 'Nákup se nepodařilo uložit. Zkuste to prosím znovu.'))
    } finally {
      setSaving(false)
    }
  }

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0]
    event.target.value = '' // lets the same file be picked again after a retry
    if (!selectedFile) return
    // A HEIC photo cannot be read anywhere down the line; say so before spending the upload on it.
    if (isHeicFile(selectedFile)) {
      setError(HEIC_UNSUPPORTED_MESSAGE)
      return
    }

    setUploading(true)
    setError('')
    setProgress(receiptProgress('uploading'))

    try {
      const file = await optimizeReceiptImage(selectedFile)
      const result = await onUpload(file, (status) => setProgress(receiptProgress(status)))
      setLastOcrProvider(result.ocrProvider)
      setOpen(false) // result (completed, or needing review) surfaces via ReceiptPending
    } catch (err) {
      setError(userFacingError(err, 'Fotografii se nepodařilo nahrát. Zkuste to prosím znovu, případně účtenku vyfoťte znovu.'))
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  if (!open) {
    return (
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent-text">
            <Camera className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Nákup z účtenky</p>
            <p className="text-sm text-fg-secondary">Vyfoťte účtenku — doplníme historii i zásoby.</p>
          </div>
        </div>
        <Button variant="accent" size="lg" onClick={() => setOpen(true)}>
          <Receipt aria-hidden="true" /> Nahrát účtenku
        </Button>
      </div>
    )
  }

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Nákup z účtenky</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Zavřít nahrávání účtenky" className="icon-button -m-2">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      {lastOcrProvider && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-fg-muted">Poslední OCR: {ocrProviderLabel(lastOcrProvider)}</p>}
      {/* Two ways in, so a new photo comes out in a format the OCR reads. Taking the photo: only JPEG
          and `capture`, so the phone opens its camera directly — a camera started by another app
          returns a JPEG even when the phone saves its own photos as HEIF ("high efficiency"). With
          PDF in `accept` too, Android shows a camera/files/gallery chooser instead and a gallery
          photo may be HEIC, which Chrome on Android cannot convert. Uploading: an existing photo
          or an e-receipt PDF; HEIC is deliberately not listed, so iOS converts a chosen photo to
          JPEG itself, and a HEIC from Android gets a clear message (isHeicFile). */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg"
          capture="environment"
          onChange={handlePhoto}
          className="sr-only"
          disabled={uploading}
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handlePhoto}
          className="sr-only"
          disabled={uploading}
          tabIndex={-1}
          aria-hidden="true"
        />
        <Button variant="accent" size="lg" className="min-h-12" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />} {uploading ? 'Zpracovávám účtenku…' : 'Vyfotit účtenku'}
        </Button>
        <Button variant="outline" size="lg" className="min-h-12" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <ImageUp className="text-accent-text" aria-hidden="true" /> Nahrát z galerie nebo PDF
        </Button>
      </div>
      <p className="mt-2 text-xs text-fg-muted">Z galerie JPG, PNG, WebP nebo PDF</p>
      {progress && <ReceiptProgressSteps progress={progress} />}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* The always-available fallback when a photo cannot be read — one tap away, not in the way. */}
      <details className="group mt-4 border-t border-border pt-2">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-lg text-sm font-medium text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          Zadat položky ručně <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Datum</span>
            <Input aria-label="Datum nákupu" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3" />
          </label>
          <label className="block min-w-0 space-y-1.5 text-sm font-medium">
            <span>Obchod</span>
            <Select aria-label="Obchod" value={storeLocationId} onChange={(e) => setStoreLocationId(e.target.value)} className="truncate px-3">
              <option value="">Neurčeno</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.chain} – {store.name}, {store.city}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <ul className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="grid grid-cols-3 gap-2 rounded-xl border border-border p-3 sm:grid-cols-5">
              <div className="col-span-3 flex items-center gap-1 sm:col-span-5">
                <Input aria-label={`Název položky ${index + 1}`} value={row.name} onChange={(e) => updateRow(index, { name: e.target.value })} placeholder="Název" className="min-w-0 flex-1 px-3" />
                <button type="button" aria-label={`Odstranit položku ${index + 1}`} onClick={() => removeRow(index)} className="icon-button shrink-0 hover:!bg-destructive-subtle hover:!text-destructive">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
              <Input aria-label={`Množství položky ${index + 1}`} type="number" min="0.001" step="any" value={row.quantity} onChange={(e) => updateRow(index, { quantity: Math.max(0.001, Number(e.target.value) || 0.001) })} className="px-2.5" />
              <Select aria-label={`Jednotka položky ${index + 1}`} value={row.unit} onChange={(e) => updateRow(index, { unit: e.target.value as ItemUnit })} className="px-3">
                {UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </Select>
              <Input aria-label={`Cena položky ${index + 1}`} type="number" min="0" step="0.1" value={row.price} onChange={(e) => updateRow(index, { price: Math.max(0, Number(e.target.value) || 0) })} className="px-2.5" />
              <Select aria-label={`Kategorie položky ${index + 1}`} value={row.category} onChange={(e) => updateRow(index, { category: e.target.value as ItemCategory, subcategory: undefined })} className="col-span-3 px-3 sm:col-span-1">
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </Select>
              <Select aria-label={`Podkategorie položky ${index + 1}`} value={row.subcategory ?? ''} onChange={(e) => updateRow(index, { subcategory: e.target.value || undefined })} className="col-span-3 px-3 sm:col-span-1">
                <option value="">Bez podkategorie</option>
                {subcategoriesOfItem(row.category).map((subcategory) => (
                  <option key={subcategory}>{subcategory}</option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="lg" onClick={addRow}>
            <Plus aria-hidden="true" /> Přidat položku
          </Button>
          <Button size="lg" onClick={submit} disabled={saving}>
            {saving ? 'Ukládám…' : 'Uložit nákup'}
          </Button>
        </div>
      </details>
    </div>
  )
}
