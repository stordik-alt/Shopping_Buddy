import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import type { ReceiptImportState } from '@/lib/db/queries'
import type { ReceiptLineItem } from '@/lib/receipts'
import { money } from '@/lib/format'
import { ocrProviderLabel } from '@/lib/receipt-ocr-provider'
import { PANTRY_LOCATIONS } from '@/lib/pantry'
import type { ItemCategory, ItemUnit } from '@/lib/types'
import { userFacingError } from '@/lib/errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'

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
          <a href={imageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-10 items-center text-sm text-accent-text underline">
            Otevřít originál účtenky
          </a>
        </div>
      )}
      {item.rawOcrText && (
        <details className="rounded-lg border border-border p-2 text-xs">
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">Text přečtený z účtenky (OCR)</summary>
          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-fg-secondary">{item.rawOcrText}</pre>
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
  focusId = null,
  onFocusHandled,
}: {
  items: ReceiptImportState[]
  onRetry: (id: string) => Promise<ReceiptImportState>
  onConfirmReview: (id: string, items: ReceiptLineItem[], date: string) => Promise<void>
  onResolveDuplicate: (id: string, resolution: 'save_new' | 'use_existing' | 'cancel', items?: ReceiptLineItem[], date?: string) => Promise<void>
  onCancel: (id: string) => void
  /** A receipt to bring into view and focus ("Dnes je důležité" on Domů); consumed once. */
  focusId?: string | null
  onFocusHandled?: () => void
}) {
  useEffect(() => {
    if (!focusId) return
    const card = document.getElementById(`receipt-${focusId}`)
    card?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    card?.focus({ preventScroll: true })
    onFocusHandled?.()
  }, [focusId, onFocusHandled])

  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Účtenky čekající na vyřízení</h2>
      {items.map((item) => (
        // Focusable (tabIndex -1) so a link from Domů can land on this receipt; scroll-mt keeps it clear of the sticky header.
        <div key={item.id} id={`receipt-${item.id}`} tabIndex={-1} className="scroll-mt-20 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ReceiptPendingCard item={item} onRetry={onRetry} onConfirmReview={onConfirmReview} onResolveDuplicate={onResolveDuplicate} onCancel={onCancel} />
        </div>
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
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row
      const next = { ...row, ...changes }
      if ('category' in changes || 'subcategory' in changes) next.classificationSource = 'manual'
      return next
    }))
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(userFacingError(err, 'Akci se nepodařilo dokončit.'))
    } finally {
      setBusy(false)
    }
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-sm text-destructive">
      {error}
    </p>
  )
  const ocrLine = item.ocrProvider && <p className="mt-1 text-xs text-fg-muted">OCR: {ocrProviderLabel(item.ocrProvider)}</p>

  if (FAILED_STATUSES.has(item.status)) {
    return (
      <div className="rounded-2xl border-2 border-destructive/40 bg-card p-4">
        <Badge tone="danger">
          <AlertTriangle className="size-3.5" aria-hidden="true" /> Chyba
        </Badge>
        <p className="mt-2 text-sm font-semibold">Účtenku se nepodařilo zpracovat</p>
        <p className="mt-1 text-sm text-fg-secondary">{item.errorMessage ?? 'Neznámá chyba.'}</p>
        {ocrLine}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="lg" onClick={() => run(() => onRetry(item.id))} disabled={busy}>
            <RefreshCw aria-hidden="true" /> Zkusit znovu
          </Button>
          <Button variant="outline" size="lg" onClick={() => onCancel(item.id)}>
            Zahodit
          </Button>
        </div>
        {errorLine}
      </div>
    )
  }

  if (item.status === 'duplicate_review') {
    return (
      <div className="rounded-2xl border-2 border-warning/50 bg-card p-4">
        <Badge tone="warning">
          <Copy className="size-3.5" aria-hidden="true" /> Duplicita
        </Badge>
        <p className="mt-2 text-sm font-semibold">Vypadá to jako nákup, který už máte zaznamenaný</p>
        <p className="mt-1 text-sm text-fg-secondary">
          {rows.length} položek{item.extracted?.total != null ? ` · ${money(item.extracted.total)}` : ''}
          {item.extracted?.date ? ` · ${item.extracted.date}` : ''}
        </p>
        {ocrLine}
        <ReceiptSource item={item} />
        <label className="mt-3 block max-w-xs space-y-1.5 text-sm font-medium">
          <span>Datum nákupu</span>
          <Input aria-label="Datum nákupu" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="px-3" />
        </label>
        <ul className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <span className="min-w-0 break-words text-sm font-medium">{row.name}</span>
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:contents">
                <Select aria-label={`Kategorie položky ${index + 1}`} value={row.category} onChange={(e) => updateRow(index, { category: e.target.value as ItemCategory, subcategory: undefined })} className="px-3">
                  {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </Select>
                <Select aria-label={`Podkategorie položky ${index + 1}`} value={row.subcategory ?? ''} onChange={(e) => updateRow(index, { subcategory: e.target.value || undefined })} className="px-3">
                  <option value="">Bez podkategorie</option>
                  {subcategoriesOfItem(row.category).map((subcategory) => <option key={subcategory}>{subcategory}</option>)}
                </Select>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={() => run(() => onResolveDuplicate(item.id, 'use_existing'))} disabled={busy}>
            Je to duplicita, nepřidávat
          </Button>
          <Button size="lg" onClick={() => run(() => onResolveDuplicate(item.id, 'save_new', rows, purchaseDate))} disabled={busy}>
            <Check aria-hidden="true" /> Přesto uložit jako nový nákup
          </Button>
          <Button variant="ghost" size="lg" onClick={() => run(() => onResolveDuplicate(item.id, 'cancel'))} disabled={busy}>
            <X aria-hidden="true" /> Zahodit
          </Button>
        </div>
        {errorLine}
      </div>
    )
  }

  if (item.status === 'review_required') {
    // A row the household removed (spec section 13) stays visible — greyed out, clearly marked —
    // but is excluded from the location gate below and from the purchase itself
    // (createPurchaseFromReceiptItems filters `removed` items out entirely).
    const activeRows = rows.filter((row) => row.name.trim().length > 0 && !row.removed)
    // Blocks saving until every real row has a storage location — the whole reason this receipt
    // needs review might be exactly that the pipeline couldn't place one confidently, and the
    // point of review is to actually ask, not to let a blank silently turn into a default later.
    const canConfirm = !busy && activeRows.length > 0 && purchaseDate.trim().length > 0 && activeRows.every((row) => row.location)
    const missingLocations = activeRows.filter((row) => !row.location).length

    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <Badge tone="accent">Ke schválení</Badge>
        <p className="mt-2 text-sm font-semibold">Zkontrolujte rozpoznané položky</p>
        <p className="mt-1 text-sm text-fg-secondary">Rozpoznávání si u téhle účtenky nebylo jisté — projděte a opravte položky před uložením.</p>
        {ocrLine}
        <ReceiptSource item={item} />
        <label className="mt-3 block max-w-xs space-y-1.5 text-sm font-medium">
          <span>Datum nákupu</span>
          <Input aria-label="Datum nákupu" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="px-3" />
          <span className="block text-xs font-normal text-fg-muted">Datum může být opraveno ručně před uložením.</span>
        </label>
        <ul className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <li key={index} className={`rounded-xl border p-3 ${row.removed ? 'border-border/60 bg-muted/40' : 'border-border'}`}>
              {row.removed ? (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm text-fg-muted line-through">{row.name}</span>
                  {/* Restore before finalizing (spec section 13) — the line is excluded from the
                      purchase only once "Potvrdit a uložit" is actually pressed. */}
                  <Button variant="outline" aria-label={`Obnovit položku ${index + 1}`} onClick={() => updateRow(index, { removed: false })}>
                    <RotateCcw aria-hidden="true" /> Obnovit
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <div className="col-span-3 flex items-center gap-1 sm:col-span-6">
                    <Input aria-label={`Název položky ${index + 1}`} value={row.name} onChange={(e) => updateRow(index, { name: e.target.value })} className="min-w-0 flex-1 px-3" />
                    <button type="button" aria-label={`Odstranit položku ${index + 1}`} onClick={() => updateRow(index, { removed: true })} className="icon-button shrink-0 hover:!bg-destructive-subtle hover:!text-destructive">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  {row.productSuggestions && row.productSuggestions.length > 0 && (
                    // Which catalog product this line is (lib/receipt-product-match.ts). Confirming a
                    // pick links the line to it and teaches the printed text for next time; "none"
                    // keeps the line as it was read.
                    <label className="col-span-3 block space-y-1 text-xs text-fg-muted sm:col-span-6">
                      <span>Produkt</span>
                      <Select aria-label={`Produkt položky ${index + 1}`} value={row.productId ?? ''} onChange={(e) => updateRow(index, { productId: e.target.value || null })} className="px-3">
                        <option value="">Žádný z nabízených</option>
                        {row.productSuggestions.map((suggestion) => (
                          <option key={suggestion.productId} value={suggestion.productId}>
                            {suggestion.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
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
                  {/* The one field review can block on — marked invalid (red border, in words below) until chosen. */}
                  <Select
                    aria-label={`Uložení položky ${index + 1}`}
                    aria-invalid={row.location ? undefined : true}
                    value={row.location ?? ''}
                    onChange={(e) => updateRow(index, { location: (e.target.value || undefined) as ReceiptLineItem['location'] })}
                    className="col-span-3 px-3 sm:col-span-1"
                  >
                    <option value="" disabled>
                      Vyberte uložení
                    </option>
                    {PANTRY_LOCATIONS.map((location) => (
                      <option key={location}>{location}</option>
                    ))}
                  </Select>
                  {row.discount != null && (
                    // Shown only where the receipt carried a line discount. `price` above is the
                    // pre-discount unit price; this is the total taken off the whole line.
                    <label className="col-span-3 flex items-center gap-2 text-sm text-fg-secondary sm:col-span-2">
                      Sleva
                      <Input aria-label={`Sleva položky ${index + 1}`} type="number" min="0" step="0.1" value={row.discount} onChange={(e) => updateRow(index, { discount: Math.max(0, Number(e.target.value) || 0) })} className="w-28 px-3" />
                    </label>
                  )}
                  {row.nonInventory && (
                    // A deterministic suggestion (spec section 14), not a decision — the household
                    // can still remove or keep it; this just explains why it won't appear in Zásoby.
                    <Badge className="col-span-3 w-fit self-center sm:col-span-2">Nebude v zásobách</Badge>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {missingLocations > 0 && (
          <p className="mt-3 text-sm text-destructive">
            Vyberte uložení u {missingLocations === 1 ? '1 položky' : `${missingLocations} položek`}, pak půjde účtenku uložit.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="lg" onClick={() => run(() => onConfirmReview(item.id, rows, purchaseDate))} disabled={!canConfirm}>
            {busy ? 'Ukládám…' : 'Potvrdit a uložit'}
          </Button>
          <Button variant="outline" size="lg" onClick={() => onCancel(item.id)}>
            Zahodit
          </Button>
        </div>
        {errorLine}
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
          <Badge tone="warning">Zastaveno</Badge>
          <p className="mt-2 text-sm text-fg-secondary">Zpracování účtenky se zastavilo, než bylo dokončeno.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="lg" onClick={() => run(() => onRetry(item.id))} disabled={busy}>
              <RefreshCw aria-hidden="true" /> Zpracovat znovu
            </Button>
            <Button variant="outline" size="lg" onClick={() => onCancel(item.id)}>
              Zahodit
            </Button>
          </div>
          {errorLine}
        </div>
      )
    }
    return (
      <div role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-fg-secondary">
        <Badge>Zpracovává se</Badge> Účtenka se právě zpracovává…
      </div>
    )
  }

  return null
}
