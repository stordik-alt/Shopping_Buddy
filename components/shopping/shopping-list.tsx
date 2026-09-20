import { useState } from 'react'
import { Check, ListChecks, Plus, Search, X } from 'lucide-react'
import type { Item } from '@/lib/types'
import { money } from '@/lib/format'

const CATEGORIES = ['Vše', 'Potraviny', 'Drogerie', 'Děti']

const categoryFor = (name: string) =>
  /děti|pleny|dětské/i.test(name) ? 'Děti' : /papír|prací|droger|šampon/i.test(name) ? 'Drogerie' : 'Potraviny'

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
}: {
  items: Item[]
  newItem: string
  setNewItem: (v: string) => void
  addItem: () => void
  updateItem: (id: number, changes: Partial<Item>) => void
  removeItem: (id: number) => void
  toggle: (id: number) => void
  lists: string[]
  onAddList: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Vše')
  const [showCompleted, setShowCompleted] = useState(true)
  const [activeList, setActiveList] = useState(lists[0])
  const [listDialog, setListDialog] = useState(false)
  const [listName, setListName] = useState('')

  const visibleItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'Vše' || categoryFor(item.name) === category) &&
      (showCompleted || !item.done),
  )
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
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Kategorie nákupu">
        {CATEGORIES.map((option) => (
          <button
            key={option}
            onClick={() => setCategory(option)}
            aria-pressed={category === option}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${category === option ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground'}`}
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
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {items.length} položek · {completedCount} hotovo
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Nákupní seznamy">
        {lists.map((list) => (
          <button
            key={list}
            role="tab"
            aria-selected={activeList === list}
            onClick={() => setActiveList(list)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${activeList === list ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-muted'}`}
          >
            {list}
          </button>
        ))}
        <button
          onClick={() => setListDialog(true)}
          className="whitespace-nowrap rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          aria-label="Přidat seznam"
        >
          + Nový seznam
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowCompleted((current) => !current)}
          className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          aria-pressed={!showCompleted}
        >
          {showCompleted ? 'Skrýt hotové' : 'Zobrazit hotové'}
        </button>
        {items.some((item) => item.done) && (
          <button
            onClick={() => items.filter((item) => item.done).forEach((item) => removeItem(item.id))}
            className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Vymazat hotové
          </button>
        )}
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
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <button onClick={addItem} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Přidat
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
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
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{items.filter((i) => !i.done).length} zbývá</span>
            </div>
            <span className="text-xs text-muted-foreground">Odhad {money(items.reduce((sum, i) => sum + i.price * i.quantity, 0))}</span>
          </div>
          {visibleItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0">
              <button
                aria-label={item.done ? 'Označit jako nedokončené' : 'Označit jako zakoupené'}
                onClick={() => toggle(item.id)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${item.done ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}
              >
                {item.done && <Check className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${item.done ? 'text-muted-foreground line-through' : ''}`}>{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground">
                    Ks
                    <input
                      aria-label={`Množství ${item.name}`}
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className="ml-1 w-14 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Cena
                    <input
                      aria-label={`Cena ${item.name}`}
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.price}
                      onChange={(e) => updateItem(item.id, { price: Math.max(0, Number(e.target.value) || 0) })}
                      className="ml-1 w-20 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                    />
                  </label>
                  <span className="text-xs font-medium text-primary">{money(item.price * item.quantity)}</span>
                </div>
              </div>
              <button
                aria-label={`Odstranit ${item.name}`}
                onClick={() => removeItem(item.id)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
