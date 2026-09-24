import { useState } from 'react'
import { Check, ChevronDown, ListChecks, Plus, Search, SlidersHorizontal, Tag, X } from 'lucide-react'
import type { GpsCoords } from '@/lib/geo'
import type { Item, ItemCategory, ItemPriority, ItemUnit, Store, StoreChain } from '@/lib/types'
import { money } from '@/lib/format'
import { comparePrices, type ProductPrice } from '@/lib/prices'
import { searchProductsAction } from '@/app/actions/product-search'
import { PriceComparison } from '@/components/shopping/price-comparison'
import { ProductSearch } from '@/components/shopping/product-search'
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Product search: one panel above the list (any product), or one under a single item (prefilled
  // with its name). Never both at once, so the screen does not fill up with search panels.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchItemId, setSearchItemId] = useState<string | null>(null)

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

  const activeFilterCount =
    (category !== 'Vše' ? 1 : 0) + (query.trim() ? 1 : 0) + (showCompleted ? 0 : 1) + (sort !== 'Výchozí' ? 1 : 0) + (group !== 'Bez seskupení' ? 1 : 0)
  const remainingCount = items.length - completedCount

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Sdílené seznamy</p>
          <h2 className="mt-0.5 break-words text-2xl font-semibold tracking-tight">{activeList}</h2>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
          {remainingCount} k nákupu · {completedCount} hotovo
        </span>
      </div>

      {/* Adding an item is the most frequent action, so it comes first — before filters and comparisons. */}
      <div className="surface p-2">
        <div className="flex gap-2">
          <input
            aria-label="Nová položka"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addItem()
            }}
            placeholder="Co koupit?"
            list="product-catalog-suggestions"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
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
          <button onClick={addItem} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-4 w-4" aria-hidden="true" /> Přidat
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          aria-expanded={searchOpen}
          onClick={() => {
            setSearchOpen((open) => !open)
            setSearchItemId(null)
          }}
          className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4" aria-hidden="true" /> {searchOpen ? 'Skrýt hledání produktů' : 'Hledat produkty v obchodech'}
        </button>
        {searchOpen && (
          <div className="mt-2">
            <ProductSearch search={searchProductsAction} />
          </div>
        )}
      </div>

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
          className="min-h-10 rounded-full border border-dashed border-input px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          aria-label="Přidat seznam"
        >
          + Nový seznam
        </button>
      </div>
      {listDialog && (
        <div className="surface flex flex-wrap gap-2 p-3">
          <input
            autoFocus
            aria-label="Název nového seznamu"
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && createList()}
            placeholder="Např. Vánoce"
            className="min-h-10 min-w-0 flex-1 basis-40 bg-transparent px-2 text-sm outline-none"
          />
          <button onClick={createList} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
            Vytvořit
          </button>
          <button onClick={() => setListDialog(false)} className="min-h-10 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted">
            Zrušit
          </button>
        </div>
      )}

      <div>
        <button
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="shopping-filters"
          className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filtry a řazení
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{activeFilterCount}</span>
          )}
          <ChevronDown className={`h-4 w-4 transition ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {filtersOpen && (
          <div id="shopping-filters" className="surface mt-3 space-y-4 p-4">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm text-muted-foreground">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                aria-label="Filtrovat seznam"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrovat položky"
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none sm:text-sm"
              />
            </label>
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
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
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
            </div>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">Seznam je prázdný</p>
          <p className="mt-1 text-sm text-muted-foreground">Přidejte první položku do pole nahoře.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedItems.map(({ label, items: groupItemsList }) => (
            <div key={label ?? 'all'} className="overflow-hidden surface">
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
                  <div className="flex min-w-0 items-center gap-2.5 px-3 py-3.5 sm:gap-3 sm:px-5 sm:py-4">
                    <button
                      aria-label={item.done ? 'Označit jako nedokončené' : 'Označit jako zakoupené'}
                      onClick={() => toggle(item.id)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}
                    >
                      {item.done && <Check className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))} className="min-w-0 flex-1 text-left">
                      <span className={`block break-words font-medium ${item.done ? 'text-muted-foreground line-through' : ''}`}>{item.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {item.category} · {item.store || 'Bez obchodu'}
                        </span>
                        {item.onSale && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <Tag className="h-2.5 w-2.5" aria-hidden="true" /> Akce
                          </span>
                        )}
                        {item.priority === 'Vysoká' && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">Priorita</span>
                        )}
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
                      className="hidden size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
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
                      <button
                        onClick={() => removeItem(item.id)}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                      >
                        <X className="h-4 w-4" aria-hidden="true" /> Odstranit z nákupu
                      </button>
                      <button
                        type="button"
                        aria-expanded={searchItemId === item.id}
                        onClick={() => {
                          setSearchItemId((current) => (current === item.id ? null : item.id))
                          setSearchOpen(false)
                        }}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Search className="h-4 w-4" aria-hidden="true" /> Najít v obchodech
                      </button>
                      {searchItemId === item.id && (
                        <div className="sm:col-span-2">
                          <ProductSearch initialQuery={item.name} category={item.category} search={searchProductsAction} />
                        </div>
                      )}
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

      {completedCount > 0 && (
        // Sticks just above the mobile bottom navigation so finishing a trip is always one tap away.
        <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 lg:bottom-4">
          <button
            onClick={completePurchase}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Check className="h-4 w-4" aria-hidden="true" /> Dokončit nákup ({completedCount})
          </button>
        </div>
      )}

      <StoreComparison items={items} productPrices={productPrices} remaining={remaining} stores={stores} userCoords={userCoords} />
    </div>
  )
}
