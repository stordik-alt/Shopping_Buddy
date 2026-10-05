import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Says what is missing and what the user can do next; the action is usually one button. */
function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-2xl bg-muted/60 px-5 py-8 text-center', className)}>
      {icon && (
        <span className="text-fg-muted [&_svg]:size-8" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export { EmptyState }
