export function AnitkaAvatar({ className = '' }: { className?: string }) {
  return (
    <span className={`relative block aspect-square overflow-hidden rounded-full bg-primary ring-2 ring-background ${className}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- approved static mascot asset */}
      <img
        src="/brand/anitka/anitka-guide-front.webp"
        alt=""
        width={300}
        height={417}
        className="absolute left-1/2 top-0 h-[215%] w-auto max-w-none -translate-x-1/2 object-cover object-top"
      />
    </span>
  )
}

export function Brand({
  compact = false,
  assistantOpen,
  onOpenAssistant,
}: {
  compact?: boolean
  assistantOpen: boolean
  onOpenAssistant: () => void
}) {
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
          <span className="block text-xs font-medium text-fg-muted">Chat s Anitkou</span>
        </div>
      )}
    </button>
  )
}
