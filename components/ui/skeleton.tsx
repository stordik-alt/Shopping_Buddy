import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** A loading placeholder; give it the size of the content it stands in for so the page does not jump. */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn('animate-pulse rounded-xl bg-muted', className)} {...props} />
}

export { Skeleton }
