import { useState } from 'react'
import { ChevronDown, Loader2, Pencil, PiggyBank, Plus, Repeat, ShoppingBag, Star, Trash2, TrendingUp } from 'lucide-react'
import { averageMonthlySpend, favoriteStores, mostBoughtProducts, repeatPurchases } from '@/lib/purchase-history'
import { PurchaseItemSplitDialog } from '@/components/budget/purchase-item-split-dialog'
import { Stat } from '@/components/shared/stat'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { userFacingError } from '@/lib/errors'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import { itemCountLabel, money, shortDate } from '@/lib/format'
import type { ExpenseSplitPart } from '@/lib/purchase-expenses'
import type { Expense, ItemCategory, ItemUnit, Notification, PurchaseItem, PurchaseRecord } from '@/lib/types'

// The newest few purchases are listed; the rest are one tap away, so the tab stays short.
const VISIBLE_PURCHASES = 5

export function PurchaseHistory({
  records,
  today,
  storeChains,
  onCreateManualPurchase,
  onSaveSplits,
  onRecordExpenses,
  onUploadReceipt,
}: {
  records: PurchaseRecord[]
  today?: string
  storeChains?: { id: string; chain: string; isOnline?: boolean }[]
  onCreateManualPurchase?: (input: {
    date: string
    storeChain?: string | null
    discount?: number | null
    items: Array<{ name: string; quantity: number; unit: ItemUnit; price: number; category: ItemCategory; subcategory?: string | null }>
  }) => Promise<{ purchase: PurchaseRecord; expenses: Expense[]; notifications: Notification[] }>
  /** Next step offered while there is no purchase yet. */
  onUploadReceipt?: () => void
  /** Saves (or, with an empty array, clears) one item's expense-category split — a plain
   *  reassignment or, since a receipt often can't say, a genuine split across more than one target
   *  (e.g. clothing that was actually half a child's). */
  onSaveSplits: (purchaseItemId: string, splits: ExpenseSplitPart[]) => Promise<void>
  /** Records a receipt-derived purchase into the budget after the fact (`record.needsBudgetRecording`
   *  — one imported before receipts started counting as expenses, or otherwise missed). */
  onRecordExpenses: (purchaseId: string) => Promise<void>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [editingItem, setEditingItem] = useState<(PurchaseItem & { id: string; category: NonNullable<PurchaseItem['category']> }) | null>(null)
  // The server action also revalidates, but the app never refreshes itself on a schedule
  // (CLAUDE.md section 10) — this makes a save stick on screen
  // immediately, the same way the store directory and the ideas admin screen already do.
  const [overrides, setOverrides] = useState<Record<string, ExpenseSplitPart[]>>({})
  const [recording, setRecording] = useState<string | null>(null)
  const [recorded, setRecorded] = useState<Record<string, boolean>>({})
  const [recordError, setRecordError] = useState<Record<string, string>>({})
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState('')
  const [manualDate, setManualDate] = useState(today ?? '')
  const [manualStore, setManualStore] = useState('')
  const [manualDiscount, setManualDiscount] = useState('')
  const [manualItems, setManualItems] = useState<Array<{ name: string; quantity: string; unit: ItemUnit; price: string; category: ItemCategory; subcategory: string }>>([
    { name: '', quantity: '1', unit: 'ks', price: '', category: 'Potraviny', subcategory: '' },
  ])
  const splitsOf = (item: PurchaseItem) => (item.id != null && item.id in overrides ? overrides[item.id] : (item.expenseSplits ?? []))
  const newestFirst = records.slice().reverse()

  async function recordExpenses(purchaseId: string) {
    setRecording(purchaseId)
    setRecordError((current) => ({ ...current, [purchaseId]: '' }))
    try {
      await onRecordExpenses(purchaseId)
      setRecorded((current) => ({ ...current, [purchaseId]: true }))
    } catch (err) {
      setRecordError((current) => ({ ...current, [purchaseId]: userFacingError(err, 'Nákup se nepodařilo zapsat do rozpočtu.') }))
    } finally {
      setRecording(null)
    }
  }
  const shownRecords = showAll ? newestFirst : newestFirst.slice(0, VISIBLE_PURCHASES)

  async function saveManualPurchase() {
    setManualSaving(true)
    setManualError('')
    try {
      const items = manualItems.filter((item) => item.name.trim()).map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity),
        unit: item.unit,
        price: Number(item.price),
        category: item.category,
        subcategory: item.subcategory || null,
      }))
      if (items.length === 0) throw new Error('Přidejte alespoň jednu položku.')
      if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.price) || item.price < 0)) {
        throw new Error('Zkontrolujte množství a cenu položek.')
      }
      if (!onCreateManualPurchase) throw new Error('Ruční zadání nákupu není dostupné.')
      await onCreateManualPurchase({
        date: manualDate,
        storeChain: manualStore || null,
        discount: manualDiscount === '' ? null : Number(manualDiscount),
        items,
      })
      setManualOpen(false)
      setManualItems([{ name: '', quantity: '1', unit: 'ks', price: '', category: 'Potraviny', subcategory: '' }])
      setManualDiscount('')
      setManualStore('')
      setManualDate(today ?? '')
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Nákup se nepodařilo uložit.')
    } finally {
      setManualSaving(false)
    }
  }

  const topStore = favoriteStores(records)[0]
  const topProduct = mostBoughtProducts(records, 1)[0]
  const repeats = repeatPurchases(records)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Historie nákupů</p>
          <p className="mt-1 text-sm text-fg-secondary">Dlouhodobé statistiky z uskutečněných nákupů domácnosti.</p>
        </div>
        <Button variant="secondary" size="lg" onClick={() => { setManualError(''); setManualOpen(true) }}>
          <Plus aria-hidden="true" /> Zadat nákup ručně
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Běžná měsíční útrata" value={money(averageMonthlySpend(records))} icon={<TrendingUp />} />
        <Stat label="Oblíbený obchod" value={topStore ? `${topStore.store} (${topStore.count}×)` : '—'} icon={<Star />} />
        <Stat label="Nejčastěji kupované" value={topProduct ? `${topProduct.name} (${topProduct.count}×)` : '—'} icon={<ShoppingBag />} />
      </div>
      {repeats.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Repeat className="h-3.5 w-3.5" /> Opakované nákupy
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {repeats.map((entry) => (
              <span key={entry.name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {entry.name} · {entry.count}×
              </span>
            ))}
          </div>
        </div>
      )}
      {records.length === 0 && (
        <EmptyState
          icon={<ShoppingBag />}
          title="Zatím tu není žádný nákup"
          description="Nákupy se zapíšou, když dokončíte nákup ze seznamu nebo nahrajete účtenku."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {onUploadReceipt && (
                <Button size="lg" onClick={onUploadReceipt}>
                  Nahrát účtenku
                </Button>
              )}
              <Button variant="outline" size="lg" onClick={() => { setManualError(''); setManualOpen(true) }}>
                Zadat ručně
              </Button>
            </div>
          }
        />
      )}
      <div className={records.length === 0 ? 'hidden' : 'overflow-hidden surface'}>
        {shownRecords.map((record) => (
            <div key={record.id} className="border-b border-border last:border-0">
              <button
                type="button"
                aria-expanded={expandedId === record.id}
                onClick={() => setExpandedId((current) => (current === record.id ? null : record.id))}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {record.store ?? 'Neurčený obchod'} <span className="font-normal text-muted-foreground">· {shortDate(record.date)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{itemCountLabel(record.items.length)} {record.discount ? `· sleva ${record.discount} Kč` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">{money(record.total)}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${expandedId === record.id ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {/* Shown on the collapsed row, not only once expanded, so a receipt that never reached the
                  budget is noticed without opening it. */}
              {record.needsBudgetRecording && !recorded[record.id] && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4">
                  <p className="text-xs text-muted-foreground">Tento nákup zatím není v rozpočtu.</p>
                  <Button variant="secondary" onClick={() => recordExpenses(record.id)} disabled={recording === record.id}>
                    {recording === record.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PiggyBank aria-hidden="true" />}
                    Zařadit do výdajů
                  </Button>
                </div>
              )}
              {recordError[record.id] && (
                <p role="alert" className="px-5 pb-4 text-xs text-destructive">
                  {recordError[record.id]}
                </p>
              )}
              {expandedId === record.id && (
                <div className="space-y-1.5 border-t border-border bg-muted/40 px-5 py-4">
                  {record.items.map((item) => {
                    // Only a real, categorized database row can be reassigned — a purchase made
                    // before that column existed (`category` unknown) has nothing to base it on.
                    const canSplit = item.id != null && item.category != null
                    const splits = splitsOf(item)
                    return (
                      <div key={item.id ?? item.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                        <span className="min-w-0 flex-1">
                          {item.name} · {item.quantity} {item.unit}
                          {splits.length > 1 && <span className="ml-1.5 text-muted-foreground">· rozděleno na {splits.length} částí</span>}
                          {splits.length === 1 && <span className="ml-1.5 text-muted-foreground">· {splits[0].category}{splits[0].subcategory ? ` ▸ ${splits[0].subcategory}` : ''}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-medium">{money(item.price * item.quantity)}</span>
                          {canSplit && (
                            <button
                              onClick={() => setEditingItem({ ...item, expenseSplits: splits } as PurchaseItem & { id: string; category: NonNullable<PurchaseItem['category']> })}
                              aria-label={`Upravit kategorii výdaje pro ${item.name}`}
                              className="icon-button"
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
      </div>
      {records.length > VISIBLE_PURCHASES && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="flex min-h-11 items-center gap-1 rounded-full bg-muted px-4 text-sm font-medium transition hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll ? 'Zobrazit méně' : `Zobrazit všechny nákupy (${records.length})`}
          <ChevronDown className={`h-4 w-4 transition ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
      <Sheet
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Zadat nákup ručně"
        description="Po uložení se nákup započítá do rozpočtu a doplní zásoby."
        className="sm:max-w-2xl"
        footer={
          <>
            {manualError && (
              <p role="alert" className="text-sm text-destructive">
                {manualError}
              </p>
            )}
            <Button size="lg" className="w-full" onClick={saveManualPurchase} disabled={manualSaving}>
              {manualSaving ? 'Ukládám…' : 'Uložit nákup'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Datum">{(p) => <Input {...p} type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="px-3" />}</Field>
          <Field label="Obchod">
            {(p) => (
              <Select {...p} value={manualStore} onChange={(e) => setManualStore(e.target.value)} className="px-3">
                <option value="">Neurčený obchod</option>
                {(storeChains ?? []).filter((store) => !store.isOnline).map((store) => <option key={store.id} value={store.chain}>{store.chain}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Sleva celkem">{(p) => <Input {...p} type="number" min="0" step="0.01" value={manualDiscount} onChange={(e) => setManualDiscount(e.target.value)} placeholder="0" className="px-3" />}</Field>
        </div>
        <div className="mt-5 space-y-2">
          {manualItems.map((item, index) => (
            <div key={index} className="grid grid-cols-3 gap-2 rounded-2xl border border-border p-3 sm:grid-cols-[1fr_90px_90px_110px]">
              <Input aria-label={`Produkt položky ${index + 1}`} value={item.name} onChange={(e) => setManualItems((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="Produkt" className="col-span-3 px-3 sm:col-span-1" />
              <Input aria-label={`Množství položky ${index + 1}`} type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => setManualItems((rows) => rows.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} placeholder="Množství" className="px-3" />
              <Select aria-label={`Jednotka položky ${index + 1}`} value={item.unit} onChange={(e) => setManualItems((rows) => rows.map((row, i) => i === index ? { ...row, unit: e.target.value as ItemUnit } : row))} className="px-3">
                {(['ks','kg','g','l','ml'] as ItemUnit[]).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </Select>
              <Input aria-label={`Cena za kus položky ${index + 1}`} type="number" min="0" step="0.01" value={item.price} onChange={(e) => setManualItems((rows) => rows.map((row, i) => i === index ? { ...row, price: e.target.value } : row))} placeholder="Kč/ks" className="px-3" />
              <div className="col-span-3 grid min-w-0 grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:col-span-4 sm:grid-cols-[1fr_1fr_auto]">
                <Select aria-label={'Kategorie položky ' + (index + 1)} value={item.category} onChange={(e) => setManualItems((rows) => rows.map((row, i) => i === index ? { ...row, category: e.target.value as ItemCategory, subcategory: '' } : row))} className="px-3">
                  {(['Potraviny','Drogerie','Děti','Domácnost','Ostatní'] as ItemCategory[]).map((category) => <option key={category} value={category}>{category}</option>)}
                </Select>
                <Select aria-label={'Podkategorie položky ' + (index + 1)} value={item.subcategory} onChange={(e) => setManualItems((rows) => rows.map((row, i) => i === index ? { ...row, subcategory: e.target.value } : row))} className="px-3">
                  <option value="">Bez podkategorie</option>
                  {subcategoriesOfItem(item.category).map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
                </Select>
                <button type="button" onClick={() => setManualItems((rows) => rows.filter((_, i) => i !== index))} disabled={manualItems.length === 1} className="icon-button justify-self-end min-[380px]:col-span-2 disabled:opacity-40 sm:col-span-1" aria-label={`Odebrat položku ${index + 1}`}><Trash2 className="size-4" aria-hidden="true" /></button>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="lg" onClick={() => setManualItems((rows) => [...rows, { name: '', quantity: '1', unit: 'ks', price: '', category: 'Potraviny', subcategory: '' }])}>
            <Plus aria-hidden="true" /> Přidat položku
          </Button>
        </div>
      </Sheet>

      {editingItem && (
        <PurchaseItemSplitDialog
          open={editingItem != null}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={async (splits) => {
            await onSaveSplits(editingItem.id, splits)
            setOverrides((current) => ({ ...current, [editingItem.id]: splits }))
          }}
        />
      )}
    </section>
  )
}
