'use client'

import { describeItemTypes, productTypeByKey, productTypeOptions, resolveListItemTypes } from '@/lib/product-types'

// The product type of a shopping-list item (docs/12_PRODUCT_TYPES.md, phase 3): which kind of goods
// the shopping planner may offer for it. An item that names a group ("Kuřecí maso") shows the group's
// types as checkboxes, all ticked by default; any item can be given a type or group by hand, or left
// to its name. Only the choice is made here — what it means for the planner is lib/product-types.ts.

const OPTIONS = productTypeOptions()
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((key) => b.includes(key))

export function ItemTypePicker({ name, productTypes, onChange }: { name: string; productTypes: string[] | null | undefined; onChange: (productTypes: string[] | null) => void }) {
  const choice = describeItemTypes(name, productTypes)
  const byName = resolveListItemTypes(name)
  const selected = choice.source === 'chosen' ? OPTIONS.find((option) => sameSet(option.types, choice.accepted ?? []))?.value ?? (choice.group ? `group:${choice.group.key}` : '') : ''

  /** Stores a choice — or nothing, when it is exactly what the name already gives. */
  function save(types: string[]) {
    onChange(byName && sameSet(byName.types, types) ? null : types)
  }

  function toggle(key: string) {
    const current = choice.accepted ?? []
    const next = current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    if (next.length > 0) save(next)
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">
        Druh zboží
        <select
          aria-label={`Druh zboží ${name}`}
          value={selected}
          onChange={(event) => {
            const option = OPTIONS.find((entry) => entry.value === event.target.value)
            if (option) save(option.types)
            else onChange(null)
          }}
          className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="">{byName ? `Podle názvu: ${byName.name}` : 'Podle názvu (automaticky)'}</option>
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {choice.group && choice.accepted && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Které druhy plánovač může nabídnout</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {choice.group.types.map((key) => (
              <label key={key} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={choice.accepted?.includes(key) ?? false}
                  // The last ticked type cannot be unticked: an item asks for at least one kind.
                  disabled={choice.accepted?.length === 1 && choice.accepted[0] === key}
                  onChange={() => toggle(key)}
                  className="size-4 accent-primary"
                />
                {productTypeByKey(key)?.name ?? key}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="text-xs text-muted-foreground">
        {choice.source === null
          ? 'Hledá se podle názvu — výsledek nemusí být přesný. Vyberte druh, ať plánovač nabízí jen to správné.'
          : 'Plánovač nabídne jen zboží tohoto druhu, nejlevnější pro potřebné množství.'}
      </p>
    </div>
  )
}
