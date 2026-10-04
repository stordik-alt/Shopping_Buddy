import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function CollapsibleSection({
  title,
  summary,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  /** One short line shown while the section is closed, so the user can tell what is inside without opening it. */
  summary?: string
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <section className="surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-16 w-full items-center gap-3 rounded-[inherit] p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {icon && <span className="shrink-0 text-accent-text" aria-hidden="true">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {summary && !open && <span className="mt-0.5 block truncate text-sm text-fg-muted">{summary}</span>}
        </span>
        <ChevronDown className={`size-5 shrink-0 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {/* Kept mounted (only hidden) so unsaved drafts in forms survive closing the section. */}
      <div id={panelId} hidden={!open} className="px-5 pb-5">
        {children}
      </div>
    </section>
  )
}
