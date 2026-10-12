'use client'

import { DOSE_TYPE_KEYS, ITEM_UNITS, unitLabel } from '@/lib/units'
import { useState } from 'react'
import { PackageCheck, Trash2 } from 'lucide-react'
import { CollapsibleSection } from '@/components/shared/collapsible-section'
import { ConfirmRemoveButton } from '@/components/shared/confirm-remove-button'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { userFacingError } from '@/lib/errors'
import { validateStockLevels, type StockLevel } from '@/lib/pantry-restock'
import { PRODUCT_TYPES } from '@/lib/product-types'
import type { ItemUnit } from '@/lib/types'

const UNITS = ITEM_UNITS
const TYPES_BY_NAME = [...PRODUCT_TYPES].sort((a, b) => a.name.localeCompare(b.name, 'cs'))
const amount = (value: number) => String(Math.round(value * 1000) / 1000).replace('.', ',')
const parse = (text: string) => (text.trim() === '' ? null : Number(text.trim().replace(',', '.')))

/** Profil → Hlídané zásoby: the wanted stock per TYPE of goods ("Máslo": 2–6 ks), not per product. When the
 *  stock of the whole type nears the minimum and a preferred chain runs a promotion on any product of the
 *  type, Domů suggests the cheapest one and how much to buy up to the maximum (lib/pantry-restock.ts). */
export function StockLevelsSettings({
  levels,
  onSave,
  onRemove,
}: {
  levels: StockLevel[]
  onSave: (productTypeKey: string, min: number, max: number, unit: ItemUnit) => Promise<void>
  onRemove: (levelId: string) => Promise<void>
}) {
  const [typeName, setTypeName] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [unit, setUnit] = useState<ItemUnit>('ks')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = TYPES_BY_NAME.find((type) => type.name.toLowerCase() === typeName.trim().toLowerCase())

  function pickType(name: string) {
    setTypeName(name)
    const type = TYPES_BY_NAME.find((entry) => entry.name.toLowerCase() === name.trim().toLowerCase())
    if (type) {
      setUnit(DOSE_TYPE_KEYS.has(type.key) ? 'dávka' : type.unit)
      // Editing a type that is already watched starts from its current levels.
      const existing = levels.find((level) => level.productTypeKey === type.key)
      if (existing) {
        setMin(String(existing.minQuantity))
        setMax(String(existing.maxQuantity))
        setUnit(existing.unit)
      }
    }
  }

  async function submit() {
    if (!selected) return setError('Vyberte druh zboží ze seznamu.')
    const minValue = parse(min)
    const maxValue = parse(max)
    const problem = validateStockLevels(minValue, maxValue)
    if (problem || minValue == null || maxValue == null) return setError(problem ?? 'Vyplňte minimum i maximum.')
    setBusy(true)
    setError('')
    try {
      await onSave(selected.key, minValue, maxValue, unit)
      setTypeName('')
      setMin('')
      setMax('')
    } catch (err) {
      setError(userFacingError(err, 'Nepodařilo se uložit. Zkuste to prosím znovu.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(levelId: string) {
    setBusy(true)
    setError('')
    try {
      await onRemove(levelId)
    } catch (err) {
      setError(userFacingError(err, 'Nepodařilo se odebrat. Zkuste to prosím znovu.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <CollapsibleSection
      title="Hlídané zásoby"
      icon={<PackageCheck />}
      summary={levels.length > 0 ? `Hlídáno druhů zboží: ${levels.length}` : 'Nic nehlídáno'}
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nastavte, kolik čeho chcete mít doma — podle druhu zboží (třeba „Máslo“), ne podle jedné značky. Když zásoba klesne k minimu a ve vašem prioritním obchodě je akce, aplikace nabídne nejlevnější variantu a doplnění do maxima.
      </p>

      {levels.length > 0 && (
        <ul className="mt-4 space-y-2">
          {levels.map((level) => (
            <li key={level.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => pickType(level.typeName)} aria-label={`Upravit ${level.typeName}`}>
                <span className="block break-words text-sm font-medium">{level.typeName}</span>
                <span className="block text-xs text-muted-foreground">
                  minimum {amount(level.minQuantity)} · maximum {amount(level.maxQuantity)} {unitLabel(level.maxQuantity, level.unit)}
                </span>
              </button>
              <ConfirmRemoveButton label={`hlídání ${level.typeName}`} onConfirm={() => void remove(level.id)} disabled={busy}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </ConfirmRemoveButton>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <Field label="Druh zboží" hint="Začněte psát, např. Máslo, Mléko, Toaletní papír.">
          {(props) => (
            <>
              <Input {...props} list="stock-level-types" value={typeName} onChange={(event) => pickType(event.target.value)} autoComplete="off" />
              <datalist id="stock-level-types">
                {TYPES_BY_NAME.map((type) => (
                  <option key={type.key} value={type.name} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Minimum">{(props) => <Input {...props} inputMode="decimal" value={min} onChange={(event) => setMin(event.target.value)} />}</Field>
          <Field label="Maximum">{(props) => <Input {...props} inputMode="decimal" value={max} onChange={(event) => setMax(event.target.value)} />}</Field>
          <Field label="Jednotka">
            {(props) => (
              <Select {...props} value={unit} onChange={(event) => setUnit(event.target.value as ItemUnit)}>
                {UNITS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'dávka' ? 'dávky' : option}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? 'Ukládám…' : 'Uložit hlídání'}
        </Button>
      </div>
    </CollapsibleSection>
  )
}
