import type { ReactNode } from 'react'
import { CollapsibleSection } from '@/components/shared/collapsible-section'

/** A collapsible block of Rozpočet → Plánování. On a phone a stack of full cards is too long to scan, so
 *  each block is one tappable row (title + one line saying what is inside) that opens on demand. The
 *  content stays mounted while closed, so a half-typed form survives closing it. */
export function Panel({
  title,
  summary,
  description,
  action,
  defaultOpen,
  children,
}: {
  title: string
  /** What is inside, in one short line, shown while the block is closed. */
  summary?: string
  /** What the block is for; shown at the top once it is open. */
  description?: string
  /** The block's main button (e.g. "Přidat"), shown above its content once open. */
  action?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <CollapsibleSection title={title} summary={summary} defaultOpen={defaultOpen}>
      {description && <p className="text-sm text-fg-secondary">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
      <div className="mt-4">{children}</div>
    </CollapsibleSection>
  )
}
