import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { DIET_AVOIDS, DIETS, NO_DIET, type DietAvoidKey, type DietKey, type MemberDiet } from '@/lib/diet'
import { cn } from '@/lib/utils'

/** The clickable eating questionnaire for one member (docs/17_DIET_PREFERENCES.md): one diet, then
 *  what they avoid. The meal plan and recipe suggestions leave out what does not suit every member. */
export function DietQuestionnaire({
  memberName,
  initial,
  onClose,
  onSave,
}: {
  memberName: string
  initial: MemberDiet | undefined
  onClose: () => void
  onSave: (answers: MemberDiet) => Promise<void>
}) {
  const [diet, setDiet] = useState<DietKey>((initial ?? NO_DIET).diet)
  const [avoids, setAvoids] = useState<DietAvoidKey[]>((initial ?? NO_DIET).avoids)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (key: DietAvoidKey) => setAvoids((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]))

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave({ diet, avoids: DIET_AVOIDS.map((avoid) => avoid.key).filter((key) => avoids.includes(key)) })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Odpovědi se nepodařilo uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Stravování: ${memberName}`}
      description="Návrh jídelníčku a recepty vynechají, co některému členovi nesedí."
      footer={
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={() => void save()} disabled={busy}>
            {busy ? 'Ukládám…' : 'Uložit'}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="text-sm font-semibold">1. Jak se stravuje?</legend>
        <div role="radiogroup" aria-label="Způsob stravování" className="mt-3 grid gap-2 sm:grid-cols-2">
          {DIETS.map((option) => {
            const selected = diet === option.key
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDiet(option.key)}
                className={cn(
                  'flex min-h-14 items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-accent-solid bg-accent-subtle' : 'border-border bg-card hover:bg-muted',
                )}
              >
                <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-accent-solid bg-accent-solid text-accent-solid-foreground' : 'border-border')}>
                  {selected && <Check className="size-3" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-fg-muted">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold">2. Čemu se vyhýbá?</legend>
        <p className="mt-1 text-xs text-fg-muted">Vyberte vše, co platí — třeba kvůli nesnášenlivosti nebo chuti.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIET_AVOIDS.map((option) => {
            const selected = avoids.includes(option.key)
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(option.key)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-accent-solid bg-accent-subtle font-medium' : 'border-border bg-card hover:bg-muted',
                )}
              >
                {selected && <Check className="size-4 shrink-0" aria-hidden="true" />}
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>
    </Sheet>
  )
}
