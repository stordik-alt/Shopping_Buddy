import { useEffect, useRef, useState } from 'react'
import { ItemTypePicker } from '@/components/shopping/item-type-picker'
import { describeItemTypes, productTypeSuggestionNames } from '@/lib/product-types'
import { Check, ChevronDown, ListChecks, Plus, Search, SlidersHorizontal, Sun, Tag, X } from 'lucide-react'
import type { GpsCoords } from '@/lib/geo'
import type { Item, ItemCategory, ItemPriority, ItemUnit, Store, StoreChain } from '@/lib/types'
import { money } from '@/lib/format'
import { comparePrices, type ProductPrice } from '@/lib/prices'
import { searchProductsAction } from '@/app/actions/product-search'
import type { PlanResult, PinRecord } from '@/lib/db/shopping-plan'
import { hasStoreSelection, type StoreSelection } from '@/lib/nearby-stores'
import { ShoppingPlanPanel } from '@/components/shopping/shopping-plan'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Select } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PriceComparison } from '@/components/shopping/price-comparison'
import { ProductSearch } from '@/components/shopping/product-search'
import { StoreComparison } from '@/components/shopping/store-comparison'
import { GROUP_KEYS, readListView, saveListView, SORT_KEYS, type GroupKey, type SortKey } from '@/lib/list-view-preference'
import { safeLocalStorage } from '@/lib/safe-storage'
import { useWakeLock } from '@/lib/use-wake-lock'
import { formatDecimalInput, parseDecimalInput } from '@/lib/decimal-input'

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml']
const PRIORITIES: ItemPriority[] = ['Nízká', 'Normální', 'Vysoká']
const STORES: StoreChain[] = ['Lidl', 'Albert', 'Kaufland', 'Billa', 'Penny', 'JIP']
const PRIORITY_WEIGHT: Record<ItemPriority, number> = { Vysoká: 0, Normální: 1, Nízká: 2 }


const TYPE_SUGGESTIONS = productTypeSuggestionNames()

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
  today,
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
  pins,
  onPin,
  onUnpin,
  storeChains,
  storeSelection,
  buildPlan,
  remaining,
  stores,
  userCoords,
  completePurchase,
}: {
  /** The real date (`YYYY-MM-DD`), for which promotions are still running. */
  today: string
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
  /** Products the user pinned to items, per chain. */
  pins: PinRecord[]
  onPin: (itemId: string, storeId: string, productId: string) => Promise<void>
  onUnpin: (itemId: string, storeId: string) => Promise<void>
  storeChains: { id: string; chain: string }[]
  storeSelection: StoreSelection
  buildPlan: (input: { maxStores: number; priorityChainIds: string[] }) => Promise<PlanResult>
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
  const wakeLock = useWakeLock()

  // Filters, sort and grouping are remembered on this device (lib/list-view-preference.ts). They are
  // read after hydration (the server has no storage), and only saved once read, so the defaults of
  // the first render never overwrite what the user chose last time. The save effect is declared
  // first on purpose: effects run in order, so on the first commit it still sees "not loaded".
  const viewLoaded = useRef(false)
  useEffect(() => {
    if (viewLoaded.current) saveListView(safeLocalStorage(), { category, showCompleted, sort, group })
  }, [category, showCompleted, sort, group])
  useEffect(() => {
    const view = readListView(safeLocalStorage(), CATEGORIES)
    setCategory(view.category)
    setShowCompleted(view.showCompleted)
    setSort(view.sort)
    setGroup(view.group)
    viewLoaded.current = true
  }, [])

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
          <p className="text-sm text-fg-muted">Sdílené seznamy</p>
          <h2 className="mt-0.5 break-words text-2xl font-semibold tracking-tight">{activeList}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            {remainingCount} k nákupu · {completedCount} hotovo
          </Badge>
          {wakeLock.supported && (
            <button
              type="button"
              onClick={wakeLock.toggle}
              aria-pressed={wakeLock.active}
              className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${wakeLock.active ? 'bg-accent-subtle text-accent-text' : 'border border-border bg-card text-fg-secondary hover:bg-muted'}`}
            >
              <Sun className="size-4" aria-hidden="true" /> {wakeLock.active ? 'Displej nezhasne' : 'Nechat displej svítit'}
            </button>
          )}
        </div>
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
            className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-fg-muted"
          />
          {/* Native autocomplete against the real catalog (docs/07_CHANGELOG.md, "product
              normalization phase 1") — picking a suggestion means addShoppingItemAction's
              case/whitespace match resolves to a real productId on the first try, not just when
              luckily typed exactly right. Still plain free text otherwise: no picker is enforced. */}
          <datalist id="product-catalog-suggestions">
            {/* Product types and groups first ("Kuřecí maso", "Máslo"): picking one gives the planner
                an exact kind of goods to look for (docs/12_PRODUCT_TYPES.md, phase 3). */}
            {TYPE_SUGGESTIONS.map((name) => (
              <option key={`type:${name}`} value={name} />
            ))}
            {productPrices.map((product) => (
              <option key={product.productName} value={product.productName} />
            ))}
          </datalist>
          <Button size="lg" onClick={addItem}>
            <Plus aria-hidden="true" /> Přidat
          </Button>
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
          className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-accent-text hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4" aria-hidden="true" /> {searchOpen ? 'Skrýt hledání produktů' : 'Hledat produkty v obchodech'}
        </button>
        {searchOpen && (
          <div className="mt-2">
            <ProductSearch search={searchProductsAction} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl label="Nákupní seznamy" value={activeList} onChange={setActiveList} options={lists.map((list) => ({ value: list, label: list }))} />
        <button
          type="button"
          onClick={() => setListDialog(true)}
          className="min-h-10 rounded-full border border-dashed border-input px-4 text-sm text-fg-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Přidat seznam"
        >
          + Nový seznam
        </button>
      </div>
      {listDialog && (
        <div className="surface flex flex-wrap gap-2 p-3">
          <Input
            autoFocus
            aria-label="Název nového seznamu"
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && createList()}
            placeholder="Např. Vánoce"
            className="min-w-0 flex-1 basis-40"
          />
          <Button size="lg" onClick={createList}>
            Vytvořit
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setListDialog(false)}>
            Zrušit
          </Button>
        </div>
      )}

      <div>
        <button
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="shopping-filters"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-fg-secondary transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtry a řazení
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-solid px-1.5 text-xs font-semibold text-accent-solid-foreground">
              {activeFilterCount}
              <span className="sr-only"> aktivní</span>
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {filtersOpen && (
          <div id="shopping-filters" className="surface mt-3 space-y-4 p-4">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm text-fg-muted focus-within:ring-2 focus-within:ring-ring/40">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                aria-label="Filtrovat seznam"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrovat položky"
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none sm:text-sm"
              />
            </label>
            <SegmentedControl label="Kategorie nákupu" value={category} onChange={setCategory} options={['Vše', ...CATEGORIES].map((option) => ({ value: option, label: option }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Řadit</span>
                <Select aria-label="Řadit položky" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                  {SORT_KEYS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                <span>Seskupit</span>
                <Select aria-label="Seskupit položky" value={group} onChange={(event) => setGroup(event.target.value as GroupKey)}>
                  {GROUP_KEYS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="lg" onClick={() => setShowCompleted((current) => !current)} aria-pressed={!showCompleted}>
                {showCompleted ? 'Skrýt hotové' : 'Zobrazit hotové'}
              </Button>
              {items.some((item) => item.done) && (
                <Button variant="outline" size="lg" onClick={() => items.filter((item) => item.done).forEach((item) => removeItem(item.id))}>
                  Vymazat hotové
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ListChecks />} title="Seznam je prázdný" description="Přidejte první položku do pole nahoře." />
      ) : (
        <div className="space-y-4">
          {groupedItems.map(({ label, items: groupItemsList }) => (
            <div key={label ?? 'all'} className="overflow-hidden surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-accent-text" aria-hidden="true" />
                  <span className="text-sm font-semibold">{label ?? `${filteredItems.filter((i) => !i.done).length} zbývá`}</span>
                </div>
                <span className="text-sm text-fg-muted">
                  Odhad {money(groupItemsList.reduce((sum, i) => sum + i.price * i.quantity, 0))}
                </span>
              </div>
              {groupItemsList.map((item) => (
                <div key={item.id} className="border-b border-border last:border-0">
                  <div className="flex min-w-0 items-center gap-1.5 py-2 pr-2 pl-1 sm:gap-2 sm:pr-4 sm:pl-3">
                    {/* The most used control in the shop: a 44 px target around a 28 px circle. */}
                    <button
                      type="button"
                      aria-label={item.done ? `${item.name}: označit jako nedokončené` : `${item.name}: označit jako zakoupené`}
                      aria-pressed={item.done}
                      onClick={() => toggle(item.id)}
                      className="group flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={`flex size-7 items-center justify-center rounded-full border-2 transition ${item.done ? 'border-accent-solid bg-accent-solid text-accent-solid-foreground' : 'border-input group-hover:border-accent-solid'}`}>
                        {item.done && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                      </span>
                    </button>
                    <button type="button" onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))} className="min-h-11 min-w-0 flex-1 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
                      <span className={`block break-words font-medium ${item.done ? 'text-fg-muted line-through' : ''}`}>{item.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                        <span>
                          {item.category} · {item.store || 'Bez obchodu'}
                        </span>
                        {(() => {
                          const typeLabel = describeItemTypes(item.name, item.productTypes).label
                          return typeLabel ? <Badge className="py-0.5">{typeLabel}</Badge> : null
                        })()}
                        {item.onSale && (
                          <Badge tone="accent" className="py-0.5">
                            <Tag className="size-3" aria-hidden="true" /> Akce
                          </Badge>
                        )}
                        {item.priority === 'Vysoká' && (
                          <Badge tone="danger" className="py-0.5">
                            Priorita
                          </Badge>
                        )}
                      </span>
                    </button>
                    <span className="shrink-0 text-sm font-semibold">{money(item.price * item.quantity)}</span>
                    <button
                      type="button"
                      aria-label={`Detail položky ${item.name}`}
                      aria-expanded={expandedId === item.id}
                      onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                      className="icon-button shrink-0"
                    >
                      <ChevronDown className={`size-4 transition ${expandedId === item.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Odstranit ${item.name}`}
                      onClick={() => removeItem(item.id)}
                      className="icon-button hidden shrink-0 hover:!bg-destructive-subtle hover:!text-destructive sm:inline-flex"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  {expandedId === item.id && (
                    <div className="grid gap-3 border-t border-border bg-muted/40 px-5 py-4 sm:grid-cols-2">
                      <label className="text-sm font-medium">
                        Množství
                        <DecimalField
                          ariaLabel={`Množství ${item.name}`}
                          value={item.quantity}
                          isValid={(value) => value > 0}
                          onValue={(quantity) => updateItem(item.id, { quantity })}
                        />
                      </label>
                      <label className="text-sm font-medium">
                        Jednotka
                        <select
                          aria-label={`Jednotka ${item.name}`}
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, { unit: e.target.value as ItemUnit })}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          {UNITS.map((unit) => (
                            <option key={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-medium">
                        Odhadovaná cena
                        <DecimalField
                          ariaLabel={`Cena ${item.name}`}
                          value={item.price}
                          maxDecimals={2}
                          isValid={(value) => value >= 0}
                          onValue={(price) => updateItem(item.id, { price })}
                        />
                      </label>
                      <label className="text-sm font-medium">
                        Kategorie
                        <select
                          aria-label={`Kategorie ${item.name}`}
                          value={item.category}
                          onChange={(e) => updateItem(item.id, { category: e.target.value as ItemCategory })}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat}>{cat}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-medium">
                        Preferovaný obchod
                        <select
                          aria-label={`Obchod ${item.name}`}
                          value={item.store || ''}
                          onChange={(e) => updateItem(item.id, { store: e.target.value || undefined })}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          <option value="">Bez preference</option>
                          {STORES.map((store) => (
                            <option key={store}>{store}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-medium">
                        Priorita
                        <select
                          aria-label={`Priorita ${item.name}`}
                          value={item.priority}
                          onChange={(e) => updateItem(item.id, { priority: e.target.value as ItemPriority })}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                        >
                          {PRIORITIES.map((priority) => (
                            <option key={priority}>{priority}</option>
                          ))}
                        </select>
                      </label>
                      <div className="sm:col-span-2">
                        <ItemTypePicker name={item.name} productTypes={item.productTypes} onChange={(productTypes) => updateItem(item.id, { productTypes })} />
                      </div>
                      <label className="text-sm font-medium sm:col-span-2">
                        Poznámka
                        <input
                          aria-label={`Poznámka ${item.name}`}
                          value={item.note || ''}
                          onChange={(e) => updateItem(item.id, { note: e.target.value })}
                          placeholder="Např. vzít bez laktózy"
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                        />
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={item.onSale || false}
                          onChange={(e) => updateItem(item.id, { onSale: e.target.checked })}
                          className="size-5 accent-[var(--accent-solid)]"
                        />
                        Aktuálně v akci
                      </label>
                      <button
                        onClick={() => removeItem(item.id)}
                        type="button"
                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-destructive hover:bg-destructive-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                      >
                        <X className="size-4" aria-hidden="true" /> Odstranit z nákupu
                      </button>
                      <button
                        type="button"
                        aria-expanded={searchItemId === item.id}
                        onClick={() => {
                          setSearchItemId((current) => (current === item.id ? null : item.id))
                          setSearchOpen(false)
                        }}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Search className="size-4" aria-hidden="true" /> Najít v obchodech
                      </button>
                      {searchItemId === item.id && (
                        <div className="sm:col-span-2">
                          <ProductSearch
                            initialQuery={item.name}
                            category={item.category !== 'Ostatní' ? item.category : undefined}
                            pinning={{
                              pinned: Object.fromEntries(pins.filter((pin) => pin.itemId === item.id).map((pin) => [pin.storeId, pin.productId])),
                              onPin: (storeId, productId) => onPin(item.id, storeId, productId),
                              onUnpin: (storeId) => onUnpin(item.id, storeId),
                            }}
                            search={searchProductsAction}
                          />
                        </div>
                      )}
                      {comparePrices(productPrices, item.name) && (
                        <div className="sm:col-span-2">
                          <PriceComparison productName={item.name} productPrices={productPrices} today={today} />
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
          {/* The trip's one primary action: the turquoise CTA (navy text, 7.5:1). */}
          <Button variant="accent" className="min-h-12 w-full rounded-2xl text-base shadow-elevated" onClick={completePurchase}>
            <Check aria-hidden="true" /> Dokončit nákup ({completedCount})
          </Button>
        </div>
      )}

      <ShoppingPlanPanel
        chains={hasStoreSelection(storeSelection) ? storeChains.filter((chain) => storeSelection.chainIds.includes(chain.id)) : storeChains}
        defaultMaxStores={storeSelection.maxShopStores}
        defaultPriorityIds={storeSelection.priorityChainIds}
        openItemCount={items.filter((item) => !item.done).length}
        // Changes whenever an open item or a pinned product does, so a plan built earlier can be flagged as out of date.
        inputKey={JSON.stringify([
          items.filter((item) => !item.done).map((item) => [item.id, item.name, item.quantity, item.unit, item.category]),
          [...pins].map((pin) => [pin.itemId, pin.storeId, pin.productId]).sort(),
        ])}
        build={buildPlan}
      />

      <StoreComparison items={items} productPrices={productPrices} remaining={remaining} stores={stores} userCoords={userCoords} />
    </div>
  )
}

/** A number field that lets the user type freely — clear it, type "0,5" — and saves each value that
 *  is a valid number (lib/decimal-input.ts). On leaving the field an unfinished or invalid text goes
 *  back to the last saved value. A text field with a decimal keypad rather than type="number", which
 *  on Czech phones may refuse the decimal comma. */
function DecimalField({
  ariaLabel,
  value,
  onValue,
  isValid,
  maxDecimals = 3,
}: {
  ariaLabel: string
  value: number
  onValue: (value: number) => void
  isValid: (value: number) => boolean
  maxDecimals?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function change(text: string) {
    setDraft(text)
    const parsed = parseDecimalInput(text, maxDecimals)
    if (parsed !== null && isValid(parsed) && parsed !== value) onValue(parsed)
  }

  return (
    <input
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      value={draft ?? formatDecimalInput(value)}
      onChange={(e) => change(e.target.value)}
      onBlur={() => setDraft(null)}
      className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
    />
  )
}
