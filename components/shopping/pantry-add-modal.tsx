import { useState } from 'react'
import { pantryPlaceOptions } from '@/lib/pantry'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import type { ItemCategory, ItemUnit, PantryPlace } from '@/lib/types'

export type PantryAddInput = {
  name: string
  quantity: number
  unit: ItemUnit
  category: ItemCategory
  subcategory: string | null
  placeKey: string
}

const CATEGORIES: ItemCategory[] = ['Potraviny', 'Drogerie', 'Děti', 'Domácnost', 'Ostatní']
const UNITS: ItemUnit[] = ['ks', 'kg', 'g', 'l', 'ml']

export function PantryAddModal({
  customPlaces,
  onClose,
  onSubmit,
}: {
  customPlaces: PantryPlace[]
  onClose: () => void
  onSubmit: (input: PantryAddInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState<ItemUnit>('ks')
  const [category, setCategory] = useState<ItemCategory>('Potraviny')
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [placeKey, setPlaceKey] = useState('Spíž')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = pantryPlaceOptions(customPlaces)
  const subcategories = subcategoriesOfItem(category)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    const parsedQuantity = Number(quantity)
    if (!trimmed) {
      setError('Zadejte název položky.')
      return
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Množství musí být větší než 0.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed, quantity: parsedQuantity, unit, category, subcategory, placeKey })
      onClose()
    } catch (err) {
      console.error('Adding pantry stock failed', err)
      setError(err instanceof Error ? err.message : 'Položku se nepodařilo přidat do zásob.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center'>
      <div role='dialog' aria-modal='true' aria-labelledby='pantry-add-title' className='max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-xl'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h2 id='pantry-add-title' className='text-base font-semibold'>Přidat do zásob</h2>
            <p className='mt-1 text-sm text-muted-foreground'>Dar, vlastní produkce nebo jiná položka zdarma. Do rozpočtu se nic nezapíše.</p>
          </div>
          <button type='button' onClick={onClose} className='rounded-xl p-2 text-muted-foreground hover:bg-muted' aria-label='Zavřít'>×</button>
        </div>

        <form onSubmit={submit} className='mt-5 space-y-4'>
          <label className='block text-sm font-medium'>
            Produkt
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder='Např. vejce nebo kuřecí maso' className='mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-ring' />
          </label>

          <div className='grid grid-cols-2 gap-3'>
            <label className='block text-sm font-medium'>
              Množství
              <input type='number' min='0' step='any' value={quantity} onChange={(event) => setQuantity(event.target.value)} className='mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-ring' />
            </label>
            <label className='block text-sm font-medium'>
              Jednotka
              <select value={unit} onChange={(event) => setUnit(event.target.value as ItemUnit)} className='mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal outline-none'>
                {UNITS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          <label className='block text-sm font-medium'>
            Kategorie
            <select value={category} onChange={(event) => {
              const nextCategory = event.target.value as ItemCategory
              setCategory(nextCategory)
              setSubcategory(null)
            }} className='mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal outline-none'>
              {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          {subcategories.length > 0 && (
            <label className='block text-sm font-medium'>
              Podkategorie
              <select value={subcategory ?? ''} onChange={(event) => setSubcategory(event.target.value || null)} className='mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal outline-none'>
                <option value=''>Nezařazeno</option>
                {subcategories.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          )}

          <label className='block text-sm font-medium'>
            Umístění
            <select value={placeKey} onChange={(event) => setPlaceKey(event.target.value)} className='mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 font-normal outline-none'>
              {options.map((option) => <option key={option.key} value={option.key}>{option.name}{option.custom ? ` (${option.area})` : ''}</option>)}
            </select>
          </label>

          {error && <p role='alert' className='rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>{error}</p>}

          <div className='flex justify-end gap-2 pt-1'>
            <button type='button' onClick={onClose} disabled={saving} className='min-h-10 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50'>Zrušit</button>
            <button type='submit' disabled={saving} className='min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50'>{saving ? 'Přidávám…' : 'Přidat do zásob'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
