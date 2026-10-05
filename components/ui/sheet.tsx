'use client'

import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'

/** The one accessible modal for the app: a bottom sheet on a phone, a centred dialog from `sm` up.
 *  Focus is trapped inside, Escape and the backdrop close it, and `role="dialog"` with its title is
 *  provided by the primitive — replacing the hand-built `fixed inset-0` overlays. */
function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocus,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** Stays visible under a scrolling body — the place for the primary action of a long form. */
  footer?: ReactNode
  /** The field to start in (e.g. the amount of a new expense); by default the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <Dialog.Popup initialFocus={initialFocus ?? true} className={cn('flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface-elevated text-foreground shadow-elevated outline-none sm:rounded-3xl', className)}>
            <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <div className="min-w-0">
                <Dialog.Title className="break-words text-lg font-semibold">{title}</Dialog.Title>
                {description && <Dialog.Description className="mt-1 text-sm text-fg-secondary">{description}</Dialog.Description>}
              </div>
              <Dialog.Close aria-label="Zavřít" className="icon-button shrink-0">
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
            {footer && <div className="flex flex-col gap-2 border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { Sheet }
