import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

// Status is never colour alone: the label (or an icon) must say it — OK / Ke schválení / Chyba / Duplicita.
const badgeVariants = cva('inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-tight', {
  variants: {
    tone: {
      neutral: 'bg-muted text-fg-secondary',
      accent: 'bg-accent-subtle text-accent-text',
      success: 'bg-success-subtle text-success',
      warning: 'bg-warning-subtle text-warning',
      danger: 'bg-destructive-subtle text-destructive',
      info: 'bg-info-subtle text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { Badge, badgeVariants }
