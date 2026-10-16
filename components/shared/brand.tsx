export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {compact ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary p-1 shadow-sm ring-1 ring-primary/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
          <img src="/brand/anitka-avatar.png" alt="" width={36} height={36} className="h-full w-full rounded-xl object-cover" />
        </div>
      ) : (
        <div className="min-w-0">
          <div className="inline-flex rounded-xl bg-white px-2 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- approved static brand asset */}
            <img src="/brand/anitka/anitka-logo.png" alt="ANITKA" width={2172} height={724} className="h-auto w-full max-w-44" />
          </div>
          <span className="mt-1 block text-xs font-medium uppercase tracking-[0.12em] text-fg-muted">Asistent pro domácnost</span>
        </div>
      )}
    </div>
  )
}
