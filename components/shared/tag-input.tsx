import { useState } from 'react'
import { X } from 'lucide-react'

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  function addTag() {
    const value = draft.trim()
    if (!value || values.includes(value)) return
    onChange([...values, value])
    setDraft('')
  }

  function removeTag(value: string) {
    onChange(values.filter((tag) => tag !== value))
  }

  return (
    <div className="min-w-0">
      <p className="text-sm">{label}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          onClick={addTag}
          className="min-h-10 shrink-0 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Přidat
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((tag) => (
            <span key={tag} className="flex max-w-full items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium break-words">
              <span className="min-w-0 break-words">{tag}</span>
              <button aria-label={`Odebrat ${tag}`} onClick={() => removeTag(tag)} className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
