'use client'

import { cn } from '@/lib/utils'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
  /** A small count on the segment (e.g. receipts waiting); 0 or undefined shows nothing. */
  badge?: number
}

/** The view switcher inside a tab (Nákupní seznam / Moje nákupy / Účtenky). Segments wrap onto a new
 *  line on a narrow screen instead of scrolling sideways. */
function SegmentedControl<T extends string>({ options, value, onChange, label, className }: { options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'relative min-h-10 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-accent-subtle',
            )}
          >
            {option.label}
            {option.badge ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold leading-none text-white">
                {option.badge > 9 ? '9+' : option.badge}
                <span className="sr-only"> čeká na vyřízení</span>
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
