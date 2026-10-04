import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// One card shape for the whole app: a calm rounded surface that is a quick overview and the way into
// a detail. `interactive` is for a whole card that is a single tap target (focus ring, pressed state);
// a card with its own inner buttons must stay non-interactive.
const cardVariants = cva('block w-full min-w-0 rounded-2xl border p-4 text-card-foreground sm:p-5', {
  variants: {
    tone: {
      default: 'border-border bg-card shadow-[var(--shadow-card)]',
      elevated: 'border-border bg-surface-elevated shadow-elevated',
      muted: 'border-transparent bg-muted',
      accent: 'border-transparent bg-accent-subtle',
    },
    interactive: {
      true: 'cursor-pointer text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted',
      false: '',
    },
  },
  defaultVariants: { tone: 'default', interactive: false },
})

function Card({ className, tone, interactive, ...props }: ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ tone, interactive }), className)} {...props} />
}

/** A card that is one button, e.g. a dashboard overview card leading to its detail. */
function CardButton({ className, tone, ...props }: ComponentProps<'button'> & Pick<VariantProps<typeof cardVariants>, 'tone'>) {
  return <button type="button" data-slot="card" className={cn(cardVariants({ tone, interactive: true }), className)} {...props} />
}

/** Title row of a card: icon + title on the left, an optional action or chevron on the right.
 *  Inside a `CardButton` pass `as="span"`: a button may contain phrasing content only, no headings. */
function CardHeader({ title, icon, action, as: Title = 'h3', className }: { title: string; icon?: ReactNode; action?: ReactNode; as?: 'h2' | 'h3' | 'span'; className?: string }) {
  return (
    <span className={cn('flex items-center justify-between gap-3', className)}>
      <Title className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        {icon && (
          <span className="shrink-0 text-accent-text" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="min-w-0 break-words">{title}</span>
      </Title>
      {action && <span className="shrink-0 text-fg-muted">{action}</span>}
    </span>
  )
}

export { Card, CardButton, CardHeader, cardVariants }
