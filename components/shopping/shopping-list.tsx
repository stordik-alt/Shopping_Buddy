import { useState } from 'react'
import { Check, ChevronDown, ListChecks, Plus, Search, Tag, X } from 'lucide-react'
import type { GpsCoords } from '@/lib/geo'
import type { Item, ItemCategory, ItemPriority, ItemUnit, Store, StoreChain } from '@/lib/types'
import { money } from '@/lib/format'
import { comparePrices, type ProductPrice } from '@/lib/prices'
import { PriceComparison } from '@/components/shopping/price-comparison'
import { StoreComparison } from '@/components/shopping/store-comparison'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml']
const PRIORITIES: ItemPriority[] = ['Nízká', 'Normální', 'Vysoká']
const STORES: StoreChain[] = ['Lidl', 'Albert', 'Kaufland', 'Billa', 'Penny', 'JIP']
const PRIORITY_WEIGHT: Record<ItemPriority, number> = { Vysoká: 0, Normální: 1, Nízká: 2 }

type SortKey = 'Výchozí' | 'Název' | 'Cena' | 'Priorita'
type GroupKey = 'Bez seskupení' | 'Podle kategorie' | 'Podle obchodu'

function sortItems(items: Item[], sort: SortKey) {
  const sorted = [...items]
  if (sort === 'Název') sorted.sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  if (sort === 'Cena') sorted.sort((a, b) => b.price * b.quantity - a.price * a.quantity)
  if (sort === 'Priorita') sorted.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority])
  return sorted
}

function groupItems(items: Item[], group: GroupKey) {
  if (group === 'Bez seskupení') return [{ label: null as string | null, items }]
  const key = group === 'Podle kategorie' ? 'category' : 'store'
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    const label = (group === 'Podle kategorie' ? item.category : item.store) || 'Bez obchodu'
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return Array.from(groups.entries()).map(([label, groupedItems]) => ({ label, items: groupedItems }))
}

export function ShoppingList({
  items,
  newItem,
  setNewItem,
  addItem,
  updateItem,
  removeItem,
  toggle,
  lists,
  onAddList,
  productPrices,
  remaining,
  stores,
  userCoords,
  completePurchase,
}: {
  items: Item[]
  newItem: string
  setNewItem: (v: string) => void
  addItem: () => void
  updateItem: (id: string, changes: Partial<Item>) => void
  removeItem: (id: string) => void
  toggle: (id: string) => void
  lists: string[]
  onAddList: (name: string) => void
  productPrices: ProductPrice[]
  remaining: number
  stores: Store[]
  userCoords: GpsCoords | null
  completePurchase: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Vše')
  const [showCompleted, setShowCompleted] = useState(true)
  const [activeList, setActiveList] = useState(lists[0])
  const [listDialog, setListDialog] = useState(false)
  const [listName, setListName] = useState('')
  const [sort, setSort] = useState<SortKey>('Výchozí')
  const [group, setGroup] = useState<GroupKey>('Bez seskupení')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'Vše' || item.category === category) &&
      (showCompleted || !item.done),
  )
  const visibleItems = sortItems(filteredItems, sort)
  const groupedItems = groupItems(visibleItems, group)
  const completedCount = items.filter((item) => item.done).length

  function createList() {
    const name = listName.trim()
    if (!name || lists.includes(name)) return
    onAddList(name)
    setActiveList(name)
    setListName('')
    setListDialog(false)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap gap-2" aria-label="Kategorie nákupu">
        {['Vše', ...CATEGORIES].map((option) => (
          <button
            key={option}
            onClick={() => setCategory(option)}
            aria-pressed={category === option}
            className={`min-h-10 rounded-full px-3 py-2 text-xs font-medium ${category === option ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'}`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Sdílené seznamy</p>
          <h2 className="mt-1 text-2xl font-semibold">{activeList}</h2>
        </div>
        <span className="min-h-10 rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          {items.length} položek · {completedCount} hotovo
        </span>
      </div>
      <StoreComparison items={items} productPrices={productPrices} remaining={remaining} stores={stores} userCoords={userCoords} />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Nákupní seznamy">
        {lists.map((list) => (
          <button
            key={list}
            role="tab"
            aria-selected={activeList === list}
            onClick={() => setActiveList(list)}
            className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition ${activeList === list ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-muted'}`}
          >
            {list}
          </button>
        ))}
        <button
          onClick={() => setListDialog(true)}
          className="min-h-10 rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          aria-label="Přidat seznam"
        >
          + Nový seznam
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowCompleted((current) => !current)}
          className="min-h-10 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-pressed={!showCompleted}
        >
          {showCompleted ? 'Skrýt hotové' : 'Zobrazit hotové'}
        </button>
        {items.some((item) => item.done) && (
          <button
            onClick={() => items.filter((item) => item.done).forEach((item) => removeItem(item.id))}
            className="min-h-10 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Vymazat hotové
          </button>
        )}
        {items.some((item) => item.done) && (
          <button
            onClick={completePurchase}
            className="min-h-10 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Dokončit nákup
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Řadit
          <select
            aria-label="Řadit položky"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="min-h-10 rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(['Výchozí', 'Název', 'Cena', 'Priorita'] as SortKey[]).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Seskupit
          <select
            aria-label="Seskupit položky"
            value={group}
            onChange={(event) => setGroup(event.target.value as GroupKey)}
            className="min-h-10 rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(['Bez seskupení', 'Podle kategorie', 'Podle obchodu'] as GroupKey[]).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>
      {listDialog && (
        <div className="flex gap-2 rounded-2xl border border-primary/30 bg-card p-3">
          <input
            autoFocus
            aria-label="Název nového seznamu"
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && createList()}
            placeholder="Např. Vánoce"
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          />
          <button onClick={createList} className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Vytvořit
          </button>
          <button onClick={() => setListDialog(false)} className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            Zrušit
          </button>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card p-2">
        <div className="flex gap-2">
          <input
            aria-label="Nová položka"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addItem()
            }}
            placeholder="Co potřebujete koupit?"
            list="product-catalog-suggestions"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          {/* Native autocomplete against the real catalog (docs/07_CHANGELOG.md, "product
              normalization phase 1") — picking a suggestion means addShoppingItemAction's
              case/whitespace match resolves to a real productId on the first try, not just when
              luckily typed exactly right. Still plain free text otherwise: no picker is enforced. */}
          <datalist id="product-catalog-suggestions">
            {productPrices.map((product) => (
              <option key={product.productName} value={product.productName} />
            ))}
          </datalist>
          <button onClick={addItem} className="flex min-h-10 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-4 w-4" /> Přidat
          </button>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Search className="h-4 w-4" />
        <span className="sr-only">Filtrovat seznam</span>
        <input
          aria-label="Filtrovat seznam"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrovat položky"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
        />
      </label>
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">Seznam je prázdný</p>
          <p className="mt-1 text-sm text-muted-foreground">Přidejte první položku pomocí formuláře výše.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedItems.map(({ label, items: groupItemsList }) => (
            <div key={label ?? 'all'} className="overflow-hidden rounded-3xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{label ?? `${filteredItems.filter((i) => !i.done).length} zbývá`}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Odhad {money(groupItemsList.reduce((sum, i) => sum + i.price * i.quantity, 0))}
                </span>
              </div>
              {groupItemsList.map((item) => (
                <div key={item.id} className="border-b border-border last:border-0">
                  <div className="flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5">
                    <button
                      aria-label={item.done ? 'Označit jako nedokončené' : 'Označit jako zakoupené'}
                      onClick={() => toggle(item.id)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}
                    >
                      {item.done && <Check className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2">
                        <span className={`min-w-0 break-words font-medium ${item.done ? 'text-muted-foreground line-through' : ''}`}>{item.name}</span>
                        {item.onSale && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <Tag className="h-2.5 w-2.5" /> Akce
                          </span>
                        )}
                        {item.priority === 'Vysoká' && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">Priorita</span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.category} · {item.store || 'Bez obchodu'}
                      </span>
                    </button>
                    <span className="shrink-0 text-sm font-semibold text-primary">{money(item.price * item.quantity)}</span>
                    <button
                      aria-label="Zobrazit detail položky"
                      onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronDown className={`h-4 w-4 transition ${expandedId === item.id ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      aria-label={`Odstranit ${item.name}`}
                      onClick={() => removeItem(item.id)}
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {expandedId === item.id && (
                    <div className="grid gap-3 border-t border-border bg-muted/40 px-5 py-4 sm:grid-cols-2">
                      <label className="text-xs text-muted-foreground">
                        Množství
                        <input
                          aria-label={`Množství ${item.name}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="text-xs text-muted-foreground">
                        Jednotka
                        <select
                          aria-label={`Jednotka ${item.name}`}
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, { unit: e.target.value as ItemUnit })}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                        >
                          {UNITS.map((unit) => (
                            <option key={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">
                        Odhadovaná cena
                        <input
                          aria-label={`Cena ${item.name}`}
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.price}
                          onChange={(e) => updateItem(item.id, { price: Math.max(0, Number(e.target.value) || 0) })}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="text-xs text-muted-foreground">
                        Kategorie
                        <select
                          aria-label={`Kategorie ${item.name}`}
                          value={item.category}
                          onChange={(e) => updateItem(item.id, { category: e.target.value as ItemCategory })}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat}>{cat}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">
                        Preferovaný obchod
                        <select
                          aria-label={`Obchod ${item.name}`}
                          value={item.store || ''}
                          onChange={(e) => updateItem(item.id, { store: e.target.value || undefined })}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                        >
                          <option value="">Bez preference</option>
                          {STORES.map((store) => (
                            <option key={store}>{store}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">
                        Priorita
                        <select
                          aria-label={`Priorita ${item.name}`}
                          value={item.priority}
                          onChange={(e) => updateItem(item.id, { priority: e.target.value as ItemPriority })}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                        >
                          {PRIORITIES.map((priority) => (
                            <option key={priority}>{priority}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground sm:col-span-2">
                        Poznámka
                        <input
                          aria-label={`Poznámka ${item.name}`}
                          value={item.note || ''}
                          onChange={(e) => updateItem(item.id, { note: e.target.value })}
                          placeholder="Např. vzít bez laktózy"
                          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={item.onSale || false}
                          onChange={(e) => updateItem(item.id, { onSale: e.target.checked })}
                          className="size-4 accent-primary"
                        />
                        Aktuálně v akci
                      </label>
                      {comparePrices(productPrices, item.name) && (
                        <div className="sm:col-span-2">
                          <PriceComparison productName={item.name} productPrices={productPrices} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
