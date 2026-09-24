import { useState } from 'react'
import { AlertTriangle, Check, Copy, RefreshCw, X } from 'lucide-react'
import type { ReceiptImportState } from '@/lib/db/queries'
import type { ReceiptLineItem } from '@/lib/receipts'
import { money } from '@/lib/format'
import { PANTRY_LOCATIONS } from '@/lib/pantry'
import type { ItemCategory, ItemUnit } from '@/lib/types'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml']

const FAILED_STATUSES = new Set(['ocr_failed', 'parsing_failed'])
const TRANSIENT_STATUSES = new Set(['uploaded', 'ocr_processing', 'ocr_completed', 'parsing', 'parsed', 'validating'])

/** The original upload and the raw OCR text, shown next to the recognized values so the reviewer
 *  can check them against what the receipt actually says (docs/08_OCR_RECEIPT_PIPELINE.md section
 *  14). The image comes from an authenticated route, not a public URL. It is wrapped/scaled rather
 *  than scrolled sideways, and a PDF (which `<img>` can't render) falls back to the link. */
function ReceiptSource({ item }: { item: ReceiptImportState }) {
  const [imageFailed, setImageFailed] = useState(false)
  if (!item.hasImage && !item.rawOcrText) return null
  const imageUrl = `/api/receipts/${item.id}/image`

  return (
    <div className="mt-3 space-y-2">
      {item.hasImage && (
        <div>
          {!imageFailed && (
            <a href={imageUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated route; next/image can't optimize it */}
              <img
                src={imageUrl}
                alt="Nahraná účtenka"
                onError={() => setImageFailed(true)}
                className="max-h-64 w-auto max-w-full rounded-lg border border-border object-contain"
              />
            </a>
          )}
          <a href={imageUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary underline">
            Otevřít originál účtenky
          </a>
        </div>
      )}
      {item.rawOcrText && (
        <details className="rounded-lg border border-border p-2 text-xs">
          <summary className="cursor-pointer font-medium">Text přečtený z účtenky (OCR)</summary>
          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-muted-foreground">{item.rawOcrText}</pre>
        </details>
      )}
    </div>
  )
}

/** Receipt photo uploads the household still needs to act on — per
 *  docs/08_OCR_RECEIPT_PIPELINE.md sections 13/14/19, a failed/ambiguous import must show the
 *  household a specific, actionable reason rather than silently disappearing. Manual entries
 *  (`ReceiptImport`'s form) never land here — they go straight to a purchase. */
export function ReceiptPending({
  items,
  onRetry,
  onConfirmReview,
  onResolveDuplicate,
  onCancel,
}: {
  items: ReceiptImportState[]
  onRetry: (id: string) => Promise<ReceiptImportState>
  onConfirmReview: (id: string, items: ReceiptLineItem[], date: string) => Promise<void>
  onResolveDuplicate: (id: string, resolution: 'save_new' | 'use_existing' | 'cancel', items?: ReceiptLineItem[], date?: string) => Promise<void>
  onCancel: (id: string) => void
}) {
  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <p className="text-sm font-semibold">Účtenky čekající na vyřízení</p>
      {items.map((item) => (
        <ReceiptPendingCard key={item.id} item={item} onRetry={onRetry} onConfirmReview={onConfirmReview} onResolveDuplicate={onResolveDuplicate} onCancel={onCancel} />
      ))}
    </section>
  )
}

function ReceiptPendingCard({
  item,
  onRetry,
  onConfirmReview,
  onResolveDuplicate,
  onCancel,
}: {
  item: ReceiptImportState
  onRetry: (id: string) => Promise<ReceiptImportState>
  onConfirmReview: (id: string, items: ReceiptLineItem[], date: string) => Promise<void>
  onResolveDuplicate: (id: string, resolution: 'save_new' | 'use_existing' | 'cancel', items?: ReceiptLineItem[], date?: string) => Promise<void>
  onCancel: (id: string) => void
}) {
  const [rows, setRows] = useState<ReceiptLineItem[]>(item.extracted?.items ?? [])
  const [purchaseDate, setPurchaseDate] = useState(item.extracted?.date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function updateRow(index: number, changes: Partial<ReceiptLineItem>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Akci se nepodařilo dokončit.')
    } finally {
      setBusy(false)
    }
  }

  if (FAILED_STATUSES.has(item.status)) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" /> Účtenku se nepodařilo zpracovat
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.errorMessage ?? 'Neznámá chyba.'}</p>
        {item.ocrProvider && <p className="mt-1 text-xs text-muted-foreground">OCR: {item.ocrProvider === 'azure_document_intelligence' ? 'Azure Document Intelligence' : 'Google Cloud Vision'}</p>}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => run(() => onRetry(item.id))}
            disabled={busy}
            className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Zkusit znovu
          </button>
          <button onClick={() => onCancel(item.id)} className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
            Zahodit
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  if (item.status === 'duplicate_review') {
    return (
      <div className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Copy className="h-4 w-4" /> Vypadá to jako nákup, který už máte zaznamenaný
        </p>
        {item.ocrProvider && <p className="mt-1 text-xs text-muted-foreground">OCR: {item.ocrProvider === 'azure_document_intelligence' ? 'Azure Document Intelligence' : 'Google Cloud Vision'}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {rows.length} položek{item.extracted?.total != null ? ` · ${money(item.extracted.total)}` : ''}
          {item.extracted?.date ? ` · ${item.extracted.date}` : ''}
        </p>
        <ReceiptSource item={item} />
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium">
            Datum nákupu
            <input
              aria-label="Datum nákupu"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="mt-1 block rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => run(() => onResolveDuplicate(item.id, 'use_existing'))}
            disabled={busy}
            className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            Je to duplicita, nepřidávat
          </button>
          <button
            onClick={() => run(() => onResolveDuplicate(item.id, 'save_new', rows, purchaseDate))}
            disabled={busy}
            className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" /> Přesto uložit jako nový nákup
          </button>
          <button
            onClick={() => run(() => onResolveDuplicate(item.id, 'cancel'))}
            disabled={busy}
            className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" /> Zahodit
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  if (item.status === 'review_required') {
    const activeRows = rows.filter((row) => row.name.trim().length > 0)
    // Blocks saving until every real row has a storage location — the whole reason this receipt
    // needs review might be exactly that the pipeline couldn't place one confidently, and the
    // point of review is to actually ask, not to let a blank silently turn into a default later.
    const canConfirm = !busy && activeRows.length > 0 && purchaseDate.trim().length > 0 && activeRows.every((row) => row.location)

    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Zkontrolujte rozpoznané položky</p>
        <p className="mt-1 text-xs text-muted-foreground">Rozpoznávání si u téhle účtenky nebylo jisté — projděte a opravte položky před uložením.</p>
        {item.ocrProvider && <p className="mt-1 text-xs text-muted-foreground">OCR: {item.ocrProvider === 'azure_document_intelligence' ? 'Azure Document Intelligence' : 'Google Cloud Vision'}</p>}
        <ReceiptSource item={item} />
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium">
            Datum nákupu
            <input
              aria-label="Datum nákupu"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="block rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Datum může být opraveno ručně před uložením.</span>
          </label>
          {rows.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
              <input
                aria-label={`Název položky ${index + 1}`}
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
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
              <select
                aria-label={`Uložení položky ${index + 1}`}
                value={row.location ?? ''}
                onChange={(e) => updateRow(index, { location: (e.target.value || undefined) as ReceiptLineItem['location'] })}
                className={`rounded-lg border px-2 py-1 text-xs ${row.location ? 'border-input bg-background' : 'border-destructive/60 bg-destructive/5 text-destructive'}`}
              >
                <option value="" disabled>
                  Vyberte uložení
                </option>
                {PANTRY_LOCATIONS.map((location) => (
                  <option key={location}>{location}</option>
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
              {row.discount != null && (
                // Shown only where the receipt carried a line discount. `price` above is the
                // pre-discount unit price; this is the total taken off the whole line.
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Sleva
                  <input
                    aria-label={`Sleva položky ${index + 1}`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={row.discount}
                    onChange={(e) => updateRow(index, { discount: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => run(() => onConfirmReview(item.id, rows, purchaseDate))}
            disabled={!canConfirm}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? 'Ukládám…' : 'Potvrdit a uložit'}
          </button>
          <button onClick={() => onCancel(item.id)} className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
            Zahodit
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  // Transient states (uploaded/ocr_processing/…) — uploadReceiptAction runs the whole pipeline
  // synchronously, so a caller only ever sees these mid-flight if another household member's
  // upload happens to still be running when this one's page loads. Nothing to act on yet.
  if (TRANSIENT_STATUSES.has(item.status)) {
    // `stalled` (computed server-side) means nothing has happened for long enough that no run is
    // plausibly still going — e.g. the browser closed between upload and processing — so offer to
    // start it again rather than showing "processing" forever.
    if (item.stalled) {
      return (
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">Zpracování účtenky se zastavilo, než bylo dokončeno.</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => run(() => onRetry(item.id))}
              disabled={busy}
              className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Zpracovat znovu
            </button>
            <button onClick={() => onCancel(item.id)} className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
              Zahodit
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      )
    }
    return <div className="rounded-2xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">Zpracovává se účtenka…</div>
  }

  return null
}
