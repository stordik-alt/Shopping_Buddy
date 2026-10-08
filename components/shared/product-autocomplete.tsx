'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { searchManualProductSuggestionsAction, type ManualProductSuggestion } from '@/app/actions/manual-product-suggestions'
import { Input } from '@/components/ui/field'

export type ProductAutocompleteSelection = ManualProductSuggestion

export const ProductAutocomplete = forwardRef<HTMLInputElement, {
  value: string
  onChange: (value: string) => void
  onSelect?: (suggestion: ProductAutocompleteSelection) => void
  placeholder?: string
  ariaLabel?: string
}>(({ value, onChange, onSelect, placeholder, ariaLabel }, ref) => {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<ManualProductSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const query = value.trim()
    if (query.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    const id = ++requestId.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchManualProductSuggestionsAction(query)
        .then((result) => {
          if (id !== requestId.current) return
          setSuggestions(result)
          setOpen(result.length > 0)
        })
        .catch(() => {
          if (id === requestId.current) setSuggestions([])
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false)
        })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [value])

  return (
    <div className="relative">
      <Input
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <div role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-elevated">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.kind === 'type' ? 'type:' + suggestion.productTypeKey : 'product:' + suggestion.productId}
              type="button"
              role="option"
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(suggestion.label)
                onSelect?.(suggestion)
                setOpen(false)
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{suggestion.label}</span>
                <span className="block text-xs text-fg-muted">{suggestion.kind === 'type' ? 'Druh zboží' : 'Konkrétní produkt'}</span>
              </span>
              {suggestion.unit && <span className="shrink-0 text-xs text-fg-muted">{suggestion.unit}</span>}
            </button>
          ))}
          {loading && <p className="px-3 py-2 text-xs text-fg-muted">Hledám…</p>}
        </div>
      )}
    </div>
  )
}


ProductAutocomplete.displayName = 'ProductAutocomplete'
