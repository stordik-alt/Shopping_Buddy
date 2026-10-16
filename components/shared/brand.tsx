export function AnitkaAvatar({ className = '' }: { className?: string }) {
  return (
    <span className={`relative block aspect-square overflow-hidden rounded-full bg-transparent ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- approved static mascot asset */}
      <img
        src="/brand/anitka/anitka-guide-front.webp"
        alt=""
        width={300}
        height={417}
        className="absolute left-1/2 top-0 h-[215%] w-auto max-w-none -translate-x-[62%] object-cover object-top"
      />
    </span>
  )
}

export function Brand({
  compact = false,
  assistantOpen = false,
  onOpenAssistant,
}: {
  compact?: boolean
  assistantOpen?: boolean
  onOpenAssistant?: () => void
}) {
  if (!onOpenAssistant) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary p-1 shadow-sm ring-1 ring-primary/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
          <img src="/brand/anitka-avatar.png" alt="" width={36} height={36} className="h-full w-full rounded-xl object-cover" />
        </div>
        {!compact && (
          <div className="min-w-0">
            <span className="block text-[1.05rem] font-bold tracking-[-0.02em] text-primary">ANITKA</span>
            <span className="block text-xs font-medium uppercase tracking-[0.12em] text-fg-muted">Asistent pro domácnost</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpenAssistant}
      aria-label="Otevřít chat s Anitkou"
      aria-haspopup="dialog"
      aria-expanded={assistantOpen}
      aria-controls="assistant-chat"
      className="group flex min-w-0 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative block size-11 shrink-0 rounded-full bg-accent-subtle p-0.5 shadow-sm transition-transform group-hover:scale-105">
        <AnitkaAvatar className="size-full" />
        <span className="absolute -bottom-0.5 right-0 size-3 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden="true" />
      </span>
      {!compact && (
        <div className="min-w-0">
          <span className="block text-[1.05rem] font-bold tracking-[-0.02em] text-primary">ANITKA</span>
          <span className="block text-xs font-medium text-fg-muted">Asistent pro domácnost</span>
        </div>
      )}
    </button>
  )
}
