import { useRef, useState } from 'react'
import { ProductAutocomplete, type ProductAutocompleteSelection } from '@/components/shared/product-autocomplete'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
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
  selection?: { kind: 'product'; productId: string } | { kind: 'type'; productTypeKey: string }
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
  const [selection, setSelection] = useState<ProductAutocompleteSelection | undefined>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

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
      const persistedSelection = selection?.kind === 'product' && selection.productId
        ? { kind: 'product' as const, productId: selection.productId }
        : selection?.kind === 'type' && selection.productTypeKey
          ? { kind: 'type' as const, productTypeKey: selection.productTypeKey }
          : undefined
      await onSubmit({ name: trimmed, quantity: parsedQuantity, unit, category, subcategory, placeKey, selection: persistedSelection })
      onClose()
    } catch (err) {
      console.error('Adding pantry stock failed', err)
      setError(err instanceof Error ? err.message : 'Položku se nepodařilo přidat do zásob.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Přidat do zásob"
      description="Dar, vlastní produkce nebo jiná položka zdarma. Do rozpočtu se nic nezapíše."
      initialFocus={nameRef}
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* The form lives in the scrolling body; this footer button submits it through form=. */}
          <Button type="submit" form="pantry-add-form" size="lg" className="w-full" disabled={saving}>
            {saving ? 'Přidávám…' : 'Přidat do zásob'}
          </Button>
        </>
      }
    >
      <form id="pantry-add-form" onSubmit={submit} className="space-y-4">
        <Field label="Produkt">
          {(p) => (
            <ProductAutocomplete
              {...p}
              ref={nameRef}
              value={name}
              onChange={(value) => {
                setName(value)
                setSelection(undefined)
              }}
              onSelect={(value) => {
                setSelection(value)
                if (value.category) setCategory(value.category as ItemCategory)
                if (value.unit) setUnit(value.unit as ItemUnit)
              }}
              placeholder="Např. vejce nebo kuřecí maso"
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Množství">{(p) => <Input {...p} type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />}</Field>
          <Field label="Jednotka">
            {(p) => (
              <Select {...p} value={unit} onChange={(event) => setUnit(event.target.value as ItemUnit)}>
                {UNITS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Kategorie">
          {(p) => (
            <Select
              {...p}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as ItemCategory)
                setSubcategory(null)
              }}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {subcategories.length > 0 && (
          <Field label="Podkategorie">
            {(p) => (
              <Select {...p} value={subcategory ?? ''} onChange={(event) => setSubcategory(event.target.value || null)}>
                <option value="">Nezařazeno</option>
                {subcategories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Umístění">
          {(p) => (
            <Select {...p} value={placeKey} onChange={(event) => setPlaceKey(event.target.value)}>
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                  {option.custom ? ` (${option.area})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Sheet>
  )
}
