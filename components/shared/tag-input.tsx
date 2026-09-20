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
    <div>
      <p className="text-sm">{label}</p>
      <div className="mt-2 flex gap-2">
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
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button onClick={addTag} className="rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          Přidat
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {tag}
              <button aria-label={`Odebrat ${tag}`} onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
