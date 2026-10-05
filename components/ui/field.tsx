import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

// The shared look of every form control: 44 px tall, turquoise focus ring. Replaces the hand-copied
// `min-h-11 rounded-xl border border-input …` strings.
const CONTROL =
  'min-h-11 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-fg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(CONTROL, className)} {...props} />
}

function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(CONTROL, className)} {...props} />
}

type ControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }

/** A label, a control, an optional hint and an error message, wired together for screen readers.
 *  `children` receives the ids to put on the control: `{(p) => <Input {...p} />}`. */
function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: (props: ControlProps) => ReactNode; className?: string }) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { Field, Input, Select }
