/**
 * A short message with one way back ("Vrátit zpět"), floating above the bottom navigation.
 * `raised` lifts it above the sticky "Dokončit nákup" button so the two never overlap.
 */
export function UndoToast({ message, onUndo, raised = false }: { message: string; onUndo: () => void; raised?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 lg:bottom-6 ${
        raised ? 'bottom-[calc(9.25rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(5.25rem+env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-primary py-1.5 pr-1.5 pl-4 text-sm text-primary-foreground shadow-elevated motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
        <span className="min-w-0 break-words">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="min-h-11 shrink-0 rounded-xl px-3 font-semibold text-accent-solid hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Vrátit zpět
        </button>
      </div>
    </div>
  )
}
